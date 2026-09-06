// Blade geometry shared by the renderer and the obstacle rasterizer that
// feeds the CFD solver, so the flow field always "sees" the exact shape
// that's drawn on screen. All dimensions are parametric on {bladeLen, hubR}
// so the same blade scales cleanly with the canvas.

export function smoothstep(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// slender, realistic taper: fairly narrow even at the root, sharp pointed tip
export function baseHalfWidth(t, hubR) {
  const maxHW = hubR * 0.62;
  const minHW = hubR * 0.09;
  return minHW + (maxHW - minHW) * Math.pow(1 - t, 1.7);
}

export function leadHalfWidth(t, features, hubR) {
  let hw = baseHalfWidth(t, hubR);
  if (features.whale) {
    hw += Math.sin(t * Math.PI * 2 * 4.5 + 1) * hubR * 0.16 * smoothstep(t, 0.08, 0.92);
  }
  return hw;
}

// a gentle wave in the silhouette; the pronounced comb fringe is drawn as a
// separate decorative overlay in sceneRender so it doesn't turn the fill
// into hard zigzag bands
export function trailHalfWidth(t, features, hubR) {
  let hw = baseHalfWidth(t, hubR);
  if (features.owl && t > 0.55) {
    const local = (t - 0.55) / 0.45;
    hw += Math.sin(local * Math.PI * 2 * 5) * hubR * 0.05;
  }
  return hw;
}

export function tipBend(t, features, time, phase, bladeLen) {
  if (!features.bat || t <= 0.75) return 0;
  return smoothstep(t, 0.75, 1) * Math.sin(time * 2.3 + phase) * bladeLen * 0.045;
}

// polyline in blade-local coords (x = span from hub, y = chordwise) for rendering
export function bladePolyline(features, time, phase, geo, steps = 40) {
  const { bladeLen, hubR } = geo;
  const lead = [];
  const trail = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = hubR + t * (bladeLen - hubR);
    const bend = tipBend(t, features, time, phase, bladeLen);
    lead.push([s, -leadHalfWidth(t, features, hubR) + bend]);
    trail.push([s, trailHalfWidth(t, features, hubR) + bend]);
  }
  return { lead, trail };
}

// O(1) point-in-blade test in blade-local coords, used for the CFD obstacle mask
export function bladeContainsLocal(lx, ly, features, time, phase, geo) {
  const { bladeLen, hubR } = geo;
  if (lx < hubR || lx > bladeLen) return false;
  const t = (lx - hubR) / (bladeLen - hubR);
  const bend = tipBend(t, features, time, phase, bladeLen);
  const yy = ly - bend;
  return yy >= -leadHalfWidth(t, features, hubR) && yy <= trailHalfWidth(t, features, hubR);
}

export function rasterizeObstacles(nx, ny, canvasW, canvasH, params) {
  const {
    turbineX,
    turbineY,
    angle,
    features,
    isBiomimicked,
    time,
    bladeLen,
    hubR,
    towerHalfW,
    groundY,
  } = params;
  const geo = { bladeLen, hubR };
  const cellW = canvasW / nx;
  const cellH = canvasH / ny;
  const w = nx + 2;
  const h = ny + 2;
  const solid = new Uint8Array(w * h);
  const gY = groundY ?? canvasH - 14;
  const activeFeatures = isBiomimicked ? features : {};
  const nacelleLen = hubR * 2.6;
  const nacelleHalf = hubR * 0.75;

  for (let j = 1; j <= ny; j++) {
    const wy = (j - 0.5) * cellH;
    for (let i = 1; i <= nx; i++) {
      const wx = (i - 0.5) * cellW;
      let isSolid = false;

      if (wy >= gY) isSolid = true;

      if (!isSolid && wx >= turbineX - towerHalfW && wx <= turbineX + towerHalfW && wy >= turbineY && wy < gY) {
        isSolid = true;
      }

      if (!isSolid && wx >= turbineX - hubR * 0.4 && wx <= turbineX + nacelleLen && wy >= turbineY - nacelleHalf && wy <= turbineY + nacelleHalf) {
        isSolid = true;
      }

      if (!isSolid) {
        const dx0 = wx - turbineX;
        const dy0 = wy - turbineY;
        if (dx0 * dx0 + dy0 * dy0 <= (hubR * 0.7) ** 2) isSolid = true;
      }

      if (!isSolid) {
        const dx0 = wx - turbineX;
        const dy0 = wy - turbineY;
        for (let k = 0; k < 3 && !isSolid; k++) {
          const ba = angle + (k * Math.PI * 2) / 3;
          const cos = Math.cos(-ba);
          const sin = Math.sin(-ba);
          const lx = dx0 * cos - dy0 * sin;
          const ly = dx0 * sin + dy0 * cos;
          if (bladeContainsLocal(lx, ly, activeFeatures, time, k, geo)) isSolid = true;
        }
      }

      solid[i + j * w] = isSolid ? 1 : 0;
    }
  }
  return solid;
}

// Side-elevation obstacle: used when wind hits the rotor head-on. Seen from
// the side, the spinning rotor presents almost no frontal area — just its
// thickness — so it's modelled as a thin vertical band rather than the
// face-on 3-blade silhouette.
export function rasterizeObstaclesSideView(nx, ny, canvasW, canvasH, params) {
  const { turbineX, turbineY, bladeLen, hubR, towerHalfW, groundY } = params;
  const cellW = canvasW / nx;
  const cellH = canvasH / ny;
  const w = nx + 2;
  const h = ny + 2;
  const solid = new Uint8Array(w * h);
  const gY = groundY ?? canvasH - 14;
  const nacelleLen = hubR * 2.6;
  const nacelleHalf = hubR * 0.75;
  const rotorHalfW = hubR * 0.4;

  for (let j = 1; j <= ny; j++) {
    const wy = (j - 0.5) * cellH;
    for (let i = 1; i <= nx; i++) {
      const wx = (i - 0.5) * cellW;
      let isSolid = false;

      if (wy >= gY) isSolid = true;

      if (!isSolid && wx >= turbineX - towerHalfW && wx <= turbineX + towerHalfW && wy >= turbineY && wy < gY) {
        isSolid = true;
      }

      if (!isSolid && wx >= turbineX - hubR * 0.4 && wx <= turbineX + nacelleLen && wy >= turbineY - nacelleHalf && wy <= turbineY + nacelleHalf) {
        isSolid = true;
      }

      if (!isSolid && wx >= turbineX - rotorHalfW && wx <= turbineX + rotorHalfW && wy >= turbineY - bladeLen && wy <= turbineY + bladeLen) {
        isSolid = true;
      }

      solid[i + j * w] = isSolid ? 1 : 0;
    }
  }
  return solid;
}
