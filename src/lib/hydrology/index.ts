/**
 * Perform Muskingum Flood Routing to estimate downstream outflow
 * from an inflow hydrograph using the Muskingum method.
 *
 * @param {number[]} inflows - Array of inflow values (e.g., discharge in m³/s)
 * @param {number} K - Storage time constant (hours or time units)
 * @param {number} X - Weighting factor (0 ≤ X ≤ 0.5)
 * @param {number} dt - Time step (same unit as K)
 * @returns {number[]} outflows - Array of routed outflow values
 */
export const muskingumRouting = (
  inflows: number[],
  K: number,
  X: number,
  dt: number,
): number[] => {
  try {
    const denom = K * (1 - X) + 0.5 * dt;
    const C0 = (-K * X + 0.5 * dt) / denom;
    const C1 = (K * X + 0.5 * dt) / denom;
    const C2 = (K * (1 - X) - 0.5 * dt) / denom;
    const outflows = [];
    outflows[0] = inflows[0]; // assume start

    for (let t = 1; t < inflows.length; t++) {
      outflows[t] = C0 * inflows[t] + C1 * inflows[t - 1] + C2 * outflows[t - 1];
    }

    return outflows;
  } catch (e) {
    console.error('Error in muskingumRouting:', e);
    return [];
  }
};

/**
 * Forecast n hours ahead using Muskingum routing.
 *
 * Inputs:
 *  - inflows: array of past inflows [I_{t-m+1} ... I_t] (m >= 2 recommended)
 *  - lastOutflow: O_t (most recently observed or last routed)
 *  - K, X, dt: Muskingum params (dt in same units as K, e.g., hours)
 *  - n: number of hours to forecast (integer)
 *  - inflowMethod: "persistence" | "linear" | "ar1" | "moving_avg"
 *  - inflowParams: optional object for method parameters (e.g., window for moving_avg)
 *  - ratingCurve: optional { type: 'power', a, b, h0 } for Q->h conversion
 *
 * Returns:
 *  { inflow_forecast: [...], outflow_forecast: [...], stage_forecast: [...], coeffs }
 */
export const forecastNHours = (props: {
  inflows: number[];
  lastOutflow: number;
  K: number;
  X: number;
  dt: number;
  n: number | 1;
  inflowMethod: string | 'persistence';
  inflowParams?: any;
  ratingCurve: any;
}) => {
  const {
    inflows,
    lastOutflow,
    K,
    X,
    dt = 1,
    n = 1,
    inflowMethod = 'persistence',
    inflowParams = {},
    ratingCurve = null,
  } = props;

  if (!Array.isArray(inflows) || inflows.length < 1) {
    throw new Error('Provide at least one inflow value.');
  }
  // compute Muskingum coefficients once (assumed constant)
  const denom = K * (1 - X) + 0.5 * dt;
  const C0 = (-K * X + 0.5 * dt) / denom;
  const C1 = (K * X + 0.5 * dt) / denom;
  const C2 = (K * (1 - X) - 0.5 * dt) / denom;

  // helper: simple inflow forecast for single step based on method and history
  function forecastNextInflow(history: number[]) {
    const m = history.length;
    const It = history[m - 1];
    const Itm1 = history[m - 2] ?? history[m - 1];

    switch (inflowMethod) {
      case 'linear':
        return Math.max(0, It + (It - Itm1)); // two-point linear extrapolation
      case 'ar1': {
        // estimate phi from history: phi = sum(It * It-1) / sum(It-1^2)
        if (m < 2) return It;
        let num = 0,
          den = 0;
        for (let i = 1; i < m; i++) {
          num += history[i] * history[i - 1];
          den += history[i - 1] * history[i - 1];
        }
        const phi = den === 0 ? 0 : num / den;
        return Math.max(0, phi * It);
      }
      case 'moving_avg': {
        const w = inflowParams.window || Math.min(3, m);
        const slice = history.slice(-w);
        const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
        return Math.max(0, avg);
      }
      case 'persistence':
      default:
        return Math.max(0, It); // persistence
    }
  }

  // prepare arrays
  const inflowForecast = [];
  const outflowForecast = [];
  const stageForecast = [];

  // copy mutable history for iterative forecasting (so we can append generated inflows)
  const histInflows = inflows.slice();
  let prevOutflow =
    typeof lastOutflow === 'number' ? lastOutflow : histInflows[histInflows.length - 1];

  for (let k = 1; k <= n; k++) {
    const I_next = forecastNextInflow(histInflows);
    // Muskingum routing formula: O_{t+1} = C0*I_{t+1} + C1*I_t + C2*O_t
    const I_t = histInflows[histInflows.length - 1];
    const O_next = C0 * I_next + C1 * I_t + C2 * prevOutflow;

    inflowForecast.push(I_next);
    outflowForecast.push(O_next);

    // convert to stage if rating curve provided
    let h_next = null;
    if (ratingCurve && ratingCurve.type === 'power') {
      const { a, b, h0 = 0 } = ratingCurve;
      if (a > 0 && b !== 0 && O_next >= 0) {
        h_next = h0 + Math.pow(O_next / a, 1 / b);
      }
    }
    stageForecast.push(h_next);

    // append to history for multi-step forecasting
    histInflows.push(I_next);
    prevOutflow = O_next;
  }

  return {
    inflow_forecast: inflowForecast,
    outflow_forecast: outflowForecast,
    stage_forecast: stageForecast,
    muskingum_coeffs: { C0, C1, C2 },
  };
};

