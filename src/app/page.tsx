import Image from 'next/image';

import {
  muskingumRouting,
  fitPowerLogLinear,
  forecastNHours,
  forecastP1FromP67,
} from '@/lib/hydrology';

export default function Home() {
  // 12-18 29/09/2025
  // const inflows = [253.6, 251.4, 251.4, 249.2, 245.0, 243.0]; // m3/s
  // const K = 6; // hours
  // const X = 0.5;
  // const dt = 1; // hour
  // console.log('muskingumRouting : ', muskingumRouting(inflows, K, X, dt));

  // const result = forecastNextHour({
  //   inflows: [253.6, 251.4, 251.4, 249.2, 245.0, 243.0], // I_{t-2}, I_{t-1}, I_t
  //   lastOutflow: 251.84026178636984, // O_t
  //   K: 6, // hours
  //   X: 0.5,
  //   dt: 1,
  //   inflowForecastMethod: 'ar1',
  //   ratingCurve: { type: 'power', a: 65, b: 1.5, h0: 0 },
  // });
  // console.log(result);

  const h = [
    3.14, 3.12, 3.12, 3.13, 3.13, 3.13, 3.13, 3.14, 3.15, 3.19, 3.22, 3.27, 3.34, 3.41,
    3.49, 3.58, 3.66, 3.74, 3.81, 3.86, 3.89, 3.93, 3.93, 3.93, 3.91, 3.89, 3.83, 3.77,
    3.7, 3.62, 3.56, 3.5, 3.42, 3.36, 3.3, 3.24, 3.18, 3.12, 3.07, 3.02, 2.99, 2.93, 2.88,
    2.83, 2.79, 2.74, 2.7, 2.66, 2.63, 2.6, 2.57, 2.55, 2.54, 2.54, 2.54, 2.54, 2.53,
    2.53, 2.53, 2.53, 2.52, 2.52, 2.51, 2.49, 2.48, 2.45, 2.44, 2.42, 2.41, 2.4, 2.38,
    2.36,
  ];
  const q = [
    358.6, 356.8, 356.8, 357.7, 357.7, 357.7, 357.7, 358.6, 359.5, 363.1, 366, 371, 378,
    385, 393, 402.8, 411.6, 420.4, 428.1, 433.6, 436.9, 441.6, 441.6, 441.6, 439.2, 436.9,
    430.3, 423.7, 416, 407.2, 400.6, 394, 386, 380, 374, 368, 362.2, 356.8, 352.6, 348.6,
    346.2, 341.4, 334.2, 322.2, 312.6, 300.6, 291, 282.2, 275.6, 269, 262.4, 258, 255.8,
    255.8, 255.8, 255.8, 253.6, 253.6, 253.6, 253.6, 251.4, 251.4, 249.2, 245, 243, 237,
    235, 231, 229, 227, 223.6, 220.2,
  ];
  const h0 = 0;
  console.log(fitPowerLogLinear(h, q, h0));

  // 12-18 29/09/2025
  // const inflows = [
  //   358.6, 356.8, 356.8, 357.7, 357.7, 357.7, 357.7, 358.6, 359.5, 363.1, 366, 371, 378,
  //   385, 393, 402.8, 411.6, 420.4, 428.1, 433.6, 436.9, 441.6, 441.6, 441.6,
  // ]; // m3/s
  // const K = 6; // hours
  // const X = 0.2;
  // const dt = 1; // hour
  // const outflows = muskingumRouting(inflows, K, X, dt);
  // console.log('muskingumRouting : ', outflows);

  // // const result = forecastNextHour({
  // //   inflows: inflows,
  // //   lastOutflow: outflows[outflows.length - 1], // O_t
  // //   K: K, // hours
  // //   X: X,
  // //   dt: dt,
  // //   inflowForecastMethod: 'persistence',
  // //   ratingCurve: { type: 'power', a: 72.2439284034381, b: 1.3654284099194158, h0: 0 },
  // // });
  // const result = forecastNHours({
  //   inflows: inflows,
  //   lastOutflow: outflows[outflows.length - 1], // O_t
  //   K: K, // hours
  //   X: X,
  //   dt: dt,
  //   n: 10,
  //   inflowMethod: 'persistence',
  //   ratingCurve: { type: 'power', a: 72.2439284034381, b: 1.3654284099194158, h0: 0 },
  // });
  // console.log(result);

  const inflows = [
    236.15, 236.15, 237.3, 240.75, 241.9, 239.6, 239.6, 237.3, 236.15, 233.85, 232.7,
    231.55, 230.4, 229.25,
  ]; // m3/s
  const K = 75.72821562; // hours
  const X = 0;
  const dt = 1; // hour
  const result = forecastP1FromP67({
    inflows: inflows,
    lastOutflow: 251.4, // O_t
    K: K, // hours
    X: X,
    dt: dt,
    n: 24,
    inflowMethod: 'persistence',
    ratingCurveP1: { type: 'power', a: 75.24808085528338, b: 1.3280500702336924, h0: 0 },
  });

  console.log('forecastP1FromP67 : ', result);

  return <div></div>;
}
