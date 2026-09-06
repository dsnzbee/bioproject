import { sampleColormapRGB } from "../visualization/colormaps";

function bilerp(data, width, height, gx, gy, comp) {
  const x = Math.min(width - 1.001, Math.max(0, gx));
  const y = Math.min(height - 1.001, Math.max(0, gy));
  const i0 = Math.floor(x), i1 = i0 + 1;
  const j0 = Math.floor(y), j1 = j0 + 1;
  const sx = x - i0, sy = y - j0;
  const idx = (i, j) => (j * width + i) * 4 + comp;
  const v00 = data[idx(i0, j0)], v10 = data[idx(i1, j0)];
  const v01 = data[idx(i0, j1)], v11 = data[idx(i1, j1)];
  return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
}

export function sampleVelocityBilinear(field, gx, gy) {
  return { u: bilerp(field.data, field.width, field.height, gx, gy, 0), v: bilerp(field.data, field.width, field.height, gx, gy, 1) };
}

// scalar field value at a grid cell for the selected quantity
function fieldValueAt(velField, pressField, i, j, fieldType, uRef, cellSize) {
  const w = velField.width;
  const idx = (j * w + i) * 4;
  const vx = velField.data[idx];
  const vy = velField.data[idx + 1];

  switch (fieldType) {
    case "velocityX":
      return vx;
    case "velocityY":
      return vy;
    case "deficit":
      return Math.hypot(vx, vy) / Math.max(0.5, uRef);
    case "pressure":
      return pressField ? pressField.data[idx] : 0;
    case "vorticity": {
      const i0 = Math.max(0, i - 1), i1 = Math.min(w - 1, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(velField.height - 1, j + 1);
      const vyR = velField.data[(j * w + i1) * 4 + 1];
      const vyL = velField.data[(j * w + i0) * 4 + 1];
      const vxU = velField.data[(j1 * w + i) * 4];
      const vxD = velField.data[(j0 * w + i) * 4];
      const dvdx = (vyR - vyL) / ((i1 - i0) * cellSize.x || 1);
      const dudy = (vxU - vxD) / ((j1 - j0) * cellSize.y || 1);
      return dvdx - dudy;
    }
    default:
      return Math.hypot(vx, vy);
  }
}

let _imgDataCache = null;
export function paintFieldContour(ctx, canvasW, canvasH, velField, pressField, opts) {
  const { fieldType, colormapName, vmin, vmax, cellSize, uRef, flipY } = opts;
  const { width, height } = velField;

  if (!_imgDataCache || _imgDataCache.width !== width || _imgDataCache.height !== height) {
    _imgDataCache = { canvas: document.createElement("canvas"), imageData: null };
    _imgDataCache.canvas.width = width;
    _imgDataCache.canvas.height = height;
    _imgDataCache.ctx = _imgDataCache.canvas.getContext("2d");
    _imgDataCache.imageData = _imgDataCache.ctx.createImageData(width, height);
    _imgDataCache.width = width;
    _imgDataCache.height = height;
  }
  const { imageData } = _imgDataCache;
  const buf = imageData.data;
  const range = vmax - vmin || 1;

  for (let j = 0; j < height; j++) {
    // flipY: grid row 0 is the ground (y=0); canvas row 0 is the top, so
    // row j of the grid should paint at canvas row (height-1-j)
    const outRow = flipY ? height - 1 - j : j;
    for (let i = 0; i < width; i++) {
      const val = fieldValueAt(velField, pressField, i, j, fieldType, uRef, cellSize);
      const t = (val - vmin) / range;
      const [r, g, b] = sampleColormapRGB(colormapName, t);
      const p = (outRow * width + i) * 4;
      buf[p] = r * 255;
      buf[p + 1] = g * 255;
      buf[p + 2] = b * 255;
      buf[p + 3] = 255;
    }
  }
  _imgDataCache.ctx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(_imgDataCache.canvas, 0, 0, canvasW, canvasH);
}

// RK4 streamline integration through the (already read-back) velocity
// field, seeded from a vertical rake upstream of the rotor
export function traceStreamlines(velField, seeds, { cellSize, domainW, domainH, stepsForward = 260, dsWorld }) {
  const lines = [];
  const ds = dsWorld ?? Math.min(cellSize.x, cellSize.y) * 0.9;

  for (const seed of seeds) {
    const pts = [];
    let x = seed.x, y = seed.y;
    for (let s = 0; s < stepsForward; s++) {
      pts.push([x, y]);
      const gx = x / cellSize.x;
      const gy = y / cellSize.y;
      const k1 = sampleVelocityBilinear(velField, gx, gy);
      const speed1 = Math.hypot(k1.u, k1.v) || 1e-3;
      const k2 = sampleVelocityBilinear(velField, gx + (k1.u / speed1) * (ds / cellSize.x) * 0.5, gy + (k1.v / speed1) * (ds / cellSize.y) * 0.5);
      const speed2 = Math.hypot(k2.u, k2.v) || 1e-3;
      const dirU = k2.u / speed2;
      const dirV = k2.v / speed2;
      x += dirU * ds;
      y += dirV * ds;
      if (x < 0 || x > domainW || y < 0 || y > domainH) break;
    }
    lines.push(pts);
  }
  return lines;
}

export function drawStreamlines(ctx, lines, worldToCanvas, colormapName, velField, cellSize, uRef) {
  ctx.save();
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.55;
  for (const pts of lines) {
    if (pts.length < 2) continue;
    ctx.beginPath();
    const [x0, y0] = worldToCanvas(pts[0][0], pts[0][1]);
    ctx.moveTo(x0, y0);
    for (let k = 1; k < pts.length; k++) {
      const [x, y] = worldToCanvas(pts[k][0], pts[k][1]);
      ctx.lineTo(x, y);
    }
    const mid = pts[Math.floor(pts.length / 2)];
    const gx = mid[0] / cellSize.x;
    const gy = mid[1] / cellSize.y;
    const v = sampleVelocityBilinear(velField, gx, gy);
    const speedNorm = Math.min(1, Math.hypot(v.u, v.v) / (uRef * 1.4 + 1));
    const [r, g, b] = sampleColormapRGB(colormapName, speedNorm);
    ctx.strokeStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
    ctx.stroke();
  }
  ctx.restore();
}
