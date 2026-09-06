import { useEffect, useRef } from "react";
import { useFluidWorker } from "../hooks/useFluidWorker";
import { rasterizeObstacles, rasterizeObstaclesSideView } from "../simulation/turbineGeometry";
import { computeRotationSpeed } from "../simulation/rotationDynamics";
import {
  createStreamParticles,
  stepStreamParticles,
  drawStreamParticles,
  createVortexTracers,
  stepVortexTracers,
  drawVortexTracers,
} from "../simulation/streamlines";
import { drawBackground, drawDyeField, drawTurbine, drawTurbineSide } from "../simulation/sceneRender";

const GRID_NX = 150;
const GRID_NY = 70;
const SEED_ROWS = 22;
const SEED_MARGIN_FRAC = 0.05;
const VORTEX_COUNT = 26;

const SEED_FRACS = Array.from({ length: SEED_ROWS }, (_, i) =>
  SEED_MARGIN_FRAC + (i / (SEED_ROWS - 1)) * (1 - 2 * SEED_MARGIN_FRAC)
);
const SEED_GRID_ROWS = SEED_FRACS.map((f) => Math.max(1, Math.min(GRID_NY, Math.round(f * GRID_NY))));

export default function TurbineScene({
  title,
  badge,
  isBiomimicked,
  features,
  windSpeed,
  stats,
  windDirection = "angled",
  turbulenceBoost = 1,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  const angleRef = useRef(0);
  const timeRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef(0);
  const streamRef = useRef(null);
  const vortexRef = useRef(null);

  const { postStep, frameRef } = useFluidWorker(GRID_NX, GRID_NY);

  const liveRef = useRef({ features, windSpeed, stats, isBiomimicked, windDirection, turbulenceBoost });
  useEffect(() => {
    liveRef.current = { features, windSpeed, stats, isBiomimicked, windDirection, turbulenceBoost };
  }, [features, windSpeed, stats, isBiomimicked, windDirection, turbulenceBoost]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const cw = Math.max(80, Math.round(entry.contentRect.width));
      const ch = Math.max(80, Math.round(entry.contentRect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimsRef.current = { w: cw, h: ch };
      if (!streamRef.current) {
        streamRef.current = createStreamParticles(SEED_ROWS, ch, ch * SEED_MARGIN_FRAC, cw);
      }
    });
    ro.observe(wrap);

    lastRef.current = performance.now();

    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      const { w, h } = dimsRef.current;
      if (!w || !h || !streamRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      timeRef.current += dt;

      const { features, windSpeed, stats, isBiomimicked, windDirection, turbulenceBoost } = liveRef.current;
      const headOn = windDirection === "headOn";

      const rotSpeed = computeRotationSpeed(windSpeed, stats);
      angleRef.current += rotSpeed * dt;

      const turbineX = w * 0.27;
      const turbineY = h * 0.5;
      const groundY = h - Math.max(18, h * 0.045);
      const bladeLen = Math.min(w * 0.24, Math.min(turbineY, groundY - turbineY) * 0.92);
      const hubR = bladeLen * 0.13;
      const bandYMin = Math.max(0, turbineY - bladeLen * 1.5);
      const bandYMax = Math.min(h, turbineY + bladeLen * 1.5);

      if (!vortexRef.current) {
        vortexRef.current = createVortexTracers(VORTEX_COUNT, bandYMin, bandYMax, w);
      }

      const obstacle = headOn
        ? rasterizeObstaclesSideView(GRID_NX, GRID_NY, w, h, {
            turbineX,
            turbineY,
            groundY,
            bladeLen,
            hubR,
            towerHalfW: hubR * 0.5,
          })
        : rasterizeObstacles(GRID_NX, GRID_NY, w, h, {
            turbineX,
            turbineY,
            groundY,
            angle: angleRef.current,
            features,
            isBiomimicked,
            time: timeRef.current,
            bladeLen,
            hubR,
            towerHalfW: hubR * 0.5,
          });

      const dyeSeeds = SEED_GRID_ROWS.map((row) => ({
        row,
        amount: 0.1 + windSpeed * 0.012,
      }));

      const vortEps = (2 + (stats.turbulence / 100) * 8) * turbulenceBoost;

      postStep({
        dt: Math.min(dt, 0.033),
        windU: windSpeed * 5,
        obstacle,
        dyeSeeds,
        viscosity: 0.00002,
        vortEps,
      });

      drawBackground(ctx, w, h, timeRef.current, groundY);

      const frame = frameRef.current;
      if (frame) {
        drawDyeField(ctx, frame.dye, GRID_NX, GRID_NY, w, h);
      }

      stepVortexTracers(vortexRef.current, dt, {
        frame,
        gridNx: GRID_NX,
        gridNy: GRID_NY,
        canvasW: w,
        canvasH: h,
        bandYMin,
        bandYMax,
      });
      drawVortexTracers(ctx, vortexRef.current);

      stepStreamParticles(streamRef.current, dt, {
        frame,
        gridNx: GRID_NX,
        gridNy: GRID_NY,
        canvasW: w,
        canvasH: h,
        windSpeed,
      });
      drawStreamParticles(ctx, streamRef.current);

      if (headOn) {
        drawTurbineSide(ctx, {
          turbineX,
          turbineY,
          groundY,
          angularSpeed: rotSpeed,
          isBiomimicked,
          hubR,
          bladeLen,
        });
      } else {
        drawTurbine(ctx, {
          turbineX,
          turbineY,
          groundY,
          angle: angleRef.current,
          angularSpeed: rotSpeed,
          features,
          isBiomimicked,
          time: timeRef.current,
          bladeLen,
          hubR,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`scene-card ${isBiomimicked ? "scene-card--bio" : "scene-card--base"}`}>
      <div className="scene-card__header">
        <h3>{title}</h3>
        <span className="scene-card__badge">{badge}</span>
      </div>
      <div className="scene-card__canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
