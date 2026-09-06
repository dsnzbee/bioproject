import { BASELINE } from "../config/features";
import { computeLiveMetrics } from "../simulation/liveMetrics";

function formatDelta(a, b) {
  if (typeof a === "boolean") return a === b ? "≈0" : "changed";
  const diff = b - a;
  if (Math.abs(diff) < 0.05) return "≈0";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(diff % 1 === 0 ? 0 : 1)}`;
}

function Row({ label, conv, bio, unit = "", format }) {
  const fmt = format || ((v) => `${v}${unit}`);
  return (
    <tr>
      <td className="live-table__label">{label}</td>
      <td>{fmt(conv)}</td>
      <td>{fmt(bio)}</td>
      <td className="live-table__delta">{formatDelta(conv, bio)}</td>
    </tr>
  );
}

export default function StatsPanel({ windSpeed, turbulenceBoost, stats, time }) {
  const conv = computeLiveMetrics(windSpeed, BASELINE, turbulenceBoost, time);
  const bio = computeLiveMetrics(windSpeed, stats, turbulenceBoost, time);
  const yesNo = (v) => (v ? "Yes" : "No");

  return (
    <section className="live-table-wrap">
      <div className="live-table-wrap__title">Live comparison</div>
      <table className="live-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Conventional</th>
            <th>Biomimicked</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Power" conv={conv.powerKW} bio={bio.powerKW} unit=" kW" />
          <Row label="Cp" conv={conv.cp} bio={bio.cp} />
          <Row label="RPM" conv={conv.rpm} bio={bio.rpm} />
          <Row label="Noise" conv={conv.noiseDBA} bio={bio.noiseDBA} unit=" dB(A)" />
          <Row label="De-rated" conv={conv.deRated} bio={bio.deRated} format={yesNo} />
          <Row label="AEP" conv={conv.aepMWh} bio={bio.aepMWh} unit=" MWh" />
          <Row label="Cut-in" conv={conv.cutIn} bio={bio.cutIn} unit=" m/s" />
          <Row label="Peak root moment" conv={conv.peakRootMoment} bio={bio.peakRootMoment} />
          <Row
            label="Stalled elements"
            conv={conv.stalledElements}
            bio={bio.stalledElements}
            format={(v) => `${v}/${conv.stallElementCount}`}
          />
          <Row label="Flow coherence" conv={conv.flowCoherence} bio={bio.flowCoherence} unit="%" />
        </tbody>
      </table>
    </section>
  );
}
