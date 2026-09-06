export function computeRotationSpeed(windSpeed, stats) {
  if (windSpeed <= stats.cutIn) {
    return Math.max(0, windSpeed / stats.cutIn) * 0.12;
  }
  const span = 20 - stats.cutIn;
  const norm = Math.min(1, (windSpeed - stats.cutIn) / span);
  const maxRad = 5.2;
  return 0.25 + norm * maxRad * (stats.efficiency / 59.3);
}
