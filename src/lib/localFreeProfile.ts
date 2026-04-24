import { formatRaceClock } from './formatRaceTime';

const KEY_ID = 'mtr_free_v1_anon_id';
const KEY_HANDLE = 'mtr_free_v1_handle';
const KEY_BEST_MS = 'mtr_free_v1_best_ms';

/** Tiempos de referencia (demo) en ms — misma ruta Pupy → Papá → Casa. */
export const REF_DEMO_LEADERBOARD: { handle: string; timeMs: number }[] = [
  { handle: 'NEON_DRIFTER', timeMs: 102_080 },
  { handle: 'LIMA_NIGHT', timeMs: 104_510 },
  { handle: 'TUK_MASTER', timeMs: 107_220 },
];

/**
 * Perfil local anónimo (sin cuenta, sin PII): id estable + apodo generado.
 * Solo `localStorage` en este dispositivo.
 */
export function ensureLocalFreeProfile(): { id: string; handle: string } {
  try {
    let id = localStorage.getItem(KEY_ID);
    let handle = localStorage.getItem(KEY_HANDLE);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `mtr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY_ID, id);
    }
    if (!handle) {
      handle = generateFunHandle();
      localStorage.setItem(KEY_HANDLE, handle);
    }
    return { id, handle };
  } catch {
    return { id: 'na', handle: 'TAXI_INVITADO' };
  }
}

function generateFunHandle(): string {
  const prefs = ['MOTO', 'TAXI', 'RUTA', 'GIRO', 'VIAJE', 'CALLE', 'REMIS', 'BULEVAR'];
  const p = prefs[Math.floor(Math.random() * prefs.length)]!;
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suf = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 4; i++) suf += chars[arr[i]! % chars.length]!;
  } else {
    for (let i = 0; i < 4; i++) suf += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return `${p}_${suf}`;
}

export function getBestFreeRaceMs(): number | null {
  try {
    const v = localStorage.getItem(KEY_BEST_MS);
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch {
    return null;
  }
}

/** Mejor tiempo en modo libre; solo actualiza si mejora. */
export function recordFreeModePersonalBestIfBetter(timeMs: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0) return;
  const rounded = Math.round(timeMs);
  try {
    const prev = getBestFreeRaceMs();
    if (prev !== null && rounded >= prev) return;
    localStorage.setItem(KEY_BEST_MS, String(rounded));
  } catch {
    /* ignore */
  }
}

const rowBase =
  'grid grid-cols-[2rem_1fr_auto] items-center gap-x-2 px-3 py-2.5 text-zinc-200 transition hover:bg-amber-500/[0.04]';
const rowBorder = `${rowBase} border-b border-zinc-800/40`;

export function renderSplashFreeLeaderboard(ol: HTMLOListElement): void {
  const { handle } = ensureLocalFreeProfile();
  const best = getBestFreeRaceMs();
  const timeYou = best === null ? '—' : formatRaceClock(best);

  const liYou = document.createElement('li');
  liYou.className = `${rowBorder} border-amber-500/20 bg-amber-500/[0.06]`;
  liYou.innerHTML = `<span class="font-mono text-amber-300">Tú</span><span class="min-w-0 truncate font-medium text-amber-100" title="Perfil anónimo en este dispositivo"><span class="text-[9px] font-bold text-amber-500/80">LOCAL</span> ${escapeHtml(
    handle,
  )}</span><span class="shrink-0 text-right font-mono text-amber-200/90 tabular-nums">${timeYou === '—' ? '—' : escapeHtml(timeYou)}</span>`;

  const frag = document.createDocumentFragment();
  frag.appendChild(liYou);

  REF_DEMO_LEADERBOARD.forEach((d, i) => {
    const isLast = i === REF_DEMO_LEADERBOARD.length - 1;
    const li = document.createElement('li');
    li.className = isLast ? rowBase : rowBorder;
    const rank = String(i + 2).padStart(2, '0');
    const dim = 'text-zinc-500';
    li.innerHTML = `<span class="font-mono ${dim}">${rank}</span><span class="min-w-0 truncate ${i === 0 ? 'font-medium text-zinc-200' : 'text-zinc-200'}"><span class="text-[8px] ${dim}">ref · </span>${escapeHtml(
      d.handle,
    )}</span><span class="shrink-0 text-right font-mono ${dim} tabular-nums">${formatRaceClock(d.timeMs)}</span>`;
    frag.appendChild(li);
  });

  ol.textContent = '';
  ol.appendChild(frag);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
