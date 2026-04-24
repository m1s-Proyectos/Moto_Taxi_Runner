/** Mismo formato que el cronómetro en carrera: `m:ss.cc`. */
export function formatRaceClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = Math.floor((ms % 1000) / 10)
    .toString()
    .padStart(2, '0');
  return `${m}:${s.toString().padStart(2, '0')}.${frac}`;
}
