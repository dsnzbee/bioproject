import { useEffect, useRef } from "react";

const CONV_COLOR = "#8a8074";
const BIO_COLOR = "#f4efe6";

function drawChart(canvas, points, convKey, bioKey) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (points.length < 2) return;

  const convVals = points.map((p) => p.conv[convKey]);
  const bioVals = points.map((p) => p.bio[bioKey]);
  const allVals = convVals.concat(bioVals);
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const padTop = 4;
  const padBottom = 4;
  const plotH = h - padTop - padBottom;
  const toX = (i) => (i / (points.length - 1)) * w;
  const toY = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;

  // faint midline grid
  ctx.strokeStyle = "rgba(240,229,217,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const drawLine = (vals, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = toX(i);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastX = toX(vals.length - 1);
    const lastY = toY(vals[vals.length - 1]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  };

  drawLine(convVals, CONV_COLOR);
  drawLine(bioVals, BIO_COLOR);
}

function Chart({ title, unit, history, convKey, bioKey, formatValue }) {
  const canvasRef = useRef(null);

  const points = history.current;
  useEffect(() => {
    if (canvasRef.current) drawChart(canvasRef.current, points, convKey, bioKey);
  });

  const last = points[points.length - 1];
  const fmt = formatValue || ((v) => v.toFixed(1));

  return (
    <div className="live-chart">
      <div className="live-chart__header">
        <span className="live-chart__title">{title}</span>
        <span className="live-chart__values">
          <span className="live-chart__value live-chart__value--conv">
            {last ? fmt(last.conv[convKey]) : "—"}
            {unit}
          </span>
          <span className="live-chart__value live-chart__value--bio">
            {last ? fmt(last.bio[bioKey]) : "—"}
            {unit}
          </span>
        </span>
      </div>
      <canvas ref={canvasRef} className="live-chart__canvas" />
    </div>
  );
}

export default function LiveGraphs({ history, time }) {
  void time; // reactive trigger only — actual data is read fresh from history.current
  return (
    <section className="live-graphs">
      <div className="live-graphs__title">
        Live graphs
        <span className="live-graphs__legend">
          <i className="dot dot--base" /> Conventional
          <i className="dot dot--bio" /> Biomimicked
        </span>
      </div>
      <Chart title="Noise" unit=" dB(A)" history={history} convKey="noiseDBA" bioKey="noiseDBA" />
      <Chart title="Power" unit=" kW" history={history} convKey="powerKW" bioKey="powerKW" formatValue={(v) => Math.round(v)} />
      <Chart title="RPM" unit="" history={history} convKey="rpm" bioKey="rpm" />
    </section>
  );
}
