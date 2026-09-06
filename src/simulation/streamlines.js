// Lagrangian streakline particles advected through the CFD velocity field,
// rendered as glowing speed-coloured ribbons (the "CFD flow-vis" look).

const TRAIL_LEN = 70;

const COLOR_STOPS = [
  { t: 0, c: [79, 155, 255] }, // slow – blue
  { t: 0.32, c: [64, 224, 208] }, // teal
  { t: 0.58, c: [122, 224, 90] }, // green
  { t: 0.8, c: [232, 212, 90] }, // amber
  { t: 1, c: [255, 92, 64] }, // fast – red
];

export function speedToColor(norm) {
  const t = Math.min(1, Math.max(0, norm));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i];
    const b = COLOR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * f);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * f);
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * f);
      return [r, g, bl];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].c;
}

// diverging red/blue colormap for vorticity-coloured tracers: red = positive
// spin (one side of a shed vortex), blue = negative spin, near-white at ~0
export function curlToColor(norm) {
  const t = Math.min(1, Math.max(-1, norm));
  if (t >= 0) {
    const r = 255;
    const g = Math.round(235 - 170 * t);
    const b = Math.round(235 - 195 * t);
    return [r, g, b];
  }
  const m = -t;
  const r = Math.round(235 - 195 * m);
  const g = Math.round(235 - 150 * m);
  const b = 255;
  return [r, g, b];
}

function sampleBilinear(field, w, h, gx, gy) {
  let x = Math.min(w - 1.001, Math.max(0, gx));
  let y = Math.min(h - 1.001, Math.max(0, gy));
  const i0 = Math.floor(x);
  const j0 = Math.floor(y);
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  const sx = x - i0;
  const sy = y - j0;
  const v00 = field[i0 + j0 * w];
  const v10 = field[i1 + j0 * w];
  const v01 = field[i0 + j1 * w];
  const v11 = field[i1 + j1 * w];
  return (
    v00 * (1 - sx) * (1 - sy) +
    v10 * sx * (1 - sy) +
    v01 * (1 - sx) * sy +
    v11 * sx * sy
  );
}

export function createStreamParticles(rows, canvasH, margin = 20, canvasW = 640) {
  const particles = [];
  for (let i = 0; i < rows; i++) {
    const y = margin + (i / (rows - 1)) * (canvasH - margin * 2);
    particles.push(spawn(y, canvasW));
  }
  return particles;
}

function spawn(y, canvasW = 640) {
  return {
    x: -Math.random() * canvasW * 1.4,
    y,
    homeY: y,
    trail: [],
    speedNorm: 0,
  };
}

export function stepStreamParticles(particles, dt, { frame, gridNx, gridNy, canvasW, canvasH, windSpeed }) {
  if (!frame) return;
  const { u, v } = frame;
  const gw = gridNx + 2;
  const gh = gridNy + 2;
  const cellW = canvasW / gridNx;
  const cellH = canvasH / gridNy;
  const maxSpeed = 4 + windSpeed * 5.5;

  for (const p of particles) {
    // particles starting far off-screen approximate free-stream velocity
    // near the inlet (sampleBilinear clamps into range), which is what we want
    const gx = p.x / cellW + 0.5;
    const gy = p.y / cellH + 0.5;
    const gu = sampleBilinear(u, gw, gh, gx, gy);
    const gv = sampleBilinear(v, gw, gh, gx, gy);
    const pxPerSec = gu * cellW;
    const pyPerSec = gv * cellH;
    const speed = Math.hypot(gu, gv);
    p.speedNorm = Math.min(1, speed / maxSpeed);

    p.x += pxPerSec * dt;
    p.y += pyPerSec * dt;

    if (p.x >= 0) {
      p.trail.push([p.x, p.y, p.speedNorm]);
      if (p.trail.length > TRAIL_LEN) p.trail.shift();
    }

    if (p.x > canvasW + 10 || p.y < -20 || p.y > canvasH + 20) {
      Object.assign(p, spawn(p.homeY, canvasW));
    }
  }
}

const VORTEX_TRAIL_LEN = 55;
const CURL_SCALE = 5; // normalizes raw solver curl into roughly [-1, 1]

// A second, sparser set of tracers concentrated around the rotor/wake band,
// colored by the solver's real vorticity instead of speed — this is what
// reads as "stall" / rotational pressure fluctuation shedding off the blades.
export function createVortexTracers(count, bandYMin, bandYMax, canvasW) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const y = bandYMin + Math.random() * (bandYMax - bandYMin);
    particles.push(spawnVortex(y, canvasW));
  }
  return particles;
}

function spawnVortex(y, canvasW = 640) {
  return {
    x: -Math.random() * canvasW * 1.2,
    y,
    homeY: y,
    homeRange: 0,
    trail: [],
  };
}

export function stepVortexTracers(particles, dt, { frame, gridNx, gridNy, canvasW, canvasH, bandYMin, bandYMax }) {
  if (!frame) return;
  const { u, v, curl } = frame;
  if (!curl) return;
  const gw = gridNx + 2;
  const gh = gridNy + 2;
  const cellW = canvasW / gridNx;
  const cellH = canvasH / gridNy;

  for (const p of particles) {
    const gx = p.x / cellW + 0.5;
    const gy = p.y / cellH + 0.5;
    const gu = sampleBilinear(u, gw, gh, gx, gy);
    const gv = sampleBilinear(v, gw, gh, gx, gy);
    const gc = sampleBilinear(curl, gw, gh, gx, gy);
    const curlNorm = Math.min(1, Math.max(-1, gc / CURL_SCALE));

    p.x += gu * cellW * dt;
    p.y += gv * cellH * dt;

    if (p.x >= 0) {
      p.trail.push([p.x, p.y, curlNorm]);
      if (p.trail.length > VORTEX_TRAIL_LEN) p.trail.shift();
    }

    if (p.x > canvasW + 10 || p.y < -20 || p.y > canvasH + 20) {
      const y = bandYMin + Math.random() * (bandYMax - bandYMin);
      Object.assign(p, spawnVortex(y, canvasW));
    }
  }
}

export function drawVortexTracers(ctx, particles) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (const p of particles) {
    const pts = p.trail;
    if (pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1, cN] = pts[i];
      const mag = Math.abs(cN);
      if (mag < 0.05) continue;
      const [r, g, b] = curlToColor(cN);
      ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(0.85, mag * 0.9)})`;
      ctx.lineWidth = 0.8 + mag * 1.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawStreamParticles(ctx, particles) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (const p of particles) {
    const pts = p.trail;
    if (pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1, sN] = pts[i];
      const age = i / pts.length;
      const [r, g, b] = speedToColor(sN);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.09 + age * 0.4})`;
      ctx.lineWidth = 0.8 + age * 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    const head = pts[pts.length - 1];
    const [r, g, b] = speedToColor(head[2]);
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
