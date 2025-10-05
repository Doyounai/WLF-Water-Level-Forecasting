'use client';

import { dynamicRouteAndForecastN, type Sample } from '@/lib/hydro';
import { calcHeightError } from '@/lib/math';
import { p1Samples, p67Samples } from '@/samples/p67';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function Home() {
  const dtSeconds = 3600;

  const upstream: Sample[] = p67Samples;
  const downstream: Sample[] = p1Samples;

  // console.log(
  //   'P67 ',
  //   p67Samples.map((item) => item.t),
  // );
  // console.log(
  //   'P1 ',
  //   p1Samples.map((item) => item.t),
  // );

  const result = dynamicRouteAndForecastN(
    { upstream, downstream, dtSeconds },
    {
      nSteps: 12,
      inflowMethod: 'persistence',
      expAlpha: 0.35,
      maxInflowChangePct: 0.12,
      KScale: { refQ: 320, gamma: 0.25 },
      stageRelaxation: 0.15,
      risingOnlyRC: true,
    },
  );

  const observed = [
    3.16, 3.19, 3.24, 3.28, 3.32, 3.35, 3.38, 3.41, 3.45, 3.48, 3.49, 3.52, 3.54,
  ];
  const err = calcHeightError(result.forecasts, observed);

  const chartData = result.forecasts.map((f, idx) => ({
    time: f.t,
    Predicted: f.h_m,
    Observed: observed[idx] ?? null,
  }));

  console.log('Forecast : ', result.forecasts);

  const time = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

  return (
    <div className="min-h-screen space-y-8 bg-gray-50 p-8">
      <h1 className="font-bold text-3xl text-gray-800">
        ผลการพยากรณ์ระดับน้ำ (สถานี P1)
      </h1>

      {/* Error summary */}
      {/* <div className="bg-white rounded-lg border-l-4 border-blue-600 shadow-md p-6">
        <h2 className="font-semibold text-xl mb-4 text-blue-700">สรุปค่าคลาดเคลื่อน</h2>
        <div className="font-medium grid text-gray-700 gap-4 grid-cols-3">
          <p>
            <span className="font-bold text-blue-600">RMSE:</span> {err.rmse.toFixed(2)} m
          </p>
          <p>
            <span className="font-bold text-green-600">MAE:</span> {err.mae.toFixed(2)} m
          </p>
          <p>
            <span className="font-bold text-red-600">Bias:</span> {err.bias.toFixed(2)} m
          </p>
        </div>
      </div> */}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="font-semibold text-xl mb-4 text-gray-800">รายละเอียดการทำนาย</h2>
        <table className="border min-w-full border-gray-300 text-gray-800">
          <thead>
            <tr className="bg-blue-100 text-blue-800">
              <th className="border text-left py-2 px-3">เวลา</th>
              <th className="border text-center py-2 px-3">Predicted (m)</th>
              {/* <th className="border text-center py-2 px-3">Observed (m)</th>
              <th className="border text-center py-2 px-3">Error (m)</th> */}
            </tr>
          </thead>
          <tbody>
            {result.forecasts.map((f, i) => {
              const obs = observed[i] ?? null;
              const errVal = obs !== null ? (f.h_m - obs).toFixed(2) : '-';
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  {/* <td className="border py-2 px-3">{f.t}</td> */}
                  <td className="border py-2 px-3">{time[i]}</td>
                  <td className="border font-semibold text-center py-2 px-3 text-blue-700">
                    {f.h_m.toFixed(2)}
                  </td>
                  {/* <td className="border font-semibold text-center py-2 px-3 text-green-700">
                    {obs?.toFixed(2)}
                  </td>
                  <td
                    className={`border px-3 py-2 text-center font-semibold ${
                      Number(errVal) > 0.3 ? 'text-red-600' : 'text-gray-700'
                    }`}
                  >
                    {errVal}
                  </td> */}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg h-96 shadow-md p-6">
        <h2 className="font-semibold text-xl mb-4 text-gray-800">
          กราฟเปรียบเทียบ Predicted vs Observed
        </h2>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12, fill: '#374151' }}
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#374151' }}
              label={{
                value: 'Stage (m)',
                angle: -90,
                position: 'insideLeft',
                fill: '#374151',
              }}
            />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="Predicted"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Predicted"
            />
            <Line
              type="monotone"
              dataKey="Observed"
              stroke="#dc2626"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Observed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
