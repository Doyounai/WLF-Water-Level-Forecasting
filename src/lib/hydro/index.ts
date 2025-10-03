// import { Sample, WindowData, DynamicRoutingResult } from "./types";

// lib/hydro.ts
// TypeScript utilities for dynamic Muskingum routing & dynamic rating curve.
// เหมาะกับข้อมูล sampling เท่ากันทุกช่วงเวลา (เช่น ทุก 1 ชม. หรือทุก 15 นาที)

export type Sample = {
  // timestamp (ms) หรือ ISO string ก็ได้ แต่การคำนวณใช้เพียงลำดับ/Δt คงที่
  t: number | string;
  // Stage (m)
  h?: number;
  // Discharge (m^3/s)
  q?: number;
};

export type WindowData = {
  // ข้อมูลย้อนหลังของสถานีต้นน้ำ (P67): ใช้ q เป็น inflow
  upstream: Sample[];
  // ข้อมูลย้อนหลังของสถานีปลายน้ำ (P1): ใช้ q เป็น outflow observed และ/หรือ h สำหรับปรับ rating curve
  downstream: Sample[];
  // ขนาด time step (วินาที) เช่น 3600 สำหรับ 1 ชั่วโมง
  dtSeconds: number;
};

export type MuskingumParams = {
  K: number; // seconds
  X: number; // 0..0.5
  C0: number;
  C1: number;
  C2: number;
};

export type RatingCurveParams = {
  a: number; // scale
  b: number; // exponent
  h0: number; // datum shift
};

// ---------- Helpers ----------
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isFiniteNumber = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);

// คำนวณค่าสัมประสิทธิ์ Muskingum จาก K,X,Δt พร้อม guard ความเสถียร
export function muskingumCoeffs(Ksec: number, X: number, dtSec: number): MuskingumParams {
  const K = Math.max(Ksec, 1e-6);
  const Xc = clamp(X, 0, 0.5);

  // เงื่อนไขเสถียรภาพ: Δt ≤ 2K(1-X)
  // ถ้าเกิน ให้ดัน K ขึ้นเล็กน้อย
  const minK = dtSec / (2 * (1 - Xc) + 1e-12);
  const Kst = Math.max(K, minK * 1.01);

  const denom = 2 * Kst * (1 - Xc) + dtSec;
  const C0 = (dtSec - 2 * Kst * Xc) / denom;
  const C1 = (dtSec + 2 * Kst * Xc) / denom;
  const C2 = (2 * Kst * (1 - Xc) - dtSec) / denom;

  return { K: Kst, X: Xc, C0, C1, C2 };
  // return { K: 6, X: 0.5, C0, C1, C2 }; // disable K,X for dynamic estimation
}

// Muskingum 1 ก้าวเวลา
export function muskingumStep(
  It: number,
  Itm1: number,
  Otm1: number,
  params: MuskingumParams,
): number {
  const { C0, C1, C2 } = params;
  const Ot = C0 * It + C1 * Itm1 + C2 * Otm1;
  // ป้องกันค่าติดลบเล็กน้อยจากเชิงตัวเลข
  return Math.max(0, Ot);
}

// Routing ทั้งหน้าต่างเวลา (ใช้เมื่อประเมิน loss เทียบกับ observed)
export function muskingumRouteSeries(
  inflow: number[], // I_0..I_{n-1}
  O0: number, // ค่าเริ่มต้น O(-1) หรือ O_0 ถ้าซีรีส์เริ่มจาก index 1
  params: MuskingumParams,
): number[] {
  const n = inflow.length;
  const out: number[] = new Array(n).fill(0);
  let prevI = inflow[0];
  let prevO = O0;

  for (let t = 0; t < n; t++) {
    const It = inflow[t];
    const Ot = muskingumStep(It, prevI, prevO, params);
    out[t] = Ot;
    prevI = It;
    prevO = Ot;
  }
  return out;
}

