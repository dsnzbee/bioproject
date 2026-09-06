// Clean 2D silhouette: tower, nacelle, rotor line, ground. Readable over
// the field, not competing with it for detail — the field is the point.

function bendOffset(frac, leanPx) {
  return Math.pow(Math.max(0, frac), 1.6) * leanPx;
}

export function drawGround(ctx, canvasW, groundCanvasY, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundCanvasY);
  ctx.lineTo(canvasW, groundCanvasY);
  ctx.stroke();
  ctx.restore();
}

// worldToCanvas: (xWorld, yWorld) -> [xCanvas, yCanvas]
export function drawTurbine(ctx, { worldToCanvas, hubX, hubY, groundY, rotorRadius, leanPx = 0, stress = 0, color, hubColor, time = 0 }) {
  const segments = 10;
  const [hubCx, hubCy] = worldToCanvas(hubX, hubY);
  const [, groundCy] = worldToCanvas(hubX, groundY);
  const towerSpan = hubY - groundY;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // bent tower polyline
  ctx.beginPath();
  for (let s = 0; s <= segments; s++) {
    const frac = s / segments;
    const yWorld = groundY + towerSpan * frac;
    const [xc] = worldToCanvas(hubX, yWorld);
    const bent = xc + bendOffset(frac, leanPx);
    const [, yc] = worldToCanvas(hubX, yWorld);
    if (s === 0) ctx.moveTo(bent, yc);
    else ctx.lineTo(bent, yc);
  }
  ctx.stroke();

  const topX = hubCx + leanPx;

  // nacelle
  ctx.save();
  ctx.translate(topX, hubCy);
  ctx.fillStyle = color;
  ctx.fillRect(-4, -7, 26, 14);
  ctx.restore();

  // rotor line (edge-on disk) — the actual rotor-swept extent
  const [, topCy] = worldToCanvas(hubX, hubY + rotorRadius);
  const [, botCy] = worldToCanvas(hubX, hubY - rotorRadius);
  ctx.beginPath();
  ctx.moveTo(topX, topCy);
  ctx.lineTo(topX, botCy);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // hub dot
  ctx.beginPath();
  ctx.arc(topX, hubCy, 5, 0, Math.PI * 2);
  ctx.fillStyle = hubColor || color;
  ctx.fill();

  if (stress > 0.03) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 15);
    ctx.strokeStyle = `rgba(224,64,40,${0.4 + 0.5 * stress * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let x = hubCx, y = groundCy;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      y -= 8;
      x += (k % 2 === 0 ? 1 : -1) * 6 * stress;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}
