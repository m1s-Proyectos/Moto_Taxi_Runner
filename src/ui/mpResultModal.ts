import type { RaceResultPayload } from '../lib/roomMembers';

/** Rival no envió resultado a tiempo (desempate a favor local). */
export const MP_RACE_FORFEIT_PID = '__mtr_forfeit__';

/**
 * Estrellas por tiempo de carrera (rangos contiguos):
 * &lt; 1 min → 5, &lt; 2 min → 4, &lt; 3 min → 3, &lt; 4 min → 2, ≥ 4 min → 1.
 */
export function starsForRaceTimeMs(timeMs: number): 1 | 2 | 3 | 4 | 5 {
  const s = Math.max(0, timeMs) / 1000;
  if (s < 60) return 5;
  if (s < 120) return 4;
  if (s < 180) return 3;
  if (s < 240) return 2;
  return 1;
}

/** Gana quien tiene más monedas; empate → menor tiempo; empate → quien cerró antes en reloj mural. */
export function localWinsMpCompare(local: RaceResultPayload, remote: RaceResultPayload): boolean {
  if (remote.pid === MP_RACE_FORFEIT_PID) return true;
  if (local.coins !== remote.coins) return local.coins > remote.coins;
  if (local.timeMs !== remote.timeMs) return local.timeMs < remote.timeMs;
  return local.wallFinishedAt <= remote.wallFinishedAt;
}

export type MpResultModalApi = {
  showWaiting: () => void;
  showWin: (opts: { stars: 1 | 2 | 3 | 4 | 5; coins: number; timeLabel: string }) => void;
  showLose: (opts: {
    coinDiff: number;
    opponentTimeLabel: string;
    yourCoins: number;
    opponentCoins: number;
  }) => void;
  hide: () => void;
  destroy: () => void;
};

const LOSE_TIPS = [
  'Grab every coin cluster before the next stop — they add up fast.',
  'Smooth throttle through corners keeps your average speed higher.',
  'Use turbo pickups right after a straight for maximum carry.',
];

function starRow(stars: number): string {
  const max = 5;
  let html = '<div class="mtr-mp-stars flex justify-center gap-1.5" aria-label="Star rating">';
  for (let i = 0; i < max; i++) {
    const on = i < stars;
    html += `<span class="mtr-mp-star text-2xl leading-none ${on ? 'mtr-mp-star--on' : 'mtr-mp-star--off'}" aria-hidden="true">${on ? '★' : '☆'}</span>`;
  }
  html += '</div>';
  return html;
}