// assume arrays h and Q (length n)
export const fitPowerLogLinear = (h: number[], Q: number[], h0 = 0) => {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < h.length; i++) {
    const hh = h[i] - h0;
    if (hh > 0 && Q[i] > 0) {
      x.push(Math.log(hh));
      y.push(Math.log(Q[i]));
    }
  }
  const n = x.length;
  if (n < 2) throw new Error('Not enough valid points');

  const sumx = x.reduce((s, v) => s + v, 0);
  const sumy = y.reduce((s, v) => s + v, 0);
  const sumxx = x.reduce((s, v) => s + v * v, 0);
  const sumxy = x.reduce((s, v, i) => s + v * y[i], 0);

  const b = (n * sumxy - sumx * sumy) / (n * sumxx - sumx * sumx);
  const lnA = (sumy - b * sumx) / n;
  const a = Math.exp(lnA);
  return { a, b, h0 };
};

//

// muskingum routing single pass
function muskingumRouteStep(
  I_next: number,
  I_t: number,
  O_t: number,
  K: number,
  X: number,
  dt: number,
): number {
  const denom = K * (1 - X) + 0.5 * dt;
  const C0 = (-K * X + 0.5 * dt) / denom;
  const C1 = (K * X + 0.5 * dt) / denom;
  const C2 = (K * (1 - X) - 0.5 * dt) / denom;
  const O_next = C0 * I_next + C1 * I_t + C2 * O_t;
  return O_next;
}

interface RatingCurvePower {
  type: 'power';
  a: number;
  b: number;
  h0?: number;
}

interface ForecastP1FromP67Params {
  inflows: number[];
  lastOutflow: number;
  K: number;
  X: number;
  dt?: number;
  n?: number;
  inflowMethod?: 'persistence' | 'linear' | 'ar1';
  ratingCurveP1?: RatingCurvePower | null;
}

/**
 * Forecast P1 from P67
 * @param params - Forecast parameters
 * @returns Object with inflow, outflow, and stage forecasts
 */
export function forecastP1FromP67({
  inflows,
  lastOutflow,
  K,
  X,
  dt = 1,
  n = 6,
  inflowMethod = 'persistence',
  ratingCurveP1 = null,
}: ForecastP1FromP67Params): {
  inflow_forecast: number[];
  outflow_forecast: number[];
  stage_forecast: (number | null)[];
} {
  const hist = inflows.slice();
  let Oprev = lastOutflow;
  const Iseries: number[] = [];
  const Oseries: number[] = [];
  const Hseries: (number | null)[] = [];

  function forecastNextInflow(history: number[]): number {
    const m = history.length;
    const It = history[m - 1];
    const Itm1 = history[m - 2] ?? It;
    if (inflowMethod === 'linear') return Math.max(0, It + (It - Itm1));
    if (inflowMethod === 'ar1') {
      if (m < 2) return It;
      let num = 0,
        den = 0;
      for (let i = 1; i < m; i++) {
        num += history[i] * history[i - 1];
        den += history[i - 1] * history[i - 1];
      }
      const phi = den === 0 ? 0 : num / den;
      return Math.max(0, phi * It);
    }
    return Math.max(0, It);
  }

  for (let k = 1; k <= n; k++) {
    const I_next = forecastNextInflow(hist);
    const I_t = hist[hist.length - 1];
    const O_next = muskingumRouteStep(I_next, I_t, Oprev, K, X, dt);

    Iseries.push(I_next);
    Oseries.push(O_next);

    // convert Q->stage if ratingCurve provided {type:'power',a,b,h0}
    if (ratingCurveP1 && ratingCurveP1.type === 'power') {
      const { a, b, h0 = 0 } = ratingCurveP1;
      Hseries.push(O_next >= 0 ? h0 + Math.pow(O_next / a, 1.0 / b) : null);
    } else {
      Hseries.push(null);
    }

    hist.push(I_next);
    Oprev = O_next;
  }

  return {
    inflow_forecast: Iseries,
    outflow_forecast: Oseries,
    stage_forecast: Hseries,
  };
}
