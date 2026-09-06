// What this is, honestly: NOT per-element BEM with airfoil polar tables.
// This project does not have a per-blade-element aerodynamic model — the
// rotor is coupled to the fluid as a single azimuthally-averaged actuator
// disk (see cfd/gpu/shaders/passes.js rotorForceFrag). There is nowhere
// for "modify the tubercled airfoil's post-stall polar" to actually live.
//
// What this DOES do, honestly: takes the same efficiency/turbulence
// numbers already shown in the stats panel (config/features.js,
// computeStats — five feature deltas an earlier stage of this project
// tuned to reflect published biomimicry trends) and converts them into a
// real thrust coefficient via momentum theory. That Ct is what the GPU
// solver actually uses to push on the fluid. So toggling a feature changes
// a real number that really drives the actuator force and really changes
// the solved flow field — it is a coarse, disk-averaged proxy for what a
// full BEM+polar model would compute, not a decoration layered on top of
// one, and not the full model itself.
import { computeStats, BASELINE } from "../../config/features";
import { inductionFactorFromCp, ctFromInductionFactor } from "./momentumTheory";
import { TURBULENT_VISCOSITY_2D_BOOST, AIR, INFLOW } from "../config";

export function physicsParamsForFeatures(features) {
  const stats = computeStats(features);
  const cpTarget = stats.efficiency / 100;
  const a = inductionFactorFromCp(cpTarget);
  const thrustCoefficient = ctFromInductionFactor(a);

  // turbulence stat is inverted (lower = calmer wake, per the existing
  // model's "quieter/smoother" framing) — map it onto the eddy-viscosity
  // multiplier so a calmer-wake feature set genuinely diffuses/recovers
  // differently in the solved field, not just in a number on a card
  const turbulenceFrac = stats.turbulence / BASELINE.turbulence;
  const turbulentViscosity = AIR.turbulentViscosity * TURBULENT_VISCOSITY_2D_BOOST * (0.75 + 0.5 * turbulenceFrac);

  const turbulenceIntensity = INFLOW.turbulenceIntensity * (0.7 + 0.6 * turbulenceFrac);

  return {
    stats,
    thrustCoefficient,
    turbulentViscosity,
    turbulenceIntensity,
    cutInSpeed: stats.cutIn,
    noiseDBA: stats.noise,
  };
}
