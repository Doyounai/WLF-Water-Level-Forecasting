import Image from 'next/image';

import { muskingumRouting, forecastNextHour, fitPowerLogLinear } from '@/lib/hydrology';

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

  // 12-18 29/09/2025
  const inflows = [
    439.2, 436.9, 430.3, 423.7, 416, 407.2, 400.6, 394, 386, 380, 374, 368, 362.2, 356.8,
    352.6, 348.6, 346.2, 341.4, 334.2, 322.2, 312.6, 300.6, 291, 282.2, 275.6, 269, 262.4,
    258, 255.8, 255.8, 255.8, 255.8, 253.6, 253.6, 253.6, 253.6, 251.4, 251.4, 249.2, 245,
    243, 237, 235, 231, 229, 227,
  ]; // m3/s
  const K = 6; // hours
  const X = 0.5;
  const dt = 1; // hour
  const outflows = muskingumRouting(inflows, K, X, dt);
  console.log('muskingumRouting : ', outflows);

  const result = forecastNextHour({
    inflows: inflows,
    lastOutflow: outflows[outflows.length - 1], // O_t
    K: K, // hours
    X: X,
    dt: dt,
    inflowForecastMethod: 'persistence',
    ratingCurve: { type: 'power', a: 72.2439284034381, b: 1.3654284099194158, h0: 0 },
  });
  console.log(result);

  return <div></div>;
}
