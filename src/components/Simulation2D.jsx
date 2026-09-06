import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GPUFluidSolver } from "../cfd/gpu/GPUFluidSolver";
import { computeAtlasLayout } from "../cfd/gpu/atlas";
import { buildSphereObstacleTexture } from "../cfd/obstacle/staticObstacle";
import { paintFieldContour, traceStreamlines, drawStreamlines } from "../cfd/render2d/renderField2D";
import { drawGround, drawTurbine } from "../cfd/render2d/turbineSilhouette2D";
import { physicsParamsForFeatures } from "../cfd/aero/biomimicryToPhysics";
import { cpFromCt, powerWatts } from "../cfd/aero/momentumTheory";
import { computeRotationSpeed } from "../simulation/rotationDynamics";
import { smoothstep } from "../utils/math";
import { FEATURE_LIST } from "../config/features";
import {
  ROTOR, DOMAIN_2D, QUALITY_TIERS_2D, INFLOW, SOLVER_DT, MAX_SUBSTEPS_PER_FRAME, AIR, GUST,
} from "../cfd/config";
import CFDLegend from "./CFDLegend";

const D = ROTOR.diameterM;
const DOMAIN_SIZE = { x: DOMAIN_2D.streamwiseD * D, y: DOMAIN_2D.heightD * D };
const ROTOR_X_LOCAL = DOMAIN_2D.rotorFromInletD * D; // render-local (0 = inlet)
const DOMAIN_ORIGIN_X = -ROTOR_X_LOCAL; // solver-space offset so rotor sits at solver-x = 0
const HUB_Y = ROTOR.hubHeightM;
const ROTOR_RADIUS = D / 2;

function makePane(renderer, tier) {
  const layout = computeAtlasLayout(tier.nx, tier.ny, 1);
  const cellSize = { x: DOMAIN_SIZE.x / tier.nx, y: DOMAIN_SIZE.y / tier.ny, z: DOMAIN_SIZE.x / tier.nx };
  const nacelleRadiusCells = (ROTOR_RADIUS * 0.14) / cellSize.x;
  const obstacleTexture = buildSphereObstacleTexture(layout, [
    { centerCell: [ROTOR_X_LOCAL / cellSize.x, HUB_Y / cellSize.y, 0], radiusCells: nacelleRadiusCells },
  ]);
  const solver = new GPUFluidSolver(renderer, {
    nx: tier.nx, ny: tier.ny, nz: 1,
    domainSizeM: { x: DOMAIN_SIZE.x, y: DOMAIN_SIZE.y, z: cellSize.z },
    domainOrigin: { x: DOMAIN_ORIGIN_X, y: 0, z: 0 },
    obstacleTexture,
    refHeightM: HUB_Y,
    shearExponent: INFLOW.shearExponent,
    turbulenceIntensity: INFLOW.turbulenceIntensity,
    rotorDisks: [
      { center: new THREE.Vector3(0, HUB_Y, 0), radiusWorld: ROTOR_RADIUS },
      { center: new THREE.Vector3(1e6, 1e6, 0), radiusWorld: ROTOR_RADIUS }, // unused 2nd slot, parked far away
    ],
  });
  return { solver, cellSize, layout };
}

function fitWorldToCanvas(canvasW, canvasH, view) {
  const baseScale = canvasW / DOMAIN_SIZE.x;
  const scale = baseScale * view.scale;
  return (xLocal, yLocal) => [
    (xLocal - view.panX) * scale,
    canvasH - (yLocal - view.panY) * scale,
  ];
}

function seedRake(count = 14) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({ x: 4, y: 4 + (i / (count - 1)) * (DOMAIN_SIZE.y - 8) });
  }
  return seeds;
}

