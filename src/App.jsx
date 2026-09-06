import { useEffect, useMemo, useRef, useState } from "react";
import ControlPanel from "./components/ControlPanel";
import TurbineScene from "./components/TurbineScene";
import StatsPanel from "./components/StatsPanel";
import LiveGraphs from "./components/LiveGraphs";
import InfoPage from "./components/InfoPage";
import { computeStats, FEATURE_LIST, BASELINE } from "./config/features";
import { computeLiveMetrics } from "./simulation/liveMetrics";
import "./App.css";

const HISTORY_LENGTH = 90; // ~13.5s of rolling history at the 150ms tick below

const ALL_ON = Object.fromEntries(FEATURE_LIST.map((f) => [f.key, true]));
const ALL_OFF = Object.fromEntries(FEATURE_LIST.map((f) => [f.key, false]));

export default function App() {
  const [windSpeed, setWindSpeed] = useState(8);
  const [windDirection, setWindDirection] = useState("angled");
  const [turbulenceBoost, setTurbulenceBoost] = useState(1);
  const [features, setFeatures] = useState(ALL_ON);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [route, setRoute] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const stats = useMemo(() => computeStats(features), [features]);
  const activeCount = FEATURE_LIST.filter((f) => features[f.key]).length;

  // ticks the live-comparison table + graphs a few times a second so the
  // readouts react to the same simulated gusts the canvas is showing,
  // instead of sitting still between slider moves. History lives in a ref
  // (not state) so the rolling buffer doesn't force a full-tree re-render
  // every 150ms — only the changing `liveTime` prop does, and LiveGraphs
  // reads the ref fresh each time it redraws.
  const [liveTime, setLiveTime] = useState(0);
  const startRef = useRef(null);
  const historyRef = useRef([]);
  const liveInputsRef = useRef({ windSpeed, turbulenceBoost, stats });
  useEffect(() => {
    liveInputsRef.current = { windSpeed, turbulenceBoost, stats };
  }, [windSpeed, turbulenceBoost, stats]);

  useEffect(() => {
    startRef.current = performance.now();
    const id = setInterval(() => {
      const t = (performance.now() - startRef.current) / 1000;
      const { windSpeed, turbulenceBoost, stats } = liveInputsRef.current;
      const conv = computeLiveMetrics(windSpeed, BASELINE, turbulenceBoost, t);
      const bio = computeLiveMetrics(windSpeed, stats, turbulenceBoost, t);
      historyRef.current = [...historyRef.current, { t, conv, bio }].slice(-HISTORY_LENGTH);
      setLiveTime(t);
    }, 150);
    return () => clearInterval(id);
  }, []);

  const toggleFeature = (key) => setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  const applyPreset = (which) => setFeatures(which === "all" ? ALL_ON : ALL_OFF);

  if (route === "#information") {
    return <InfoPage onBack={() => { window.location.hash = ""; }} />;
  }

  return (
    <div className={`app ${sidebarOpen ? "" : "app--fullscreen"}`}>
      {sidebarOpen && (
        <header className="app-header">
          <div className="app-header__actions">
            <button
              type="button"
              className="panel-toggle-btn"
              onClick={() => { window.location.hash = "#information"; }}
            >
              ℹ view other information
            </button>
            <button type="button" className="panel-toggle-btn" onClick={() => setSidebarOpen(false)}>
              ✕ Hide panel
            </button>
          </div>
        </header>
      )}

      <div className="app-body">
        <main className="sim-area">
          {!sidebarOpen && (
            <button type="button" className="panel-toggle-btn panel-toggle-btn--floating" onClick={() => setSidebarOpen(true)}>
              ☰ Show panel
            </button>
          )}
          <TurbineScene
            title="Conventional Blade"
            badge="Baseline"
            isBiomimicked={false}
            features={ALL_OFF}
            windSpeed={windSpeed}
            windDirection={windDirection}
            turbulenceBoost={turbulenceBoost}
            stats={BASELINE}
          />
          <TurbineScene
            title="Biomimicked Blade"
            badge={`${activeCount}/${FEATURE_LIST.length} features active`}
            isBiomimicked={true}
            features={features}
            windSpeed={windSpeed}
            windDirection={windDirection}
            turbulenceBoost={turbulenceBoost}
            stats={stats}
          />
        </main>

        {sidebarOpen && (
          <aside className="sidebar">
            <ControlPanel
              windSpeed={windSpeed}
              onWindSpeed={setWindSpeed}
              windDirection={windDirection}
              onWindDirection={setWindDirection}
              turbulenceBoost={turbulenceBoost}
              onTurbulenceBoost={setTurbulenceBoost}
              features={features}
              onToggle={toggleFeature}
              onPreset={applyPreset}
            />
            <StatsPanel windSpeed={windSpeed} turbulenceBoost={turbulenceBoost} stats={stats} time={liveTime} />
            <LiveGraphs history={historyRef} time={liveTime} />
          </aside>
        )}
      </div>
    </div>
  );
}
