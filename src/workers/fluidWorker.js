// CFD compute backend. Runs off the main thread so the render loop never
// stalls waiting on the pressure-projection solve.
import { FluidGrid } from "../simulation/fluidGrid";

let grid = null;

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    grid = new FluidGrid(msg.nx, msg.ny);
    self.postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "step" && grid) {
    grid.step(msg.dt, {
      windU: msg.windU,
      obstacle: msg.obstacle,
      dyeSeeds: msg.dyeSeeds,
      viscosity: msg.viscosity,
      vortEps: msg.vortEps,
    });

    // slice() copies so the grid's own working arrays stay intact for the
    // next step (a plain transfer would detach them)
    const u = grid.u.slice();
    const v = grid.v.slice();
    const dye = grid.dye.slice();
    const curl = grid.curl.slice();

    self.postMessage(
      { type: "frame", requestId: msg.requestId, u, v, dye, curl },
      [u.buffer, v.buffer, dye.buffer, curl.buffer]
    );
  }
};