export function createMpResultModal(
  parent: HTMLElement,
  handlers: { onAgain: () => void; onClose: () => void },
): MpResultModalApi {
  const root = document.createElement('div');
  root.className =
    'mtr-mp-result-overlay pointer-events-auto fixed inset-0 z-[70] hidden flex items-center justify-center bg-zinc-950/70 p-3 backdrop-blur-md sm:p-6';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="mtr-mp-result-card relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-6 shadow-[0_0_60px_-12px_rgba(245,158,11,0.35)] sm:p-8">
      <div data-role="mp-ribbon" class="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl"></div>
      <div data-role="mp-content"></div>
      <div class="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" data-role="mp-again" class="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25">Race again</button>
        <button type="button" data-role="mp-close" class="rounded-xl border border-zinc-600/60 bg-zinc-800/40 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700/50">Close</button>
      </div>
    </div>`;

  const content = root.querySelector('[data-role="mp-content"]') as HTMLElement;
  const btnAgain = root.querySelector('[data-role="mp-again"]') as HTMLButtonElement;
  const btnClose = root.querySelector('[data-role="mp-close"]') as HTMLButtonElement;
  const card = root.querySelector('.mtr-mp-result-card') as HTMLElement;

  btnAgain.addEventListener('click', () => handlers.onAgain());
  btnClose.addEventListener('click', () => handlers.onClose());

  parent.appendChild(root);

  const setVisible = (on: boolean) => {
    root.classList.toggle('hidden', !on);
    if (on) {
      card.classList.remove('mtr-mp-pop-in');
      void card.offsetWidth;
      card.classList.add('mtr-mp-pop-in');
    }
  };

  const api: MpResultModalApi = {
    showWaiting: () => {
      content.innerHTML = `
        <div class="text-center">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400/90">Multiplayer</p>
          <h2 class="mt-3 font-black uppercase tracking-tight text-zinc-100" style="font-size: clamp(1.25rem, 4vw, 1.75rem)">Waiting for rival</h2>
          <p class="mt-3 text-sm leading-relaxed text-zinc-400">You crossed the finish. Results lock in when your opponent finishes or after the wait timer.</p>
          <div class="mt-6 flex justify-center">
            <div class="mtr-mp-wait-pulse h-2 w-32 rounded-full bg-amber-500/30"></div>
          </div>
        </div>`;
      setVisible(true);
    },
    showWin: (opts) => {
      content.innerHTML = `
        <div class="relative text-center" data-mp-outcome="win">
          <div class="mtr-mp-win-burst pointer-events-none absolute left-1/2 top-0 h-32 w-32 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl"></div>
          <p class="relative text-xs font-semibold uppercase tracking-[0.35em] text-emerald-400/95">Victory</p>
          <h2 class="relative mt-2 bg-gradient-to-b from-amber-100 to-amber-500 bg-clip-text font-black uppercase tracking-tight text-transparent" style="font-size: clamp(1.75rem, 6vw, 2.5rem)">YOU WIN</h2>
          <p class="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-300">Congratulations, you are a true speedster. Your passengers are satisfied.</p>
          <div class="relative mt-6 grid gap-3 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-4 py-4 text-left text-sm">
            <div class="flex justify-between gap-3"><span class="text-zinc-500">Coins earned</span><span class="font-semibold text-amber-200">${opts.coins}</span></div>
            <div class="flex justify-between gap-3"><span class="text-zinc-500">Finish time</span><span class="font-mono font-semibold text-zinc-100">${escapeHtml(opts.timeLabel)}</span></div>
          </div>
          <div class="relative mt-5">${starRow(opts.stars)}</div>
        </div>`;
      setVisible(true);
    },
    showLose: (opts) => {
      const tips = LOSE_TIPS.map((t) => `<li class="text-zinc-400">${escapeHtml(t)}</li>`).join('');
      const diffLabel =
        opts.coinDiff > 0
          ? `You trailed by <span class="font-semibold text-rose-300">${opts.coinDiff}</span> coins`
          : opts.coinDiff < 0
            ? `You led by <span class="font-semibold text-emerald-300">${-opts.coinDiff}</span> coins on pickups — tighten your pace next run.`
            : 'Same coin pickups — your rival was faster to the line.';
      content.innerHTML = `
        <div class="text-center" data-mp-outcome="lose">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-rose-400/90">Defeat</p>
          <h2 class="mt-2 font-black uppercase tracking-tight text-zinc-200" style="font-size: clamp(1.75rem, 6vw, 2.25rem)">YOU LOST</h2>
          <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">You must improve. Your passengers are sad and will arrive late.</p>
          <div class="mt-6 grid gap-3 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-4 py-4 text-left text-sm">
            <div class="flex justify-between gap-3"><span class="text-zinc-500">Your coins</span><span class="font-semibold text-zinc-200">${opts.yourCoins}</span></div>
            <div class="flex justify-between gap-3"><span class="text-zinc-500">Opponent coins</span><span class="font-semibold text-zinc-200">${opts.opponentCoins}</span></div>
            <div class="border-t border-zinc-800 pt-2 text-zinc-300">${diffLabel}</div>
            <div class="flex justify-between gap-3"><span class="text-zinc-500">Opponent time</span><span class="font-mono font-semibold text-zinc-100">${escapeHtml(opts.opponentTimeLabel)}</span></div>
          </div>
          <p class="mt-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Tips</p>
          <ul class="mt-2 list-disc space-y-1 pl-4 text-left text-xs leading-relaxed">${tips}</ul>
        </div>`;
      setVisible(true);
    },
    hide: () => {
      root.classList.add('hidden');
    },
    destroy: () => {
      root.remove();
    },
  };

  return api;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
