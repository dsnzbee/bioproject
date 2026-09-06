// Colormap definitions shared by the cut-plane shader (GLSL) and the HTML
// legend (canvas gradient) so the two can never show different colours for
// the same value.

export const COLORMAP_GLSL = `
  vec3 cmapJet(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c;
    c.r = clamp(1.5 - abs(4.0 * t - 3.0), 0.0, 1.0);
    c.g = clamp(1.5 - abs(4.0 * t - 2.0), 0.0, 1.0);
    c.b = clamp(1.5 - abs(4.0 * t - 1.0), 0.0, 1.0);
    return c;
  }

  vec3 cmapViridis(float t) {
    t = clamp(t, 0.0, 1.0);
    const vec3 c0 = vec3(0.267, 0.005, 0.329);
    const vec3 c1 = vec3(0.283, 0.141, 0.458);
    const vec3 c2 = vec3(0.254, 0.265, 0.530);
    const vec3 c3 = vec3(0.207, 0.372, 0.553);
    const vec3 c4 = vec3(0.164, 0.471, 0.558);
    const vec3 c5 = vec3(0.128, 0.567, 0.551);
    const vec3 c6 = vec3(0.135, 0.659, 0.518);
    const vec3 c7 = vec3(0.267, 0.749, 0.441);
    const vec3 c8 = vec3(0.478, 0.821, 0.318);
    const vec3 c9 = vec3(0.741, 0.873, 0.150);
    const vec3 c10 = vec3(0.993, 0.906, 0.144);
    float f = t * 10.0;
    float i = floor(f);
    float frac = f - i;
    if (i < 1.0) return mix(c0, c1, frac);
    if (i < 2.0) return mix(c1, c2, frac);
    if (i < 3.0) return mix(c2, c3, frac);
    if (i < 4.0) return mix(c3, c4, frac);
    if (i < 5.0) return mix(c4, c5, frac);
    if (i < 6.0) return mix(c5, c6, frac);
    if (i < 7.0) return mix(c6, c7, frac);
    if (i < 8.0) return mix(c7, c8, frac);
    if (i < 9.0) return mix(c8, c9, frac);
    return mix(c9, c10, frac);
  }

  vec3 cmapCoolwarm(float t) {
    t = clamp(t, 0.0, 1.0);
    const vec3 cold = vec3(0.230, 0.299, 0.754);
    const vec3 mid = vec3(0.865, 0.865, 0.865);
    const vec3 warm = vec3(0.706, 0.016, 0.150);
    if (t < 0.5) return mix(cold, mid, t * 2.0);
    return mix(mid, warm, (t - 0.5) * 2.0);
  }

  vec3 applyColormap(float t, int mapId) {
    if (mapId == 1) return cmapViridis(t);
    if (mapId == 2) return cmapCoolwarm(t);
    return cmapJet(t);
  }
`;

const STOPS = {
  jet: [
    [0, [0, 0, 0.5]], [0.125, [0, 0, 1]], [0.375, [0, 1, 1]],
    [0.625, [1, 1, 0]], [0.875, [1, 0, 0]], [1, [0.5, 0, 0]],
  ],
  viridis: [
    [0, [0.267, 0.005, 0.329]], [0.2, [0.254, 0.265, 0.53]], [0.4, [0.164, 0.471, 0.558]],
    [0.6, [0.135, 0.659, 0.518]], [0.8, [0.478, 0.821, 0.318]], [1, [0.993, 0.906, 0.144]],
  ],
  coolwarm: [
    [0, [0.23, 0.299, 0.754]], [0.5, [0.865, 0.865, 0.865]], [1, [0.706, 0.016, 0.15]],
  ],
  greyscale: [[0, [0.05, 0.05, 0.05]], [1, [1, 1, 1]]],
};

export const COLORMAP_IDS = { jet: 0, viridis: 1, coolwarm: 2, greyscale: 3 };

// CPU-side colormap sample, used by the 2D canvas field renderer (which
// paints an ImageData directly rather than running a fragment shader per
// pixel — see cfd/render2d/renderField2D.js). Shares the exact same STOPS
// table as the legend gradient so the two can never disagree.
export function sampleColormapRGB(colormapName, t) {
  const stops = STOPS[colormapName] || STOPS.jet;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (tc >= t0 && tc <= t1) {
      const f = (tc - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  const last = stops[stops.length - 1][1];
  return last;
}

export function paintLegendGradient(ctx, w, h, colormapName) {
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  for (const [t, [r, g, b]] of STOPS[colormapName] || STOPS.jet) {
    grad.addColorStop(t, `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export const FIELD_DEFS = {
  velocityMag: { label: "Velocity magnitude", units: "m/s" },
  velocityX: { label: "Velocity — X (streamwise)", units: "m/s" },
  velocityY: { label: "Velocity — Y (vertical)", units: "m/s" },
  deficit: { label: "Velocity deficit (U / U∞)", units: "×" },
  vorticity: { label: "Vorticity (∂v/∂x − ∂u/∂y)", units: "1/s" },
  // this is the raw projection potential phi solved by the Jacobi step
  // (u_new = u* - grad(phi)), not a density/dt-scaled Pascal reading —
  // labelled honestly rather than implying a calibrated pressure field
  pressure: { label: "Pressure potential (relative)", units: "m²/s" },
};