// ---------- Dynamic estimation: K, X by windowed SSE minimization ----------
export function estimateMuskingumParams(
  inflow: number[], // I (P67 q)
  outflowObs: (number | undefined)[], // O observed (P1 q), อาจมี missing
  dtSeconds: number,
  // ช่วงค้นหา K (ชั่วโมง) และ X
  search: {
    KminH?: number;
    KmaxH?: number;
    Xmin?: number;
    Xmax?: number;
    KGrid?: number;
    XGrid?: number;
  } = {},
): MuskingumParams {
  const KminH = search.KminH ?? 0.25; // 15 นาที
  const KmaxH = search.KmaxH ?? 24; // 1 วัน
  const Xmin = search.Xmin ?? 0.0;
  const Xmax = search.Xmax ?? 0.5;
  const KGrid = Math.max(5, Math.floor(search.KGrid ?? 15)); // จุดในกริด K
  const XGrid = Math.max(5, Math.floor(search.XGrid ?? 11)); // จุดในกริด X

  // เตรียม O0 เป็น observed ตัวแรกที่มีค่า ถ้าไม่มีเลย ใช้ I0 เป็น proxy
  const firstObsIdx = outflowObs.findIndex(isFiniteNumber);
  const O0 = firstObsIdx >= 0 ? (outflowObs[firstObsIdx] as number) : inflow[0];

  let best: { sse: number; params: MuskingumParams } | null = null;

  for (let i = 0; i < KGrid; i++) {
    const Kh = KminH + (KmaxH - KminH) * (i / (KGrid - 1));
    const Ksec = Kh * 3600;

    for (let j = 0; j < XGrid; j++) {
      const X = Xmin + (Xmax - Xmin) * (j / (XGrid - 1));
      const params = muskingumCoeffs(Ksec, X, dtSeconds);

      // route
      const Ohat = muskingumRouteSeries(inflow, O0, params);

      // SSE เฉพาะจุดที่มี observed
      let sse = 0;
      for (let t = 0; t < Ohat.length; t++) {
        const o = outflowObs[t];
        if (isFiniteNumber(o)) {
          const e = Ohat[t] - (o as number);
          sse += e * e;
        }
      }

      if (!best || sse < best.sse) {
        best = { sse, params };
      }
    }
  }

  // ปรับละเอียดรอบ best อีกชั้น (fine search)
  const coarse = best!.params;
  const fineKmin = Math.max(coarse.K / 3600 - 0.5, KminH);
  const fineKmax = Math.min(coarse.K / 3600 + 0.5, KmaxH);
  const fineXmin = Math.max(coarse.X - 0.05, Xmin);
  const fineXmax = Math.min(coarse.X + 0.05, Xmax);

  for (let i = 0; i < 9; i++) {
    const Kh = fineKmin + (fineKmax - fineKmin) * (i / 8);
    const Ksec = Kh * 3600;
    for (let j = 0; j < 9; j++) {
      const X = fineXmin + (fineXmax - fineXmin) * (j / 8);
      const params = muskingumCoeffs(Ksec, X, dtSeconds);
      const Ohat = muskingumRouteSeries(inflow, O0, params);

      let sse = 0;
      for (let t = 0; t < Ohat.length; t++) {
        const o = outflowObs[t];
        if (isFiniteNumber(o)) {
          const e = Ohat[t] - (o as number);
          sse += e * e;
        }
      }

      if (!best || sse < best.sse) {
        best = { sse, params };
      }
    }
  }

  return best!.params;
}

