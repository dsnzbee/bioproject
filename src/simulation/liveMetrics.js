import { computeRotationSpeed } from "./rotationDynamics";

// Illustrative turbine scale used only to turn the existing efficiency/noise
// stats into believable power/AEP numbers for the comparison table — not a
// measured machine.
const ROTOR_DIAMETER_M = 70;
const SWEPT_AREA_M2 = Math.PI * (ROTOR_DIAMETER_M / 2) ** 2;
const AIR_DENSITY = 1.225;
const CAPACITY_FACTOR = 0.35;
const NOISE_LIMIT_DBA = 90;
const STALL_ELEMENT_COUNT = 36;

// Reference wind speed at which the feature-driven `stats.noise` number
// applies (real turbines pitch-to-feather above rated speed specifically to
// cap noise and power, so growth flattens out past this point).
const RATED_WIND = 11;
const AMBIENT_NOISE_DBA = 32; // near-silent, blades essentially idle

// A blade with a lower turbulence stat (calmer, more attached flow) should
// visibly hold steadier power under the same gusty inlet than one that's
// shedding turbulence — so the live fluctuation amplitude is driven by each
// side's OWN turbulence number, not a shared random number. This is what
// makes "instantaneous" mean something: the two readouts are reacting to
// the same gust differently, live, not just evaluating a static formula at
// whatever the slider says.
function gustFactor(time, stats, turbulenceBoost) {
  const amp = (stats.turbulence / 100) * turbulenceBoost;
  return (
    1 +
    Math.sin(time * 1.3) * 0.09 * amp +
    Math.sin(time * 3.7 + 1.4) * 0.05 * amp +
    Math.sin(time * 7.1 + 2.8) * 0.03 * amp
  );
}

// Real turbine noise isn't a fixed number: it ramps up with wind/rotor speed
// from cut-in toward a rated value, then the controller pitches the blades
// to cap further growth. So `stats.noise` (driven by which biomimicry
// features are on) is really "the noise AT rated conditions" — the live
// value depends on where the CURRENT wind speed sits relative to each
// blade's own cut-in (also feature-driven, e.g. maple-seed twist lowers it)
// and gets its own small turbulence-driven jitter, same as power.
function liveNoiseDBA(effectiveWind, stats, time) {
  const cutIn = Math.max(0.5, stats.cutIn);
  const startNoise = AMBIENT_NOISE_DBA + 8; // noise right as the rotor starts turning

  let base;
  if (effectiveWind <= cutIn) {
    const t = Math.max(0, effectiveWind / cutIn);
    base = AMBIENT_NOISE_DBA + t * 8;
  } else if (effectiveWind <= RATED_WIND) {
    const frac = (effectiveWind - cutIn) / Math.max(1, RATED_WIND - cutIn);
    base = startNoise + frac * (stats.noise - startNoise);
  } else {
    const overRated = effectiveWind - RATED_WIND;
    base = stats.noise + Math.min(3, overRated * 0.15);
  }

  const jitter = Math.sin(time * 2.3 + 0.6) * 0.6 + Math.sin(time * 5.9 + 2.1) * 0.3;
  return Math.max(AMBIENT_NOISE_DBA, base + jitter);
}

export function computeLiveMetrics(windSpeed, stats, turbulenceBoost = 1, time = 0) {
  const effectiveWind = Math.max(0, windSpeed * gustFactor(time, stats, turbulenceBoost));

  const cp = stats.efficiency / 100;
  const powerKW = 0.5 * AIR_DENSITY * SWEPT_AREA_M2 * cp * Math.pow(effectiveWind, 3) / 1000;
  const rpm = (computeRotationSpeed(effectiveWind, stats) * 60) / (2 * Math.PI);
  const aepMWh = (powerKW * 8760 * CAPACITY_FACTOR) / 1000;

  const noiseDBA = liveNoiseDBA(effectiveWind, stats, time);
  const deRated = noiseDBA > NOISE_LIMIT_DBA;

  const effectiveTurbulence = Math.min(100, stats.turbulence * turbulenceBoost);
  const overspeed = Math.max(0, (effectiveWind - 14) / 10);
  const stalledElements = Math.round(
    STALL_ELEMENT_COUNT * Math.min(1, overspeed) * (effectiveTurbulence / 100)
  );
  const loadReduction = stats.loadReduction ?? 0;
  const peakRootMoment = Math.round(
    effectiveWind * effectiveWind * (effectiveTurbulence / 100) * 1.4 * (1 - loadReduction / 100)
  );
  const flowCoherence = Math.round(Math.max(45, 100 - (effectiveTurbulence - 12) * 0.55));

  return {
    powerKW: Math.round(powerKW),
    cp: Number(cp.toFixed(3)),
    rpm: Number(rpm.toFixed(1)),
    noiseDBA: Number(noiseDBA.toFixed(1)),
    deRated,
    aepMWh: Math.round(aepMWh),
    cutIn: Number(stats.cutIn.toFixed(1)),
    peakRootMoment,
    stalledElements,
    stallElementCount: STALL_ELEMENT_COUNT,
    flowCoherence,
  };
}
