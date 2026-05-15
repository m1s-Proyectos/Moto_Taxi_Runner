/**
 * Animación corta del contador de monedas (HUD arcade).
 */
export function animateWalletNumber(el: HTMLElement, from: number, to: number, durationMs = 380): void {
  const a = Math.max(0, Math.floor(from));
  const b = Math.max(0, Math.floor(to));
  if (a === b) {
    el.textContent = String(b);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / durationMs);
    const eased = 1 - (1 - u) * (1 - u);
    const v = Math.round(a + (b - a) * eased);
    el.textContent = String(v);
    if (u < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = String(b);
    }
  };
  requestAnimationFrame(step);
}