// ---------- Dynamic Rating Curve (fit a, b, h0) ----------
// แนวทาง: grid search h0 และทำ OLS บน log(Q) = log(a) + b*log(H - h0)
// ใช้เฉพาะคู่ (H,Q) ที่ H > h0 และ Q>0
export function fitRatingCurve(pairs: { h: number; q: number }[]): RatingCurveParams {
  // ช่วงค้นหา h0: จากเปอร์เซ็นไทล์ล่างของ H ไปจนเกือบค่า min(H)
  const Hs = pairs
    .map((p) => p.h)
    .filter(isFiniteNumber)
    .sort((a, b) => a - b);
  const Qs = pairs.map((p) => p.q).filter(isFiniteNumber);
  if (Hs.length < 3 || Qs.length < 3) {
    // fallback ง่าย ๆ
    const h0 = Math.min(...Hs);
    return { a: 1, b: 1, h0 };
  }

  const p10 = Hs[Math.floor(0.1 * (Hs.length - 1))];
  const p40 = Hs[Math.floor(0.4 * (Hs.length - 1))];
  const h0Min = Math.min(p10, p40 - 0.05);
  const h0Max = Math.max(p40, p10 + 0.05);

  let best: { h0: number; a: number; b: number; sse: number } | null = null;

  for (let i = 0; i < 41; i++) {
    const h0 = h0Min + (h0Max - h0Min) * (i / 40);
    const rows = pairs
      .filter((p) => p.q! > 0 && p.h! > h0)
      .map((p) => ({ x: Math.log(Math.max(p.h - h0, 1e-9)), y: Math.log(p.q!) }));

    if (rows.length < 3) continue;

    // OLS linear regression: y = c + b*x
    let sumX = 0,
      sumY = 0,
      sumXX = 0,
      sumXY = 0;
    for (const r of rows) {
      sumX += r.x;
      sumY += r.y;
      sumXX += r.x * r.x;
      sumXY += r.x * r.y;
    }
    const n = rows.length;
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) continue;

    const b = (n * sumXY - sumX * sumY) / denom;
    const c = (sumY - b * sumX) / n; // c = ln(a)
    const a = Math.exp(c);

    // SSE ใน space ของ Q (ไม่ใช่ log) จะเป็นมิตรต่อการทำนายระดับจริงมากกว่า
    let sse = 0;
    for (const p of pairs) {
      const qhat = p.h! > h0 ? a * Math.pow(Math.max(p.h! - h0, 0), b) : 0;
      const e = (p.q ?? 0) - qhat;
      sse += e * e;
    }

    if (!best || sse < best.sse) best = { h0, a, b, sse };
  }

  if (!best) {
    const h0 = Hs[0];
    return { a: 1, b: 1, h0 };
  }
  return { a: best.a, b: best.b, h0: best.h0 };
}

export function qFromH(h: number, rc: RatingCurveParams): number {
  const head = Math.max(h - rc.h0, 0);
  return rc.a * Math.pow(head, rc.b);
}

export function hFromQ(q: number, rc: RatingCurveParams): number {
  if (q <= 0) return rc.h0;
  return rc.h0 + Math.pow(q / rc.a, 1 / rc.b);
}

// ---------- Orchestrator: ประเมินพารามิเตอร์ไดนามิก + route + ทำนายระดับ ----------
export type DynamicRoutingResult = {
  muskingum: MuskingumParams;
  rating: RatingCurveParams;
  routedQ: number[]; // Outflow P1 ที่ route ได้ตลอดหน้าต่าง
  predictedNextQ: number; // ทำนายก้าวถัดไป (ใช้ I_t ล่าสุด)
  predictedNextH: number; // ระดับน้ำจาก rating curve
};

