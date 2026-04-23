import gsap from 'gsap';

/** Fondo general del splash. */
const HOME_IMG = '/img/home.jpg';

/** Mototaxi destacado en el cuadro del CTA (`public/img/mototaxi1.jpg`). */
const MOTO_HOME_PRIMARY = '/img/mototaxi1.jpg';
const MOTO_HOME_FALLBACKS = [
  '/img/mototaxi2.jpg',
  '/img/motoHome.jpg',
  encodeURI('/img/moto home.jpg'),
  '/img/moto-home.jpg',
  '/img/motohome.png',
  HOME_IMG,
];

const icBolt = `<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/></svg>`;

const icWifi = `<svg class="h-4 w-4 text-yellow-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"/></svg>`;

const icWarn = `<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/></svg>`;

function drawSplashRadar(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = 140;
  const h = 140;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(6,8,12,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(250,204,21,0.15)';
  for (let g = 0; g < 6; g++) {
    ctx.strokeRect(10 + g * 6, 10 + g * 6, w - 20 - g * 12, h - 20 - g * 12);
  }
  ctx.strokeStyle = 'rgba(250,204,21,0.35)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(24, 108);
  ctx.lineTo(52, 72);
  ctx.lineTo(78, 88);
  ctx.lineTo(108, 38);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(250,204,21,0.85)';
  for (const [x, y] of [
    [24, 108],
    [52, 72],
    [78, 88],
    [108, 38],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(250,204,21,0.5)';
  ctx.font = '9px system-ui,sans-serif';
  ctx.fillText('CITY_GRID', 8, 12);
}

/**
 * Pantalla de inicio estilo mockup `public/img/home.jpg`: neón, vidrio, GSAP.
 * Al pulsar INICIAR se anima la salida y se llama `onComplete`.
 */
export function mountSplashScreen(host: HTMLElement, onComplete: () => void): void {
  host.textContent = '';
  host.classList.add('relative', 'h-full', 'min-h-dvh', 'w-full', 'overflow-hidden', 'bg-black');

  const root = document.createElement('div');
  root.className =
    'splash-root fixed inset-0 z-[200] flex flex-col text-zinc-100 overflow-x-hidden overflow-y-auto';

  root.innerHTML = `
    <div class="splash-bg absolute inset-0 -z-20 bg-cover bg-center will-change-transform" style="background-image:url('${HOME_IMG}')" aria-hidden="true"></div>
    <div class="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/55 to-black/90"></div>
    <div class="splash-vignette pointer-events-none absolute inset-0 -z-[5] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_100%)]"></div>
    <div class="splash-scanlines pointer-events-none absolute inset-0 -z-[4] opacity-[0.07] mix-blend-overlay" style="background:repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 4px)"></div>

    <header class="splash-panel flex shrink-0 items-center justify-between gap-4 border-b border-yellow-500/15 bg-black/35 px-4 py-3 backdrop-blur-xl md:px-8">
      <span class="text-xs font-bold italic tracking-[0.2em] text-yellow-400 md:text-sm">MOTOTAXI RUNNER</span>
      <nav class="hidden items-center gap-8 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 md:flex">
        <span class="cursor-default border-b border-yellow-400 pb-0.5 text-yellow-400">Opciones</span>
        <span class="cursor-default hover:text-zinc-300">Ayuda</span>
        <span class="cursor-default hover:text-zinc-300">Ranking</span>
      </nav>
      <div class="flex items-center gap-3 text-zinc-500">
        <span class="rounded border border-zinc-700/80 bg-zinc-900/60 p-1.5" title="Ajustes">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </span>
        <span class="rounded border border-zinc-700/80 bg-zinc-900/60 p-1.5" title="Perfil">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
        </span>
      </div>
    </header>

    <div class="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,220px)_1fr_minmax(0,240px)] md:gap-6 md:p-6 lg:px-10">
      <aside class="flex flex-col gap-3 md:pt-4">
        <div class="splash-panel rounded-xl border border-yellow-500/20 bg-black/50 p-4 backdrop-blur-xl">
          <h3 class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/90">System_controls</h3>
          <ul class="space-y-2 text-[11px] text-zinc-400">
            <li class="flex justify-between gap-2"><span class="text-zinc-500">Acelerar</span><kbd class="rounded border border-zinc-600 bg-zinc-900 px-1.5 font-mono text-yellow-200">W</kbd></li>
            <li class="flex justify-between gap-2"><span class="text-zinc-500">Freno</span><kbd class="rounded border border-zinc-600 bg-zinc-900 px-1.5 font-mono text-yellow-200">S</kbd></li>
            <li class="flex justify-between gap-2"><span class="text-zinc-500">Giro</span><kbd class="rounded border border-zinc-600 bg-zinc-900 px-1.5 font-mono text-yellow-200">A</kbd><kbd class="rounded border border-zinc-600 bg-zinc-900 px-1.5 font-mono text-yellow-200">D</kbd></li>
            <li class="flex justify-between gap-2"><span class="text-zinc-500">Reinicio</span><kbd class="rounded border border-zinc-600 bg-zinc-900 px-1.5 font-mono text-yellow-200">R</kbd></li>
          </ul>
        </div>
        <div class="splash-panel rounded-xl border border-yellow-500/20 bg-black/50 p-4 backdrop-blur-xl">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/90">Engine_status</h3>
          <div class="flex items-center gap-2">
            ${icWarn}
            <span class="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Nominal</span>
          </div>
        </div>
        <div class="splash-panel rounded-xl border border-yellow-500/20 bg-black/50 p-3 backdrop-blur-xl">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/90">City_grid_v2</h3>
          <canvas data-splash-radar class="mx-auto block rounded border border-yellow-500/20"></canvas>
        </div>
      </aside>

      <main class="flex flex-col items-center justify-center gap-6 py-6 md:py-10">
        <h1 class="splash-title text-center text-3xl font-black italic tracking-tighter text-yellow-400 drop-shadow-[0_0_24px_rgba(250,204,21,0.45)] sm:text-5xl md:text-6xl lg:text-7xl">
          MOTOTAXI<br class="sm:hidden" /><span class="hidden sm:inline"> </span>RUNNER
        </h1>
        <div class="splash-hero relative w-full max-w-lg overflow-hidden rounded-xl border border-yellow-500/30 shadow-[0_0_40px_rgba(250,204,21,0.12)]">
          <div class="relative aspect-[4/3] w-full bg-zinc-950">
            <img data-splash-moto-hero src="${MOTO_HOME_PRIMARY}" alt="Mototaxi" class="h-full w-full object-contain object-center" decoding="async" />
          </div>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/20"></div>
          <div class="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 p-5 pb-6">
            <p class="text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-200/80">Ruta: Pupy → Papá → Casa</p>
            <button type="button" data-splash-start class="splash-cta group flex items-center gap-2 rounded-lg border-2 border-yellow-400 bg-yellow-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_28px_rgba(250,204,21,0.45)] transition hover:scale-[1.02] hover:shadow-[0_0_36px_rgba(250,204,21,0.55)] active:scale-[0.98]">
              ${icBolt}
              Iniciar carrera
            </button>
          </div>
        </div>
      </main>

      <aside class="flex flex-col gap-3 md:pt-4">
        <div class="splash-panel rounded-xl border border-yellow-500/20 bg-black/50 p-4 backdrop-blur-xl">
          <h3 class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/90">Top_runners</h3>
          <ol class="space-y-2 text-[11px]">
            <li class="flex justify-between gap-2 border-b border-zinc-800/80 pb-2"><span class="font-mono text-yellow-500">01</span><span class="truncate text-zinc-200">NEON_DRIFTER</span><span class="shrink-0 font-mono text-zinc-500">1:42.08</span></li>
            <li class="flex justify-between gap-2 border-b border-zinc-800/80 pb-2"><span class="font-mono text-zinc-500">02</span><span class="truncate text-zinc-300">LIMA_NIGHT</span><span class="shrink-0 font-mono text-zinc-500">1:44.51</span></li>
            <li class="flex justify-between gap-2"><span class="font-mono text-zinc-500">03</span><span class="truncate text-zinc-300">TUK_MASTER</span><span class="shrink-0 font-mono text-zinc-500">1:47.22</span></li>
          </ol>
          <p class="mt-3 cursor-default text-[9px] font-semibold uppercase tracking-wider text-yellow-500/70">Ver ranking completo →</p>
        </div>
        <div class="splash-panel flex items-center justify-between gap-2 rounded-xl border border-yellow-500/20 bg-black/50 px-4 py-3 backdrop-blur-xl">
          <div class="flex items-center gap-2">
            ${icWifi}
            <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Latencia</span>
          </div>
          <span data-splash-ping class="font-mono text-sm font-bold text-yellow-400">12 ms</span>
        </div>
        <div class="splash-panel rounded-xl border border-yellow-500/20 bg-black/50 p-4 backdrop-blur-xl">
          <h3 class="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/90">Velocity</h3>
          <p class="font-mono text-3xl font-bold tabular-nums text-yellow-400">0 <span class="text-lg font-semibold text-zinc-500">km/h</span></p>
          <p class="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Standby</p>
        </div>
      </aside>
    </div>

    <footer class="splash-panel mt-auto shrink-0 border-t border-yellow-500/10 bg-black/40 px-4 py-3 text-center backdrop-blur-md md:px-8">
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
        <span class="cursor-default hover:text-zinc-500">Privacidad</span>
        <span class="cursor-default hover:text-zinc-500">Términos</span>
        <span class="cursor-default hover:text-zinc-500">Legal</span>
        <span class="cursor-default hover:text-zinc-500">Créditos</span>
      </div>
      <p class="mt-1 text-[9px] text-zinc-600">© 2026 Mototaxi Runner · Vibe Jam · sistemas operativos</p>
    </footer>
  `;

  host.appendChild(root);

  const radar = root.querySelector<HTMLCanvasElement>('[data-splash-radar]');
  if (radar) drawSplashRadar(radar);

  const motoHero = root.querySelector<HTMLImageElement>('[data-splash-moto-hero]');
  if (motoHero) {
    let fb = 0;
    motoHero.addEventListener('error', () => {
      if (fb >= MOTO_HOME_FALLBACKS.length) return;
      motoHero.src = MOTO_HOME_FALLBACKS[fb]!;
      fb++;
    });
  }

  const pingEl = root.querySelector<HTMLElement>('[data-splash-ping]');
  const btn = root.querySelector<HTMLButtonElement>('[data-splash-start]');

  gsap.context(() => {
    gsap.from('.splash-panel', {
      y: 28,
      opacity: 0,
      duration: 0.65,
      stagger: 0.06,
      ease: 'power3.out',
    });

    gsap.from('.splash-title', {
      y: -20,
      opacity: 0,
      duration: 0.85,
      ease: 'power4.out',
    });

    gsap.from('.splash-hero', {
      scale: 0.94,
      opacity: 0,
      duration: 0.9,
      delay: 0.15,
      ease: 'power3.out',
    });

    gsap.to('.splash-title', {
      textShadow: '0 0 32px rgba(250,204,21,0.55), 0 0 60px rgba(250,204,21,0.2)',
      duration: 1.8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    gsap.to('.splash-cta', {
      boxShadow: '0 0 40px rgba(250,204,21,0.55)',
      duration: 1.2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    gsap.to('.splash-bg', {
      scale: 1.06,
      duration: 18,
      ease: 'none',
      repeat: -1,
      yoyo: true,
    });

    let pingId = 0;
    if (pingEl) {
      let v = 12;
      pingId = window.setInterval(() => {
        v = Math.max(8, Math.min(22, v + (Math.random() - 0.5) * 4));
        pingEl.textContent = `${Math.round(v)} ms`;
      }, 420);
    }

    btn?.addEventListener('click', () => {
      btn.disabled = true;
      if (pingId) window.clearInterval(pingId);
      gsap.to(root, {
        opacity: 0,
        filter: 'blur(12px)',
        duration: 0.55,
        ease: 'power2.in',
        onComplete: () => {
          root.remove();
          onComplete();
        },
      });
    });
  }, root);
}
