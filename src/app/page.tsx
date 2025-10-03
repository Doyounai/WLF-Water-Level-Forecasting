import Image from 'next/image';

import { muskingumRouting, fitPowerLogLinear, forecastNHours } from '@/lib/hydrology';

export default function Home() {
  const inflows = [
    72.92, 72.1, 72.1, 72.1, 72.1, 72.92, 74.57, 75.4, 76.22, 77.05, 77.87, 79.53, 80.35,
    82.88, 82.88, 82.88, 82, 82, 81.18, 80.35, 78.7, 77.87, 77.05, 76.22, 75.4, 75.4,
    76.22, 76.22, 77.05, 77.87, 78.7, 77.87, 77.87, 77.87, 77.05, 76.22, 75.4, 74.57,
    73.75, 73.75, 75.4, 77.05, 77.87, 77.87, 77.87, 77.87, 77.05, 76.22,
  ]; // m3/s
  const K = 6.51519645357875; // hours
  const X = 0.5;
  const dt = 1; // hour

  const result = forecastNHours({
    inflows: inflows,
    lastOutflow: 153, // O_t
    K: K, // hours
    X: X,
    dt: dt,
    n: 6,
    inflowMethod: 'exponential_smoothing',
    ratingCurve: { type: 'power', a: 140, b: 1, h0: 0.779 },
  });

  console.log('forecastP1FromP67 : ', result);

  return <div></div>;
}
