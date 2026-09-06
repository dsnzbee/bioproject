import { bladePolyline, baseHalfWidth, trailHalfWidth } from "./turbineGeometry";

export function drawBackground(ctx, w, h, time, groundY) {
  void time;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#3a4048");
  sky.addColorStop(0.45, "#585d5f");
  sky.addColorStop(0.75, "#7a746a");
  sky.addColorStop(1, "#8f8570");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const gY = groundY ?? h - 14;
  const ground = ctx.createLinearGradient(0, gY - 30, 0, h);
  ground.addColorStop(0, "rgba(30,26,22,0)");
  ground.addColorStop(1, "#171310");
  ctx.fillStyle = ground;
  ctx.fillRect(0, gY - 30, w, h - gY + 30);

  const haze = ctx.createLinearGradient(0, gY - 60, 0, gY);
  haze.addColorStop(0, "rgba(230,220,200,0)");
  haze.addColorStop(1, "rgba(230,220,200,0.16)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, gY - 60, w, 60);
}

// ---------- dye / smoke ----------

let dyeOffscreen = null;
let dyeImageData = null;

function getDyeOffscreen(gridNx, gridNy) {
  if (!dyeOffscreen || dyeOffscreen.width !== gridNx || dyeOffscreen.height !== gridNy) {
    dyeOffscreen = document.createElement("canvas");
    dyeOffscreen.width = gridNx;
    dyeOffscreen.height = gridNy;
    dyeImageData = dyeOffscreen.getContext("2d").createImageData(gridNx, gridNy);
  }
  return dyeOffscreen;
}

export function drawDyeField(ctx, dye, gridNx, gridNy, w, h) {
  const off = getDyeOffscreen(gridNx, gridNy);
  const octx = off.getContext("2d");
  const gw = gridNx + 2;
  const data = dyeImageData.data;

  for (let j = 1; j <= gridNy; j++) {
    for (let i = 1; i <= gridNx; i++) {
      const d = dye[i + j * gw];
      const p = ((j - 1) * gridNx + (i - 1)) * 4;
      data[p] = 235;
      data[p + 1] = 240;
      data[p + 2] = 245;
      data[p + 3] = Math.min(255, d * 300);
    }
  }
  octx.putImageData(dyeImageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "blur(2.5px)";
  ctx.drawImage(off, 0, 0, w, h);
  ctx.restore();
}

// ---------- turbine structure ----------

function drawTower(ctx, x, topY, groundY, hubR) {
  const topW = hubR * 0.34;
  const botW = hubR * 0.78;
  const grad = ctx.createLinearGradient(x - botW, 0, x + botW, 0);
  grad.addColorStop(0, "#4a4844");
  grad.addColorStop(0.35, "#cdc9be");
  grad.addColorStop(0.55, "#e9e4d6");
  grad.addColorStop(0.75, "#8f8b80");
  grad.addColorStop(1, "#3a3834");

  ctx.beginPath();
  ctx.moveTo(x - topW, topY);
  ctx.lineTo(x + topW, topY);
  ctx.lineTo(x + botW, groundY);
  ctx.lineTo(x - botW, groundY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(30,28,24,0.4)";
  ctx.lineWidth = 1;
  for (let f = 0.3; f < 1; f += 0.28) {
    const yy = topY + (groundY - topY) * f;
    const ww = topW + (botW - topW) * f;
    ctx.beginPath();
    ctx.moveTo(x - ww, yy);
    ctx.lineTo(x + ww, yy);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(x, groundY + 3, botW * 1.7, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,8,6,0.35)";
  ctx.fill();
}

function drawNacelle(ctx, x, y, hubR) {
  const grad = ctx.createLinearGradient(x, y - hubR * 0.75, x, y + hubR * 0.75);
  grad.addColorStop(0, "#eae5d8");
  grad.addColorStop(0.5, "#b8b2a2");
  grad.addColorStop(1, "#615c52");
  ctx.fillStyle = grad;
  const rw = hubR * 2.3;
  const rh = hubR * 1.35;
  ctx.beginPath();
  ctx.moveTo(x - hubR * 0.4, y - rh / 2);
  ctx.lineTo(x + rw - hubR * 0.55, y - rh / 2 + rh * 0.1);
  ctx.quadraticCurveTo(x + rw, y, x + rw - hubR * 0.55, y + rh / 2 - rh * 0.1);
  ctx.lineTo(x - hubR * 0.4, y + rh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(30,28,24,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bladeFillStyle(ctx, hubR, isBiomimicked) {
  const span = Math.max(hubR, 1);
  const grad = ctx.createLinearGradient(0, -span, 0, span);
  grad.addColorStop(0, "#faf7ef");
  grad.addColorStop(0.42, isBiomimicked ? "#efece4" : "#e6e2d6");
  grad.addColorStop(0.7, isBiomimicked ? "#c4c0b4" : "#b6b0a2");
  grad.addColorStop(1, "#8a8476");
  return grad;
}

function pathForBlade(ctx, features, time, phase, geo) {
  const { lead, trail } = bladePolyline(features, time, phase, geo);
  ctx.beginPath();
  ctx.moveTo(lead[0][0], lead[0][1]);
  lead.forEach(([x, y]) => ctx.lineTo(x, y));
  for (let i = trail.length - 1; i >= 0; i--) ctx.lineTo(trail[i][0], trail[i][1]);
  ctx.closePath();
}

// decorative comb fringe drawn past the (near-smooth) trailing edge, rather
// than carving deep teeth into the fill silhouette
function drawOwlFringe(ctx, features, geo, accent) {
  const { bladeLen, hubR } = geo;
  const teeth = 11;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  for (let k = 0; k < teeth; k++) {
    const t = 0.55 + (k / (teeth - 1)) * 0.42;
    const s = hubR + t * (bladeLen - hubR);
    const baseY = trailHalfWidth(t, features, hubR);
    const len = hubR * (0.22 + (k % 2 === 0 ? 0.1 : 0));
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(s - hubR * 0.05, baseY - 1);
    ctx.lineTo(s + hubR * 0.06, baseY + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOneBlade(ctx, features, time, phase, isBiomimicked, geo, opacity = 1) {
  const { bladeLen, hubR } = geo;
  ctx.save();
  ctx.globalAlpha = opacity;
  pathForBlade(ctx, features, time, phase, geo);
  ctx.fillStyle = bladeFillStyle(ctx, hubR, isBiomimicked);
  ctx.fill();
  ctx.lineWidth = isBiomimicked ? 1.4 : 1;
  ctx.strokeStyle = isBiomimicked ? "rgba(244,239,230,0.85)" : "rgba(30,28,24,0.5)";
  ctx.stroke();

  if (features.dragonfly) {
    ctx.save();
    pathForBlade(ctx, features, time, phase, geo);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let t = 0.16; t < 0.9; t += 0.11) {
      const s = hubR + t * (bladeLen - hubR);
      const hw = baseHalfWidth(t, hubR);
      ctx.beginPath();
      ctx.moveTo(s, -hw);
      ctx.lineTo(s + hubR * 0.05, hw);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (features.owl) {
    drawOwlFringe(ctx, features, geo, isBiomimicked ? "rgba(255,255,255,0.85)" : "rgba(245,240,230,0.5)");
  }

  ctx.restore();
}

export function drawTurbine(ctx, { turbineX, turbineY, groundY, angle, angularSpeed, features, isBiomimicked, time, bladeLen, hubR }) {
  const geo = { bladeLen, hubR };
  drawTower(ctx, turbineX, turbineY + hubR * 0.7, groundY, hubR);
  drawNacelle(ctx, turbineX, turbineY, hubR);

  const activeFeatures = isBiomimicked ? features : {};
  const blur = Math.min(1, angularSpeed / 5);

  for (let i = 0; i < 3; i++) {
    const bladeAngle = angle + (i * Math.PI * 2) / 3;
    if (blur > 0.15) {
      for (const off of [0.09, 0.18]) {
        ctx.save();
        ctx.translate(turbineX, turbineY);
        ctx.rotate(bladeAngle - off * blur);
        drawOneBlade(ctx, activeFeatures, time, i, isBiomimicked, geo, 0.05 * blur);
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(turbineX, turbineY);
    ctx.rotate(bladeAngle);
    drawOneBlade(ctx, activeFeatures, time, i, isBiomimicked, geo, 1);
    ctx.restore();
  }

  const hubR2 = hubR * 0.72;
  const hubGrad = ctx.createRadialGradient(
    turbineX - hubR2 * 0.35, turbineY - hubR2 * 0.35, 1,
    turbineX, turbineY, hubR2
  );
  hubGrad.addColorStop(0, "#fbf6ea");
  hubGrad.addColorStop(0.6, isBiomimicked ? "#dcd6c8" : "#8a8579");
  hubGrad.addColorStop(1, "#2c2a25");
  ctx.beginPath();
  ctx.arc(turbineX, turbineY, hubR2, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,18,14,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Side elevation: wind hits the rotor head-on, so we look at the turbine
// from the side — tower, a slim nacelle box, and the rotor edge-on as a
// slender tapered blur (a spinning disk seen from the side has almost no
// visible blade shape, just a soft vertical smear).
export function drawTurbineSide(ctx, { turbineX, turbineY, groundY, angularSpeed, isBiomimicked, hubR, bladeLen }) {
  drawTower(ctx, turbineX, turbineY + hubR * 0.7, groundY, hubR);

  const nacelleGrad = ctx.createLinearGradient(turbineX, turbineY - hubR * 0.6, turbineX, turbineY + hubR * 0.6);
  nacelleGrad.addColorStop(0, "#eae5d8");
  nacelleGrad.addColorStop(0.5, "#b8b2a2");
  nacelleGrad.addColorStop(1, "#615c52");
  ctx.fillStyle = nacelleGrad;
  ctx.fillRect(turbineX - hubR * 0.55, turbineY - hubR * 0.6, hubR * 1.1, hubR * 1.2);

  const spin = Math.min(1, angularSpeed / 4);
  const rotorHalfW = hubR * (0.18 + 0.22 * spin);
  const accent = isBiomimicked ? "244,239,230" : "120,116,108";

  const grad = ctx.createLinearGradient(turbineX - rotorHalfW, 0, turbineX + rotorHalfW, 0);
  grad.addColorStop(0, `rgba(${accent},0)`);
  grad.addColorStop(0.5, `rgba(${accent},0.75)`);
  grad.addColorStop(1, `rgba(${accent},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(turbineX - rotorHalfW, turbineY - bladeLen, rotorHalfW * 2, bladeLen * 2);

  ctx.strokeStyle = `rgba(${accent},0.9)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(turbineX, turbineY - bladeLen);
  ctx.lineTo(turbineX, turbineY + bladeLen);
  ctx.stroke();

  const hubGrad = ctx.createRadialGradient(
    turbineX - hubR * 0.2, turbineY - hubR * 0.2, 1,
    turbineX, turbineY, hubR * 0.5
  );
  hubGrad.addColorStop(0, "#fbf6ea");
  hubGrad.addColorStop(0.6, isBiomimicked ? "#dcd6c8" : "#8a8579");
  hubGrad.addColorStop(1, "#2c2a25");
  ctx.beginPath();
  ctx.arc(turbineX, turbineY, hubR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
}
