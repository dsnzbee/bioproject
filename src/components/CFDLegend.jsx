import { useEffect, useRef } from "react";
import { paintLegendGradient, FIELD_DEFS } from "../cfd/visualization/colormaps";

const BAR_W = 22;
const BAR_H = 220;

export default function CFDLegend({ field, colormap, vmin, vmax }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, BAR_W, BAR_H);
    paintLegendGradient(ctx, BAR_W, BAR_H, colormap);
  }, [colormap]);

  const def = FIELD_DEFS[field] || FIELD_DEFS.velocityMag;
  const ticks = 5;
  const tickVals = Array.from({ length: ticks }, (_, i) => vmax - (i / (ticks - 1)) * (vmax - vmin));

  return (
    <div className="cfd-legend">
      <div className="cfd-legend__title">{def.label}</div>
      <div className="cfd-legend__body">
        <canvas ref={canvasRef} width={BAR_W} height={BAR_H} />
        <div className="cfd-legend__ticks" style={{ height: BAR_H }}>
          {tickVals.map((v, i) => (
            <span key={i}>{v.toFixed(1)}</span>
          ))}
        </div>
      </div>
      <div className="cfd-legend__units">{def.units}</div>
    </div>
  );
}
