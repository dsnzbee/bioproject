import * as THREE from "three";

// Stage 1 obstacle: a plain solid sphere sized to the rotor's swept disk,
// so the wake it produces is a meaningful preview of what the actuator-line
// rotor (stage 2) will later shape more precisely. This is intentionally a
// hard immersed-boundary obstacle — the real rotor will NOT be meshed like
// this; it will be a body-force source term instead, per the spec.
export function buildSphereObstacleTexture(layout, spheres) {
  const { width, height, nx, ny, nz, tilesX } = layout;
  const data = new Uint8Array(width * height * 4);

  for (let k = 0; k < nz; k++) {
    const tileCol = k % tilesX;
    const tileRow = Math.floor(k / tilesX);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let inside = false;
        for (const s of spheres) {
          const dx = i - s.centerCell[0];
          const dy = j - s.centerCell[1];
          const dz = k - s.centerCell[2];
          if (dx * dx + dy * dy + dz * dz <= s.radiusCells * s.radiusCells) {
            inside = true;
            break;
          }
        }
        const px = tileCol * nx + i;
        const py = tileRow * ny + j;
        const idx = (py * width + px) * 4;
        const v = inside ? 255 : 0;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
