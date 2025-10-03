import { ForecastStep } from '../hydro';

export type ErrorMetrics = {
  n: number; // จำนวนข้อมูลที่เปรียบเทียบ
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Square Error
  bias: number; // Mean Error
  obs: number[]; // observed values used
  pred: number[]; // predicted values used
};

export function calcHeightError(result: ForecastStep[], testSet: number[]): ErrorMetrics {
  const n = Math.min(result.length, testSet.length);
  if (n === 0) {
    return { n: 0, mae: NaN, rmse: NaN, bias: NaN, obs: [], pred: [] };
  }

  const obs: number[] = [];
  const pred: number[] = [];
  let absErrSum = 0;
  let sqErrSum = 0;
  let errSum = 0;

  for (let i = 0; i < n; i++) {
    const hPred = result[i].h_m;
    const hObs = testSet[i];
    const err = hPred - hObs;

    obs.push(hObs);
    pred.push(hPred);

    absErrSum += Math.abs(err);
    sqErrSum += err * err;
    errSum += err;
  }

  return {
    n,
    mae: absErrSum / n,
    rmse: Math.sqrt(sqErrSum / n),
    bias: errSum / n,
    obs,
    pred,
  };
}
