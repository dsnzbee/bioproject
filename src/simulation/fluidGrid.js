// A compact 2D incompressible-flow solver ("stable fluids": Stam 1999) with
// immersed solid obstacles, used to drive the wind-flow visualization.
// Runs headless (no DOM) so it can live inside a Web Worker.

export class FluidGrid {
  constructor(nx, ny) {
    this.nx = nx;
    this.ny = ny;
    this.w = nx + 2; // padded width incl. ghost cells
    this.h = ny + 2;
    const n = this.w * this.h;

    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.dye = new Float32Array(n);
    this.dye0 = new Float32Array(n);
    this.pressure = new Float32Array(n);
    this.div = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.solid = new Uint8Array(n);
  }

  idx(i, j) {
    return i + j * this.w;
  }

  setObstacle(mask) {
    this.solid = mask;
  }

  // zero velocity / dye inside solids, and apply open-tunnel boundary
  // conditions (Dirichlet inflow on the left, zero-gradient elsewhere)
  setBounds(kind, x) {
    const { nx, ny, w } = this;
    for (let j = 1; j <= ny; j++) {
      x[this.idx(0, j)] = x[this.idx(1, j)];
      x[this.idx(nx + 1, j)] = x[this.idx(nx, j)];
    }
    for (let i = 1; i <= nx; i++) {
      x[this.idx(i, 0)] = x[this.idx(i, 1)];
      x[this.idx(i, ny + 1)] = x[this.idx(i, ny)];
    }
    x[this.idx(0, 0)] = 0.5 * (x[this.idx(1, 0)] + x[this.idx(0, 1)]);
    x[this.idx(0, ny + 1)] = 0.5 * (x[this.idx(1, ny + 1)] + x[this.idx(0, ny)]);
    x[this.idx(nx + 1, 0)] = 0.5 * (x[this.idx(nx, 0)] + x[this.idx(nx + 1, 1)]);
    x[this.idx(nx + 1, ny + 1)] =
      0.5 * (x[this.idx(nx, ny + 1)] + x[this.idx(nx + 1, ny)]);

    if (kind !== 0) {
      const solid = this.solid;
      for (let n = 0; n < w * this.h; n++) if (solid[n]) x[n] = 0;
    }
  }

  diffuse(kind, x, x0, diff, dt, iters) {
    const { nx, ny, w } = this;
    const a = dt * diff * nx * ny;
    const c = 1 + 4 * a;
    for (let k = 0; k < iters; k++) {
      for (let j = 1; j <= ny; j++) {
        let idx = 1 + j * w;
        for (let i = 1; i <= nx; i++, idx++) {
          x[idx] = (x0[idx] + a * (x[idx - 1] + x[idx + 1] + x[idx - w] + x[idx + w])) / c;
        }
      }
      this.setBounds(kind, x);
    }
  }

