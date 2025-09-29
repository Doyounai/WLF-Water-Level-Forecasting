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
 * Simple 1-hour-ahead forecast using:
 *  - inflowForecastMethod: "persistence" | "linear" | "ar1"
 *  - muskingum parameters: K, X, dt (hours)
 *  - ratingCurve: { type: 'power', a, b, h0 }  // Q = a*(h-h0)^b
 *
 * Inputs:
 *  inflows: array of recent inflow values [I_{t-N+1}, ..., I_t]
 *  lastOutflow: O_t (most recent observed or routed outflow)
 */
export const forecastNextHour = (props: {
  inflows: number[];
  lastOutflow: number;
  K: number;
  X: number;
  dt: number;
  inflowForecastMethod: string | 'persistence';
  ratingCurve: any;
}) => {
  const {
    inflows,
    lastOutflow,
    K,
    X,
    dt,
    inflowForecastMethod = 'persistence',
    ratingCurve = null,
  } = props;

  if (!inflows || inflows.length < 2) {
    throw new Error(
      'Need at least 2 inflow points for better methods; persistence can work with 1.',
    );
  }

  const I_t = inflows[inflows.length - 1];
  const I_tm1 = inflows[inflows.length - 2];

  // 1) forecast I_{t+1}
  let I_tp1;
  switch (inflowForecastMethod) {
    case 'linear':
      I_tp1 = I_t + (I_t - I_tm1); // two-point linear
      break;
    case 'ar1': {
      // estimate phi from last few points via simple OLS (phi = sum(It*It-1)/sum(It-1^2))
      let num = 0,
        den = 0;
      for (let i = 1; i < inflows.length; i++) {
        num += inflows[i] * inflows[i - 1];
        den += inflows[i - 1] * inflows[i - 1];
      }
      const phi = den === 0 ? 0 : num / den;
      I_tp1 = phi * I_t;
      break;
    }
    case 'persistence':
    default:
      I_tp1 = I_t;
  }

  // ensure non-negative
  if (I_tp1 < 0) I_tp1 = 0;

  // 2) Muskingum coefficients
  const denom = K * (1 - X) + 0.5 * dt;
  const C0 = (-K * X + 0.5 * dt) / denom;
  const C1 = (K * X + 0.5 * dt) / denom;
  const C2 = (K * (1 - X) - 0.5 * dt) / denom;

  // 3) route to get O_{t+1}
  const O_tp1 = C0 * I_tp1 + C1 * I_t + C2 * lastOutflow;

  // 4) convert to stage if rating curve provided
  let h_tp1 = null;
  if (ratingCurve) {
    if (ratingCurve.type === 'power') {
      const { a, b, h0 = 0 } = ratingCurve;
      if (a > 0 && b !== 0 && O_tp1 >= 0) {
        h_tp1 = h0 + Math.pow(O_tp1 / a, 1 / b);
      }
    } else if (ratingCurve.type === 'polynomial') {
      // ratingCurve.coeffs: [c0, c1, c2, ...] where Q = c0 + c1*h + c2*h^2 ...
      // Inversion requires numeric solve (Newton). Implement if needed.
      h_tp1 = null; // implement numeric invert if you have polynomial
    }
  }

  return {
    inflow_forecast: I_tp1,
    outflow_forecast: O_tp1,
    stage_forecast: h_tp1,
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