export function dynamicRouteAndForecast(input: WindowData): DynamicRoutingResult {
  const { upstream, downstream, dtSeconds } = input;

  // เตรียมซีรีส์ I (จาก P67.q) และ Oobs (จาก P1.q)
  // สมมติความยาวเท่ากัน หรือใช้ความยาว min
  const n = Math.min(upstream.length, downstream.length);
  const I = upstream.slice(-n).map((s) => s.q ?? 0);
  const Oobs = downstream
    .slice(-n)
    .map((s) => (isFiniteNumber(s.q) ? (s.q as number) : undefined));

  // 1) ประเมิน K,X แบบ dynamic จากหน้าต่างล่าสุด
  const mk = estimateMuskingumParams(I, Oobs, dtSeconds);

  // 2) route ทั้งหน้าต่างเพื่อได้ outflow series (ใช้ O0 จาก observed ตัวแรกที่มีค่า)
  const firstObsIdx = Oobs.findIndex(isFiniteNumber);
  const O0 = firstObsIdx >= 0 ? (Oobs[firstObsIdx] as number) : I[0];
  const Orouted = muskingumRouteSeries(I, O0, mk);

  // 3) Fit rating curve จากคู่ (h,q) ของ P1 ในหน้าต่างล่าสุด
  const pairs = downstream
    .slice(-n)
    .filter((s) => isFiniteNumber(s.h) && isFiniteNumber(s.q))
    .map((s) => ({ h: s.h as number, q: s.q as number }));

  const rc =
    pairs.length >= 3
      ? fitRatingCurve(pairs)
      : { a: 1, b: 1.2, h0: downstream.at(-1)?.h ?? 0 };

  // 4) ทำนายก้าวถัดไป:
  //    ต้องการ I_t ล่าสุด, I_{t-1} และ O_{t-1} (จาก Orouted)
  const It = I.at(-1)!;
  const Itm1 = I.length >= 2 ? I.at(-2)! : It;
  const Otm1 = Orouted.at(-1)!;
  const nextQ = muskingumStep(It, Itm1, Otm1, mk);
  const nextH = hFromQ(nextQ, rc);

  return {
    muskingum: mk,
    rating: rc,
    routedQ: Orouted,
    predictedNextQ: nextQ,
    predictedNextH: nextH,
  };
}

// --------------------------------------------------
export type ForecastStep = {
  step: number; // how many hours ahead
  q_m3s: number; // forecast discharge
  h_m: number; // forecast stage from rating curve
  t: string; // เวลาของ forecast
};

export type DynamicRoutingMultiResult = {
  muskingum: MuskingumParams;
  rating: RatingCurveParams;
  routedQ: number[];
  forecasts: ForecastStep[];
};

export function dynamicRouteAndForecastN(
  input: WindowData,
  opts: ForecastOptions,
): DynamicRoutingMultiResult {
  const { upstream, downstream, dtSeconds } = input;
  const {
    nSteps,
    inflowMethod = 'exp',
    expAlpha = 0.35,
    maxInflowChangePct = 0.12,
    KScale = { refQ: 300, gamma: 0.3 },
    stageRelaxation = 0.35,
    risingOnlyRC = true,
  } = opts;

  const n = Math.min(upstream.length, downstream.length);
  const I = upstream.slice(-n).map((s) => s.q ?? 0);
  const Oobs = downstream.slice(-n).map((s) => s.q ?? undefined);

  // 1) Dynamic Muskingum params from window
  const mk = estimateMuskingumParams(I, Oobs, dtSeconds);

  // 2) Route observed series
  const firstObsIdx = Oobs.findIndex((o) => o !== undefined);
  const O0 = firstObsIdx >= 0 ? (Oobs[firstObsIdx] as number) : I[0];
  const Orouted = muskingumRouteSeries(I, O0, mk);

  // 3) Fit rating curve (optionally rising limb only)
  const recentPairs = downstream
    .slice(-n)
    .filter((s) => s.h !== undefined && s.q !== undefined) as { h: number; q: number }[];
  let pairs = recentPairs;
  if (risingOnlyRC && pairs.length >= 5) {
    const dQ = pairs.map((p, i) => (i === 0 ? 0 : p.q - pairs[i - 1].q));
    pairs = pairs.filter((p, i) => i === 0 || dQ[i] >= 0); // keep rising or flat
    if (pairs.length < 3) pairs = recentPairs; // fallback
  }
  const rc =
    pairs.length >= 3
      ? fitRatingCurve(pairs)
      : { a: 1, b: 1.2, h0: downstream.at(-1)?.h ?? 0 };

  // 4) N-step forecast with: inflow forecast + capped change + flow-scaled K + stage relaxation
  const forecasts: ForecastStep[] = [];
  const histI = I.slice(); // mutable inflow history for forecasting
  let prevO = Orouted.at(-1)!; // last routed downstream Q
  let prevH = downstream.at(-1)?.h ?? hFromQ(prevO, rc); // last observed stage

  const lastT = new Date(downstream.at(-1)?.t ?? Date.now());

  for (let step = 1; step <= nSteps; step++) {
    // 4.1 forecast upstream inflow next step
    const candI = forecastInflowNext(histI, inflowMethod, expAlpha);
    const It = capInflowChange(histI.at(-1)!, candI, maxInflowChangePct);
    histI.push(It);

    // 4.2 scale K with flow magnitude (optional)
    const Kstep = scaleKByFlow(mk.K, It, KScale.refQ ?? 300, KScale.gamma ?? 0.3);
    const stepParams = muskingumCoeffs(Kstep, mk.X, dtSeconds);

    // 4.3 Muskingum step
    const Itm1 = histI.at(-2)!;
    const Ot = muskingumStep(It, Itm1, prevO, stepParams);

    // 4.4 Map Q->H then relax toward it (to avoid unrealistic jumps)
    const Hrc = hFromQ(Ot, rc);
    const Ht = prevH + stageRelaxation * (Hrc - prevH);

    const forecastTime = new Date(lastT.getTime() + step * dtSeconds * 1000);

    forecasts.push({
      step,
      q_m3s: Ot,
      h_m: Ht,
      t: forecastTime.toISOString().slice(0, 16).replace('T', ' '), // format "YYYY-MM-DD HH:mm"
    });

    // shift
    prevO = Ot;
    prevH = Ht;
  }

  return { muskingum: mk, rating: rc, routedQ: Orouted, forecasts };
}