  advect(kind, d, d0, u, v, dt) {
    const { nx, ny, w } = this;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const idx = i + j * w;
        let x = i - dt * u[idx];
        let y = j - dt * v[idx];
        if (x < 0.5) x = 0.5;
        if (x > nx + 0.5) x = nx + 0.5;
        if (y < 0.5) y = 0.5;
        if (y > ny + 0.5) y = ny + 0.5;
        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;
        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;
        d[idx] =
          s0 * (t0 * d0[i0 + j0 * w] + t1 * d0[i0 + j1 * w]) +
          s1 * (t0 * d0[i1 + j0 * w] + t1 * d0[i1 + j1 * w]);
      }
    }
    this.setBounds(kind, d);
  }

  project(iters) {
    const { nx, ny, w, u, v, pressure: p, div } = this;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const idx = i + j * w;
        div[idx] = -0.5 * ((u[idx + 1] - u[idx - 1]) / nx + (v[idx + w] - v[idx - w]) / ny);
        p[idx] = 0;
      }
    }
    this.setBounds(0, div);
    this.setBounds(0, p);

    for (let k = 0; k < iters; k++) {
      for (let j = 1; j <= ny; j++) {
        let idx = 1 + j * w;
        for (let i = 1; i <= nx; i++, idx++) {
          p[idx] = (div[idx] + p[idx - 1] + p[idx + 1] + p[idx - w] + p[idx + w]) / 4;
        }
      }
      this.setBounds(0, p);
    }

    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const idx = i + j * w;
        u[idx] -= 0.5 * nx * (p[idx + 1] - p[idx - 1]);
        v[idx] -= 0.5 * ny * (p[idx + w] - p[idx - w]);
      }
    }
    this.setBounds(1, u);
    this.setBounds(2, v);
  }

  // a collocated-grid Jacobi pressure solve can't "see" grid-Nyquist
  // checkerboard noise (it's divergence-free in the discrete sense), so a
  // light blur after each projection is the standard practical fix
  smoothField(kind, x) {
    const { nx, ny, w } = this;
    const tmp = x.slice();
    for (let j = 1; j <= ny; j++) {
      let idx = 1 + j * w;
      for (let i = 1; i <= nx; i++, idx++) {
        x[idx] = 0.5 * tmp[idx] + 0.125 * (tmp[idx - 1] + tmp[idx + 1] + tmp[idx - w] + tmp[idx + w]);
      }
    }
    this.setBounds(kind, x);
  }

  // adds small rotational forces back into the field so eddies shed by the
  // blades don't get smoothed away by numerical diffusion
  vorticityConfinement(dt, eps) {
    const { nx, ny, w, u, v, curl } = this;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const idx = i + j * w;
        curl[idx] = 0.5 * (v[idx + 1] - v[idx - 1] - (u[idx + w] - u[idx - w]));
      }
    }
    for (let j = 2; j < ny; j++) {
      for (let i = 2; i < nx; i++) {
        const idx = i + j * w;
        let nx_ = Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1]);
        let ny_ = Math.abs(curl[idx + w]) - Math.abs(curl[idx - w]);
        const len = Math.sqrt(nx_ * nx_ + ny_ * ny_) + 1e-5;
        nx_ /= len;
        ny_ /= len;
        const c = curl[idx];
        u[idx] += eps * ny_ * c * dt;
        v[idx] += -eps * nx_ * c * dt;
      }
    }
  }

  addInflow(windU) {
    const { nx, ny, w, u, v, solid } = this;
    const band = Math.max(2, Math.round(nx * 0.03));
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= band; i++) {
        const idx = i + j * w;
        if (solid[idx]) continue;
        u[idx] += (windU - u[idx]) * 0.55;
        v[idx] *= 0.5;
      }
    }
  }

  addDye(seeds) {
    const { w, dye, solid } = this;
    for (const s of seeds) {
      for (let i = 1; i <= 2; i++) {
        for (let dj = -1; dj <= 1; dj++) {
          const idx = i + (s.row + dj) * w;
          if (idx < 0 || idx >= dye.length || solid[idx]) continue;
          dye[idx] = Math.min(1, dye[idx] + s.amount);
        }
      }
    }
  }

  step(dt, { windU, obstacle, dyeSeeds, viscosity = 0.00002, vortEps = 5.5 }) {
    if (obstacle) this.setObstacle(obstacle);

    this.addInflow(windU);
    if (dyeSeeds && dyeSeeds.length) this.addDye(dyeSeeds);

    this.vorticityConfinement(dt, vortEps);

    [this.u, this.u0] = [this.u0, this.u];
    [this.v, this.v0] = [this.v0, this.v];
    this.diffuse(1, this.u, this.u0, viscosity, dt, 4);
    this.diffuse(2, this.v, this.v0, viscosity, dt, 4);
    this.project(26);
    this.smoothField(1, this.u);
    this.smoothField(2, this.v);

    [this.u, this.u0] = [this.u0, this.u];
    [this.v, this.v0] = [this.v0, this.v];
    this.advect(1, this.u, this.u0, this.u0, this.v0, dt);
    this.advect(2, this.v, this.v0, this.u0, this.v0, dt);
    this.project(26);
    this.smoothField(1, this.u);
    this.smoothField(2, this.v);

    [this.dye, this.dye0] = [this.dye0, this.dye];
    this.diffuse(0, this.dye, this.dye0, 0.000008, dt, 3);
    [this.dye, this.dye0] = [this.dye0, this.dye];
    this.advect(0, this.dye, this.dye0, this.u, this.v, dt);
    for (let n = 0; n < this.dye.length; n++) this.dye[n] *= 0.992;
  }
}
