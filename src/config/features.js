export const BASELINE = { efficiency: 35, noise: 95, turbulence: 100, cutIn: 3.5, loadReduction: 0 };

export const FEATURE_LIST = [
  {
    key: "owl",
    label: "Owl Wing Serrations",
    animal: "Barn Owl",
    icon: "\u{1F989}",
    description:
      "A comb-like fringe slices one big turbulent trailing-edge structure into many small, out-of-phase ones that partly cancel instead of adding up. This is acoustic, not aerodynamic — it costs a touch of drag and makes no extra power. The payoff is indirect: a quiet blade doesn't have to de-rate at night to meet noise limits, so it keeps running at full output when a loud one can't.",
    // no efficiency gain by design — see description. Small drag penalty.
    deltas: { efficiency: -1, noise: -6, turbulence: -10, cutIn: 0, loadReduction: 0 },
  },
  {
    key: "mapleSeed",
    label: "Maple Seed Autorotation",
    animal: "Maple Seed",
    icon: "\u{1F341}",
    description:
      "Twist along the span lets every station — root to fast-moving tip — sit near its own best angle at once, instead of the root stalling while the tip underperforms. The same offset-mass torque that spins a falling samara gives real starting torque, lowering cut-in.",
    deltas: { efficiency: 5, noise: -1, turbulence: -12, cutIn: -1.6, loadReduction: 0 },
  },
  {
    key: "whale",
    label: "Whale Tubercle Bumps",
    animal: "Humpback Whale",
    icon: "\u{1F40B}",
    description:
      "Bumps along the leading edge roll the flow into paired vortices that keep re-energising the boundary layer, so the blade keeps working at angles where a smooth edge would stall (~40% higher stall angle in flipper tests). Real wind gusts and shifts direction constantly, so staying attached longer means more time spent in the efficient range.",
    deltas: { efficiency: 12, noise: -2, turbulence: -16, cutIn: -0.3, loadReduction: 0 },
  },
  {
    key: "bat",
    label: "Bat Wing Flexibility",
    animal: "Bat",
    icon: "\u{1F987}",
    description:
      "Composite fibres laid at an angle in the spar couple bending to twist: a gust bends the blade back, which automatically twists it nose-down and sheds the angle of attack that caused the load spike — no sensors, no delay. The payoff is lower fatigue and a lighter structure, not more raw power, so it trades a little efficiency for a real drop in peak root bending moment.",
    deltas: { efficiency: 1, noise: -3, turbulence: -20, cutIn: -0.2, loadReduction: 35 },
  },
  {
    key: "dragonfly",
    label: "Dragonfly Wing Corrugation",
    animal: "Dragonfly",
    icon: "\u{1F98B}",
    description:
      "A pleated, corrugated cross-section adds stiffness for very little extra mass and traps tiny stabilising vortices that keep flow attached longer.",
    deltas: { efficiency: 6, noise: -1, turbulence: -10, cutIn: 0, loadReduction: 10 },
  },
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function computeStats(activeKeys) {
  let efficiency = BASELINE.efficiency;
  let noise = BASELINE.noise;
  let turbulence = BASELINE.turbulence;
  let cutIn = BASELINE.cutIn;
  let loadReduction = BASELINE.loadReduction;

  FEATURE_LIST.forEach((f) => {
    if (activeKeys[f.key]) {
      efficiency += f.deltas.efficiency;
      noise += f.deltas.noise;
      turbulence += f.deltas.turbulence;
      cutIn += f.deltas.cutIn;
      loadReduction += f.deltas.loadReduction;
    }
  });

  return {
    efficiency: clamp(efficiency, 10, 59.3),
    noise: clamp(noise, 38, 100),
    turbulence: clamp(turbulence, 12, 100),
    cutIn: clamp(cutIn, 1, 6),
    loadReduction: clamp(loadReduction, 0, 65),
  };
}