// --------------------------------------------------
function forecastInflow(history: number[], method: 'linear' | 'ar1' | 'exp'): number {
  const m = history.length;
  const It = history[m - 1];
  const Itm1 = history[m - 2] ?? It;
  if (method === 'linear') return Math.max(0, It + (It - Itm1));
  if (method === 'ar1') {
    let num = 0,
      den = 0;
    for (let i = 1; i < m; i++) {
      num += history[i] * history[i - 1];
      den += history[i - 1] * history[i - 1];
    }
    const phi = den === 0 ? 0 : num / den;
    return Math.max(0, phi * It);
  }
  return It;
}

// --------------------------------------------------
export type InflowMethod = 'persistence' | 'linear' | 'ar1' | 'exp';

function forecastInflowNext(
  history: number[],
  method: InflowMethod,
  expAlpha = 0.3,
): number {
  const m = history.length;
  const It = history[m - 1];
  const Itm1 = history[m - 2] ?? It;

  if (method === 'linear') return Math.max(0, It + (It - Itm1));

  if (method === 'ar1') {
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

  if (method === 'exp') {
    // simple exponential smoothing of the level then persistence
    let s = history[0];
    for (let i = 1; i < m; i++) s = expAlpha * history[i] + (1 - expAlpha) * s;
    return Math.max(0, s);
  }

  // persistence
  return Math.max(0, It);
}

function capInflowChange(prev: number, cand: number, maxPct = 0.12): number {
  if (prev <= 0) return cand;
  const up = prev * (1 + maxPct);
  const dn = prev * (1 - maxPct);
  return Math.min(up, Math.max(dn, cand));
}

function scaleKByFlow(Kbase: number, q: number, refQ = 300, gamma = 0.3): number {
  // K_eff = Kbase * (q/refQ)^gamma  (clamped)
  const ratio = Math.max(1e-6, q / Math.max(1e-6, refQ));
  const Keff = Kbase * Math.pow(ratio, gamma);
  return Math.max(60, Math.min(7 * 24 * 3600, Keff)); // 1 นาที .. 7 วัน
}

// ===== Options =====
export type ForecastOptions = {
  nSteps: number;
  inflowMethod?: InflowMethod; // default "exp"
  expAlpha?: number; // default 0.35
  maxInflowChangePct?: number; // default 0.12 (12%/step)
  KScale?: { refQ?: number; gamma?: number }; // default {refQ: 300, gamma: 0.3}
  stageRelaxation?: number; // λ in (0,1], default 0.35
  risingOnlyRC?: boolean; // fit RC เฉพาะช่วงขาขึ้น (ช่วยลด hysteresis ผิดฝั่ง)
};
