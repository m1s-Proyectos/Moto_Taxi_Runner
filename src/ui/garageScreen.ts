import gsap from 'gsap';
import type { BikeStyle } from '../game/bikeModels';
import { getCoinWallet } from '../lib/coinWallet';
import {
  buildStatRowsForLevels,
  getNextUpgradeCost,
  loadGarageProgress,
  purchaseUpgradeLevel,
  setGarageBikeStyle,
  UPGRADE_IDS,
  UPGRADE_LABELS,
  UPGRADE_MAX_LEVEL,
  type GarageProgressV1,
  type UpgradeId,
} from '../lib/motoUpgrades';

export type GarageHandlers = {
  onBack: () => void;
  onPlay: () => void;
};

/**
 * Taller / tienda: mejora la moto con monedas, persiste en localStorage.
 */
export function mountGarage(host: HTMLElement, handlers: GarageHandlers): void {
  host.textContent = '';
  host.classList.add('relative', 'min-h-dvh', 'w-full', 'max-w-full', 'bg-black');

  const root = document.createElement('div');
  root.className =
    'mtr-garage-root splash-root relative z-[200] flex min-h-dvh w-full max-w-full flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-black text-zinc-100';

  const header = document.createElement('header');
  header.className =
    'flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/20 bg-slate-950/80 px-3 py-3 backdrop-blur-xl sm:px-5';
  header.innerHTML = `
    <button type="button" data-garage-back class="rounded-xl border border-zinc-600/80 bg-zinc-900/80 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition active:scale-[0.97] sm:px-4">← Volver</button>
    <div class="flex flex-col items-center gap-0.5">
      <span class="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300/90">Taller</span>
      <span class="text-xs font-bold text-zinc-400">Mototaxi Runner</span>
    </div>
    <div class="flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1.5 shadow-[0_0_16px_rgba(251,191,36,0.2)]">
      <span class="text-base" aria-hidden="true">🪙</span>
      <span data-garage-coins class="min-w-[2ch] text-sm font-black tabular-nums text-amber-100"></span>
    </div>
  `;

  const main = document.createElement('div');
  main.className =
    'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 pb-[max(5rem,env(safe-area-inset-bottom))] sm:px-5 md:flex-row md:gap-4 md:px-6 md:py-4';

  const catCol = document.createElement('div');
  catCol.className = 'flex min-h-0 w-full shrink-0 flex-col gap-2 md:w-[min(100%,280px)]';
  const catTitle = document.createElement('p');
  catTitle.className = 'text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80';
  catTitle.textContent = 'Mejoras';
  const catScroll = document.createElement('div');
  catScroll.className = 'flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1 md:max-h-none';
  catCol.append(catTitle, catScroll);

  const detail = document.createElement('div');
  detail.className =
    'mtr-garage-detail flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-700/60 bg-slate-950/55 p-3 shadow-inner shadow-black/40 backdrop-blur-md sm:p-4';

  main.append(catCol, detail);
  root.append(header, main);

  const footer = document.createElement('div');
  footer.className =
    'pointer-events-auto fixed bottom-0 left-0 right-0 z-[210] border-t border-amber-500/25 bg-slate-950/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg';
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.dataset.garagePlay = '';
  playBtn.className =
    'mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl border-2 border-emerald-400/60 bg-gradient-to-b from-emerald-500 to-teal-600 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.35)] transition active:scale-[0.98]';
  playBtn.textContent = '¡A correr!';
  footer.append(playBtn);
  root.append(footer);

  host.appendChild(root);

  let selected: UpgradeId = 'engine';
  let progress: GarageProgressV1 = loadGarageProgress();

  const coinsEl = header.querySelector('[data-garage-coins]')!;
  const backBtn = header.querySelector('[data-garage-back]')!;

  function paintCoins(): void {
    coinsEl.textContent = String(getCoinWallet());
  }

  function renderCategories(): void {
    catScroll.textContent = '';
    for (const id of UPGRADE_IDS) {
      const meta = UPGRADE_LABELS[id];
      const lv = progress.levels[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.upgradeId = id;
      btn.className =
        'flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition sm:py-3' +
        (selected === id
          ? ' border-amber-400/70 bg-amber-500/15 ring-2 ring-amber-400/30'
          : ' border-zinc-700/80 bg-zinc-900/40 hover:border-zinc-500');
      const top = document.createElement('div');
      top.className = 'flex w-full items-center justify-between gap-2';
      top.innerHTML = `<span class="text-sm font-extrabold text-zinc-50">${meta.title}</span><span class="rounded-full border border-zinc-600 bg-zinc-950 px-2 py-0.5 text-[10px] font-bold text-amber-200">Nv.${lv}/${UPGRADE_MAX_LEVEL}</span>`;
      const sub = document.createElement('p');
      sub.className = 'text-[11px] leading-snug text-zinc-400';
      sub.textContent = meta.short;
      btn.append(top, sub);
      btn.addEventListener('click', () => {
        selected = id;
        renderCategories();
        renderDetail();
      });
      catScroll.append(btn);
    }
  }

  function renderDetail(): void {
    const meta = UPGRADE_LABELS[selected];
    const lv = progress.levels[selected];
    const nextCost = getNextUpgradeCost(selected, lv);
    const rows = buildStatRowsForLevels(progress.levels, nextCost !== null ? selected : null);

    detail.textContent = '';
    const h2 = document.createElement('h2');
    h2.className = 'text-lg font-black uppercase tracking-wide text-white';
    h2.textContent = meta.title;

    const ul = document.createElement('ul');
    ul.className = 'mt-2 list-inside list-disc space-y-1 text-[12px] text-zinc-300';
    for (const line of meta.perks) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.append(li);
    }

    const styleWrap = document.createElement('div');
    styleWrap.className = 'mt-4 rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-3';
    const stLabel = document.createElement('p');
    stLabel.className = 'mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300/85';
    stLabel.textContent = 'Estilo equipado';
    const row = document.createElement('div');
    row.className = 'flex flex-wrap gap-2';
    const mkStyle = (label: string, style: BikeStyle) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'flex-1 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition sm:min-w-[120px]' +
        (progress.bikeStyle === style
          ? ' border-cyan-400/70 bg-cyan-500/20 text-cyan-50'
          : ' border-zinc-600 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500');
      b.textContent = label;
      b.addEventListener('click', () => {
        setGarageBikeStyle(style);
        progress = loadGarageProgress();
        renderDetail();
      });
      return b;
    };
    row.append(mkStyle('Urban', 'urban'), mkStyle('Clásica', 'classic'));
    styleWrap.append(stLabel, row);

    const statCard = document.createElement('div');
    statCard.className = 'mt-4 overflow-hidden rounded-xl border border-zinc-700/50';
    const head = document.createElement('div');
    head.className =
      'grid grid-cols-[1.2fr_0.7fr_0.7fr_auto] gap-1 border-b border-zinc-700/50 bg-zinc-900/80 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500';
    head.innerHTML = '<span>Stat</span><span>Antes</span><span>Después</span><span></span>';
    statCard.append(head);
    for (const r of rows) {
      const line = document.createElement('div');
      line.className =
        'grid grid-cols-[1.2fr_0.7fr_0.7fr_auto] gap-1 border-b border-zinc-800/40 px-2 py-1.5 text-[11px] last:border-b-0';
      const changed = Math.abs(r.after - r.before) > 0.04;
      line.innerHTML = `<span class="text-zinc-200">${r.label}</span><span class="font-mono text-zinc-500">${r.before}</span><span class="font-mono ${changed ? 'font-bold text-emerald-300' : 'text-zinc-400'}">${r.after}</span><span class="text-[10px] text-zinc-500">${r.unit}</span>`;
      statCard.append(line);
    }

    const buyRow = document.createElement('div');
    buyRow.className = 'mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between';
    const costP = document.createElement('p');
    costP.className = 'text-sm text-zinc-300';
    if (nextCost === null) {
      costP.innerHTML = '<span class="font-bold text-emerald-300">Nivel máximo</span> · no hay más mejoras';
    } else {
      costP.innerHTML = `Siguiente nivel: <span class="font-mono font-bold text-amber-200">${nextCost}</span> 🪙`;
    }
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className =
      'rounded-xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-400 to-orange-500 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-950 shadow-lg transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45';
    buyBtn.textContent = nextCost === null ? 'Completo' : 'Comprar mejora';
    buyBtn.disabled = nextCost === null;
    buyBtn.addEventListener('click', () => {
      const r = purchaseUpgradeLevel(selected, getCoinWallet);
      if (!r.ok) {
        buyBtn.textContent = r.reason === 'max_level' ? 'Completo' : 'Sin monedas';
        window.setTimeout(() => {
          buyBtn.textContent = 'Comprar mejora';
        }, 900);
        return;
      }
      progress = loadGarageProgress();
      paintCoins();
      renderCategories();
      renderDetail();
    });
    buyRow.append(costP, buyBtn);

    const dots = document.createElement('div');
    dots.className = 'mt-3 flex gap-1.5';
    for (let i = 1; i <= UPGRADE_MAX_LEVEL; i++) {
      const d = document.createElement('span');
      d.className =
        'h-2.5 w-6 rounded-full ' + (i <= lv ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'bg-zinc-800');
      dots.append(d);
    }

    detail.append(h2, ul, styleWrap, statCard, buyRow, dots);
  }

  paintCoins();
  renderCategories();
  renderDetail();

  gsap.from('.mtr-garage-detail', { y: 16, opacity: 0, duration: 0.45, ease: 'power3.out' });
  gsap.from('.mtr-garage-root header > *', { y: -10, opacity: 0, stagger: 0.05, duration: 0.4, ease: 'power2.out' });

  function exitTo(fn: () => void): void {
    gsap.to(root, {
      opacity: 0,
      y: 12,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => {
        root.remove();
        host.classList.remove('relative', 'min-h-dvh', 'w-full', 'max-w-full', 'bg-black');
        fn();
      },
    });
  }

  backBtn.addEventListener('click', () => exitTo(handlers.onBack));
  playBtn.addEventListener('click', () => exitTo(handlers.onPlay));
}