export default function Simulation2D({ windSpeed, turbulenceBoost, features, gustTick, viewMode, cfdField, cfdColormap, quality }) {
  const convRef = useRef(null);
  const bioRef = useRef(null);
  const diffRef = useRef(null);
  const wrapRef = useRef(null);
  const [legend, setLegend] = useState({ vmin: 0, vmax: 15 });

  const liveRef = useRef({ windSpeed, turbulenceBoost, features, gustTick, viewMode, cfdField, cfdColormap });
  useEffect(() => {
    liveRef.current = { windSpeed, turbulenceBoost, features, gustTick, viewMode, cfdField, cfdColormap };
  }, [windSpeed, turbulenceBoost, features, gustTick, viewMode, cfdField, cfdColormap]);

  const viewRef = useRef({ scale: 1, panX: 0, panY: 0 });

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
    const tier = QUALITY_TIERS_2D[quality] || QUALITY_TIERS_2D.medium;
    const conv = makePane(renderer, tier);
    const bio = makePane(renderer, tier);
    const seeds = seedRake();

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let accumulator = 0;
    let gustT = -1;
    let lastGustTick = liveRef.current.gustTick;
    let lastReadoutPush = 0;

    const onWheel = (e, canvasEl) => {
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const factor = Math.exp(-e.deltaY * 0.001);
      const v = viewRef.current;
      const newScale = Math.min(6, Math.max(0.4, v.scale * factor));
      const worldXAtMouse = mx / (rect.width / DOMAIN_SIZE.x / v.scale) + v.panX;
      v.scale = newScale;
      v.panX = worldXAtMouse - mx / (rect.width / DOMAIN_SIZE.x / v.scale);
    };
    let dragging = false;
    let lastMouse = [0, 0];
    const onDown = (e) => { dragging = true; lastMouse = [e.clientX, e.clientY]; };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = convRef.current.getBoundingClientRect();
      const scale = (rect.width / DOMAIN_SIZE.x) * viewRef.current.scale;
      viewRef.current.panX -= (e.clientX - lastMouse[0]) / scale;
      viewRef.current.panY += (e.clientY - lastMouse[1]) / scale;
      lastMouse = [e.clientX, e.clientY];
    };
    const onUp = () => { dragging = false; };

    const canvases = [convRef.current, bioRef.current, diffRef.current].filter(Boolean);
    for (const c of canvases) {
      c.addEventListener("wheel", (e) => onWheel(e, c), { passive: false });
      c.addEventListener("mousedown", onDown);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    const loop = (now) => {
      const dtMs = now - last;
      const dt = Math.min(0.05, dtMs / 1000);
      last = now;
      time += dt;

      const { windSpeed, turbulenceBoost, features, gustTick, viewMode, cfdField, cfdColormap } = liveRef.current;

      if (gustTick !== lastGustTick) {
        lastGustTick = gustTick;
        gustT = 0;
      }
      let gustFactor = 1;
      let gustActive = false;
      if (gustT >= 0) {
        gustT += dt;
        gustActive = gustT < GUST.durationS;
        const phase = gustActive ? Math.sin((gustT / GUST.durationS) * Math.PI) : 0;
        gustFactor = 1 + (GUST.speedMultiplier - 1) * phase;
        if (gustT > GUST.durationS) gustT = -1;
      }
      const uRef = Math.max(0.5, windSpeed * gustFactor);

      const convPhys = physicsParamsForFeatures({});
      const bioPhys = physicsParamsForFeatures(features);
      convPhys.turbulenceIntensity *= turbulenceBoost;
      bioPhys.turbulenceIntensity *= turbulenceBoost;

      accumulator = Math.min(accumulator + dt, SOLVER_DT * MAX_SUBSTEPS_PER_FRAME * 2);
      let substeps = 0;
      while (accumulator >= SOLVER_DT && substeps < MAX_SUBSTEPS_PER_FRAME) {
        conv.solver.step(SOLVER_DT, {
          uRef, inflowDirX: 1, inflowDirZ: 0,
          thrustCoefficient: convPhys.thrustCoefficient,
          turbulentViscosity: convPhys.turbulentViscosity,
          turbulenceIntensity: convPhys.turbulenceIntensity,
        });
        bio.solver.step(SOLVER_DT, {
          uRef, inflowDirX: 1, inflowDirZ: 0,
          thrustCoefficient: bioPhys.thrustCoefficient,
          turbulentViscosity: bioPhys.turbulentViscosity,
          turbulenceIntensity: bioPhys.turbulenceIntensity,
        });
        accumulator -= SOLVER_DT;
        substeps++;
      }

      const convField = conv.solver.readFullVelocityField();
      const bioField = bio.solver.readFullVelocityField();
      const needsPressure = cfdField === "pressure";
      const convPress = needsPressure ? conv.solver.readFullPressureField() : null;
      const bioPress = needsPressure ? bio.solver.readFullPressureField() : null;

      const vmax = cfdField === "deficit" ? 1.3 : cfdField === "vorticity" ? 2.5 : cfdField === "pressure" ? uRef * uRef * 0.6 : Math.max(4, uRef * 1.3);
      const vmin = cfdField === "vorticity" || cfdField === "pressure" || cfdField === "velocityY" ? -vmax : 0;
      if (now - lastReadoutPush > 200) {
        lastReadoutPush = now;
        setLegend((r) => (r.vmin === vmin && r.vmax === vmax ? r : { vmin, vmax }));
      }

      const drawOne = (canvasEl, field, pressField, phys, isBio) => {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext("2d");
        const w = canvasEl.width, h = canvasEl.height;
        const view = viewRef.current;
        const w2c = fitWorldToCanvas(w, h, view);

        paintFieldContour(ctx, w, h, field, pressField, {
          fieldType: cfdField, colormapName: cfdColormap, vmin, vmax, cellSize: conv.cellSize, uRef, flipY: true,
        });

        const lines = traceStreamlines(field, seeds, { cellSize: conv.cellSize, domainW: DOMAIN_SIZE.x, domainH: DOMAIN_SIZE.y });
        drawStreamlines(ctx, lines, w2c, cfdColormap, field, conv.cellSize, uRef);

        const loadFactor = gustActive ? smoothstep(gustT, 0, GUST.durationS * 0.3) * (1 - smoothstep(gustT, GUST.durationS * 0.7, GUST.durationS)) : 0;
        const leanPxWorld = isBio ? loadFactor * 26 : loadFactor * 1.5;
        const [, groundCy] = w2c(0, 0);
        drawGround(ctx, w, groundCy, "rgba(20,18,16,0.5)");
        drawTurbine(ctx, {
          worldToCanvas: w2c,
          hubX: ROTOR_X_LOCAL, hubY: HUB_Y, groundY: 0,
          rotorRadius: ROTOR_RADIUS,
          leanPx: (leanPxWorld) * ((w / DOMAIN_SIZE.x) * view.scale),
          stress: isBio ? 0 : loadFactor,
          color: isBio ? "#e0a458" : "#cfcabd",
          hubColor: isBio ? "#c98a3f" : "#9a9488",
          time,
        });

        const ct = phys.thrustCoefficient;
        const cp = cpFromCt(ct);
        const rotSpeed = computeRotationSpeed(uRef, phys.stats);
        const area = Math.PI * ROTOR_RADIUS * ROTOR_RADIUS;
        const power = powerWatts(cp, AIR.density, area, uRef) / 1000;

        ctx.save();
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(20,18,16,0.62)";
        ctx.fillRect(8, h - 92, 168, 84);
        ctx.fillStyle = "#f0e5d9";
        const lines2 = [
          `Power: ${power.toFixed(0)} kW`,
          `Cp: ${cp.toFixed(3)}  (Ct ${ct.toFixed(2)})`,
          `Rotor speed: ${(rotSpeed * 9.5493).toFixed(1)} rpm`,
          `Cut-in: ${phys.cutInSpeed.toFixed(1)} m/s`,
          `Noise: ${phys.noiseDBA.toFixed(0)} dB(A) (illustrative)`,
        ];
        lines2.forEach((t2, i) => ctx.fillText(t2, 14, h - 74 + i * 15));
        ctx.restore();
      };

      if (viewMode === "diff") {
        if (diffRef.current) {
          const ctx = diffRef.current.getContext("2d");
          const w = diffRef.current.width, h = diffRef.current.height;
          const dvmax = Math.max(3, uRef * 0.5);
          const diffData = new Float32Array(convField.data.length);
          for (let idx = 0; idx < diffData.length; idx += 4) {
            diffData[idx] = bioField.data[idx] - convField.data[idx];
            diffData[idx + 1] = bioField.data[idx + 1] - convField.data[idx + 1];
          }
          paintFieldContour(ctx, w, h, { data: diffData, width: convField.width, height: convField.height }, null, {
            fieldType: "velocityX", colormapName: "coolwarm", vmin: -dvmax, vmax: dvmax, cellSize: conv.cellSize, uRef, flipY: true,
          });
          const [, groundCy] = fitWorldToCanvas(w, h, viewRef.current)(0, 0);
          drawGround(ctx, w, groundCy, "rgba(20,18,16,0.5)");
          ctx.save();
          ctx.font = "600 12px system-ui, sans-serif";
          ctx.fillStyle = "#241f1a";
          ctx.fillText("Biomimicked − Conventional (streamwise velocity)", 12, 20);
          ctx.restore();
        }
      } else {
        drawOne(convRef.current, convField, convPress, convPhys, false);
        drawOne(bioRef.current, bioField, bioPress, bioPhys, true);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const resizeObserver = new ResizeObserver(() => {
      for (const c of canvases) {
        const rect = c.getBoundingClientRect();
        c.width = Math.max(2, Math.round(rect.width));
        c.height = Math.max(2, Math.round(rect.height));
      }
    });
    if (wrapRef.current) resizeObserver.observe(wrapRef.current);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      conv.solver.dispose();
      bio.solver.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  const activeCount = FEATURE_LIST.filter((f) => features[f.key]).length;

  return (
    <div className="sim2d-outer" ref={wrapRef}>
      {viewMode === "diff" ? (
        <div className="sim2d-pane sim2d-pane--full">
          <canvas ref={diffRef} />
        </div>
      ) : (
        <div className="sim2d-split">
          <div className="sim2d-pane">
            <div className="sim2d-pane__label">Conventional — baseline</div>
            <canvas ref={convRef} />
          </div>
          <div className="sim2d-divider" />
          <div className="sim2d-pane">
            <div className="sim2d-pane__label sim2d-pane__label--bio">
              Biomimicked — {activeCount}/{FEATURE_LIST.length} features
            </div>
            <canvas ref={bioRef} />
          </div>
        </div>
      )}
      <CFDLegend field={cfdField} colormap={cfdColormap} vmin={legend.vmin} vmax={legend.vmax} />
    </div>
  );
}
