import { FEATURE_LIST } from "../config/features";

export default function ControlPanel({
  windSpeed,
  onWindSpeed,
  windDirection,
  onWindDirection,
  turbulenceBoost,
  onTurbulenceBoost,
  features,
  onToggle,
  onPreset,
}) {
  return (
    <aside className="control-panel">
      <div className="control-block">
        <label className="control-label" htmlFor="wind-speed">
          Wind speed <span className="control-value">{windSpeed.toFixed(1)} m/s</span>
        </label>
        <input
          id="wind-speed"
          type="range"
          min="0"
          max="20"
          step="0.5"
          value={windSpeed}
          onChange={(e) => onWindSpeed(Number(e.target.value))}
        />
        <div className="control-scale">
          <span>Calm</span>
          <span>Strong gale</span>
        </div>
      </div>

      <div className="control-block">
        <label className="control-label" htmlFor="turbulence-boost">
          Turbulence intensity <span className="control-value">{turbulenceBoost.toFixed(1)}×</span>
        </label>
        <input
          id="turbulence-boost"
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={turbulenceBoost}
          onChange={(e) => onTurbulenceBoost(Number(e.target.value))}
        />
        <div className="control-scale">
          <span>Smooth</span>
          <span>Choppy</span>
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">Wind direction</div>
        <div className="preset-row">
          <button
            type="button"
            className={`btn ${windDirection === "angled" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => onWindDirection("angled")}
          >
            Angled view
          </button>
          <button
            type="button"
            className={`btn ${windDirection === "headOn" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => onWindDirection("headOn")}
          >
            Head-on (side view)
          </button>
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">Presets</div>
        <div className="preset-row">
          <button type="button" className="btn btn--ghost" onClick={() => onPreset("none")}>
            Conventional only
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onPreset("all")}>
            All biomimicry on
          </button>
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">Biomimicry features (right turbine)</div>
        <div className="feature-list">
          {FEATURE_LIST.map((f) => (
            <label key={f.key} className={`feature-row ${features[f.key] ? "feature-row--on" : ""}`}>
              <input
                type="checkbox"
                checked={!!features[f.key]}
                onChange={() => onToggle(f.key)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
