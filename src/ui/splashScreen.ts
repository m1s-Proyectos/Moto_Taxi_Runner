import gsap from 'gsap';
import { renderSplashFreeLeaderboard } from '../lib/localFreeProfile';

/** Fondo general del splash. */
const HOME_IMG = '/img/home.jpg';

/** Mototaxi destacado en el cuadro del CTA (`public/img/iconoHome.png`). */
const MOTO_HOME_PRIMARY = '/img/iconoHome.png';
const MOTO_HOME_FALLBACKS = [
  '/img/iconoHome.png',
  '/img/mototaxi2.jpg',
  '/img/mototaxi1.jpg',
  '/img/motoHome.jpg',
  encodeURI('/img/moto home.jpg'),
  '/img/moto-home.jpg',
  '/img/motohome.png',
  HOME_IMG,
];

const icBolt = `<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/></svg>`;

const icWifi = `<svg class="h-4 w-4 text-yellow-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"/></svg>`;

const icKeyboard = `<svg class="h-4 w-4 text-amber-400/90" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 003 9.75v4.5A2.25 2.25 0 005.25 16.5h13.5A2.25 2.25 0 0021 14.25v-4.5a2.25 2.25 0 00-2.25-2.25H5.25z"/></svg>`;

const icDevice = `<svg class="h-4 w-4 text-cyan-400/80" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>`;

/**
 * Pantalla de inicio estilo mockup `public/img/home.jpg`: neón, vidrio, GSAP.
 * Al pulsar INICIAR se anima la salida y se llama `onComplete`.
 */
export function mountSplashScreen(host: HTMLElement, onComplete: () => void): void {
  host.textContent = '';
  // ROOT CAUSE FIX #2 (scroll): el <body> es el ÚNICO scroll container.
  // Antes añadíamos `overflow-y-auto` aquí -> creaba container anidado y en
  // iOS/Android el touch se atascaba (URL bar nunca se ocultaba => "freeze").
  // Tampoco usar overflow-x: clip aquí porque por spec CSS fuerza overflow-y: clip
  // automáticamente, lo que recorta el contenido y bloquea el scroll del body.
  // Solución: ningún overflow en host/root. El body (index.html) ya tiene
  // `overflow-x-hidden overflow-y-auto`, suficiente y funciona en iOS/Android.
  host.classList.add('relative', 'min-h-dvh', 'w-full', 'max-w-full', 'bg-black');

  const root = document.createElement('div');
  root.className =
    'splash-root relative z-[200] flex min-h-dvh w-full max-w-full flex-col text-zinc-100 scroll-smooth';

  root.innerHTML = `
    <!--
      Capa de decoración: usa overflow-hidden LOCAL para contener streaks
      con offsets negativos (-left-20, right-[-8vw]) sin afectar el scroll
      vertical global. Es absolute pointer-events-none, no captura input.
    -->
    <div class="splash-deco-layer pointer-events-none absolute inset-0 -z-[5] overflow-hidden" aria-hidden="true">
      <div class="splash-bg absolute inset-0 -z-30 bg-cover bg-center will-change-transform" style="background-image:url('${HOME_IMG}')"></div>
      <div class="absolute inset-0 -z-20 bg-[radial-gradient(120%_100%_at_12%_8%,rgba(251,146,60,0.42)_0%,rgba(236,72,153,0.2)_26%,rgba(2,6,23,0.94)_64%)]"></div>
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(130deg,rgba(59,130,246,0.24)_0%,rgba(2,6,23,0.08)_30%,rgba(34,211,238,0.22)_62%,rgba(251,113,133,0.16)_100%)]"></div>
      <div class="absolute inset-0 -z-[9] opacity-45 [background:radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.35)_0,rgba(56,189,248,0)_34%),radial-gradient(circle_at_80%_30%,rgba(251,113,133,0.28)_0,rgba(251,113,133,0)_36%),radial-gradient(circle_at_50%_90%,rgba(251,191,36,0.22)_0,rgba(251,191,36,0)_42%)]"></div>
      <div class="splash-vignette absolute inset-0 -z-[8] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.65)_100%)]"></div>
      <div class="splash-scanlines absolute inset-0 -z-[7] opacity-[0.055] mix-blend-screen" style="background:repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.25) 2px, rgba(255,255,255,0.25) 4px)"></div>
      <div class="absolute inset-x-0 bottom-0 -z-[6] h-[42vh] bg-[linear-gradient(to_top,rgba(2,6,23,0.95),rgba(2,6,23,0.18),transparent)]"></div>
      <div class="absolute inset-x-0 bottom-0 -z-[5] h-[34vh] opacity-90 [background:repeating-linear-gradient(90deg,rgba(15,23,42,0.52)_0,rgba(15,23,42,0.52)_18px,rgba(30,41,59,0.42)_18px,rgba(30,41,59,0.42)_44px,rgba(51,65,85,0.3)_44px,rgba(51,65,85,0.3)_72px)]"></div>
      <div class="absolute inset-x-0 bottom-[14vh] -z-[4] h-[22vh] opacity-85 [background:linear-gradient(to_top,rgba(251,191,36,0.23),rgba(251,191,36,0.03))]"></div>
      <div class="splash-streak absolute -left-20 top-[30%] z-[3] h-[2px] w-[36vw] rotate-[-11deg] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent"></div>
      <div class="splash-streak absolute right-[-8vw] top-[52%] z-[3] h-[3px] w-[30vw] rotate-[-16deg] bg-gradient-to-r from-transparent via-amber-300/80 to-transparent"></div>
    </div>

    <!--
      ROOT CAUSE FIX #1 (shift right): en pantallas <380px el header desbordaba
      (~407px logicos) por 3 nav links + 2 badges con tracking ancho. Con
      overflow-x-hidden no se veia scrollbar, pero el ancho computado seguia
      siendo > viewport y arrastraba el centrado.
      Solucion: tracking mas corto en movil, min-w-0 para permitir compresion,
      y ocultar el badge "vibe jam" debajo de sm.
    -->
    <header class="splash-panel sticky top-0 z-50 flex w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b border-cyan-300/20 bg-slate-950/75 px-3 py-3 backdrop-blur-xl sm:gap-4 sm:px-4 md:px-8">
      <div class="inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1 sm:px-3">
        <span class="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.95)]"></span>
        <span class="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cyan-100 sm:text-[10px] sm:tracking-[0.23em]">Arcade</span>
      </div>
      <nav class="flex min-w-0 items-center gap-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300/70 sm:gap-5 sm:text-[10px] sm:tracking-[0.24em] md:gap-8">
        <a href="#splash-hero" class="cursor-pointer whitespace-nowrap border-b border-amber-300 pb-0.5 text-amber-200 transition-colors hover:text-amber-100">City</a>
        <a href="#splash-ranking" class="cursor-pointer whitespace-nowrap transition-colors hover:text-white">Ranking</a>
        <a href="#splash-controles" class="cursor-pointer whitespace-nowrap transition-colors hover:text-white">Controles</a>
      </nav>
      <div class="hidden shrink-0 rounded-full border border-amber-300/45 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100 sm:inline-block">vibe jam</div>
    </header>

    <div id="splash-hero" class="grid grid-cols-1 gap-4 px-3 py-4 sm:px-4 sm:py-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-6 md:px-8 lg:px-12">
      <main class="relative order-2 flex flex-col justify-between gap-4 md:order-1 md:min-h-[520px]">
        <div class="splash-panel max-w-[36rem] rounded-3xl border border-cyan-300/30 bg-slate-900/35 p-5 shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_24px_45px_rgba(2,6,23,0.45)] backdrop-blur-2xl">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/45 bg-amber-300/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100">
            ${icBolt}
            Nitro District
          </div>
          <h1 class="splash-title text-[1.8rem] font-black uppercase leading-[0.9] tracking-[-0.02em] text-white sm:text-[3.2rem] md:text-[4rem]">
            <span class="block bg-gradient-to-r from-white via-amber-100 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(253,224,71,0.4)]">MotoTaxi</span>
            <span class="block bg-gradient-to-r from-cyan-200 via-sky-300 to-fuchsia-300 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(34,211,238,0.42)]">Runner</span>
          </h1>
          <p class="mt-3 max-w-[34ch] text-sm font-extrabold uppercase leading-relaxed tracking-[0.08em] text-cyan-100/95 [text-shadow:0_0_16px_rgba(34,211,238,0.35),0_0_24px_rgba(251,191,36,0.2)]">
            Every fare is a race. Outrun every rival, grow your empire, and rule the streets.
          </p>
        </div>

        <div class="splash-panel inline-flex max-w-max items-center gap-4 rounded-2xl border border-fuchsia-300/30 bg-slate-950/45 px-4 py-3 shadow-[0_0_0_1px_rgba(244,114,182,0.15)] backdrop-blur-xl">
          <div class="relative flex h-14 w-14 items-center justify-center rounded-xl border border-fuchsia-300/45 bg-fuchsia-500/12">
            <span class="absolute inset-1 rounded-lg border border-fuchsia-200/25"></span>
            <span class="text-xl font-black text-fuchsia-100">MTR</span>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Official Badge</p>
            <p class="text-sm font-extrabold uppercase tracking-[0.13em] text-fuchsia-100">Street League</p>
          </div>
        </div>
      </main>

      <section class="relative order-1 flex flex-col gap-3 md:order-2 md:pt-4">
        <div class="splash-hero relative overflow-hidden rounded-2xl border border-white/18 bg-slate-950/45 shadow-[0_20px_60px_rgba(2,6,23,0.55)] sm:rounded-[1.8rem]">
          <div class="pointer-events-none absolute inset-0 z-[1] [background:radial-gradient(circle_at_75%_24%,rgba(250,204,21,0.24),transparent_35%),radial-gradient(circle_at_18%_40%,rgba(56,189,248,0.24),transparent_42%),linear-gradient(145deg,rgba(8,47,73,0.44),rgba(30,41,59,0.55))]"></div>
          <div class="pointer-events-none absolute inset-0 z-[2] [background:repeating-linear-gradient(105deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_14px)]"></div>

          <!-- Contenedor de imagen: altura ampliada para presencia visual -->
          <div class="relative z-[3] flex min-h-[78vw] w-full items-center justify-center sm:min-h-[420px] md:min-h-[460px] lg:aspect-[16/11] lg:min-h-[480px]">
            <!-- Fondo borroso (no scale, no recorte) -->
            <img src="${MOTO_HOME_PRIMARY}" alt="" aria-hidden="true"
              class="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-32 blur-sm [filter:saturate(1.22)_brightness(0.88)]"
              decoding="async" />
            <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(2,6,23,0.68)_0%,rgba(2,6,23,0.18)_34%,rgba(2,6,23,0.70)_100%)]"></div>
            <div class="pointer-events-none absolute inset-y-[28%] left-[-12%] h-[2px] w-[56%] rotate-[-9deg] bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent"></div>
            <div class="pointer-events-none absolute inset-y-[56%] right-[-10%] h-[3px] w-[44%] rotate-[-14deg] bg-gradient-to-r from-transparent via-amber-200/80 to-transparent"></div>

            <!--
              Imagen principal:
              - flex centra por padre (justify/items center)
              - mx-auto fallback de centrado por si el flex falla
              - max-w-full + h-auto para nunca exceder viewport (Bug #1 fix)
              - object-contain garantiza que el bitmap se vea completo
              - Tamaños ampliados para que la imagen tenga presencia visual
            -->
            <div class="relative flex h-full w-full items-center justify-center px-2 py-2 sm:px-4 sm:py-4">
              <img data-splash-moto-hero src="${MOTO_HOME_PRIMARY}" alt="Mototaxi"
                class="mx-auto block h-auto max-h-[72vw] w-auto max-w-[96%] rounded-xl object-contain sm:max-h-[380px] sm:max-w-[92%] sm:rounded-[1.2rem] md:max-h-[420px] md:max-w-[94%] lg:max-h-[440px] lg:max-w-[96%]
                       [filter:drop-shadow(0_18px_36px_rgba(0,0,0,0.6))_saturate(1.2)_contrast(1.12)]"
                decoding="async" />
            </div>

            <div class="pointer-events-none absolute bottom-3 left-3 rounded-full border border-cyan-200/55 bg-cyan-200/12 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-cyan-50 sm:bottom-4 sm:left-4 sm:px-2.5 sm:py-1 sm:text-[9px]">Speed FX</div>
            <div class="pointer-events-none absolute bottom-3 right-3 rounded-full border border-amber-200/55 bg-amber-200/12 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-amber-50 sm:bottom-4 sm:right-4 sm:px-2.5 sm:py-1 sm:text-[9px]">Nitro Glow</div>
          </div>

          <!-- Área del botón CTA -->
          <div class="relative z-[4] flex flex-col items-center justify-center gap-2 overflow-hidden border-t border-white/12 px-4 py-3 sm:gap-2.5 sm:px-5 sm:py-4">
            <img src="${MOTO_HOME_PRIMARY}" alt="" aria-hidden="true"
              class="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-22 blur-md [filter:saturate(1.25)_brightness(0.80)]"
              decoding="async" />
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/45 via-slate-900/25 to-slate-900/60"></div>
            <button type="button" data-splash-start
              class="splash-cta relative z-[1] group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-300 to-orange-400 px-6 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_30px_rgba(251,191,36,0.5)] transition active:scale-[0.97] sm:w-auto sm:px-8 sm:py-3 sm:text-sm sm:tracking-[0.2em]">
              ${icBolt}
              Iniciar carrera
            </button>
          </div>
        </div>
      </section>
    </div>

    <div id="splash-ranking" class="grid grid-cols-1 gap-3 px-4 pb-2 md:grid-cols-[1.2fr_0.8fr] md:px-8 lg:px-12">
      <div class="splash-panel overflow-hidden rounded-2xl border border-slate-200/15 bg-slate-950/48 shadow-[0_0_0_1px_rgba(148,163,184,0.15)] backdrop-blur-xl">
        <div class="flex items-center justify-between border-b border-slate-200/10 bg-slate-900/45 px-3 py-2.5">
          <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Modo libre</span>
          <span class="rounded border border-slate-300/25 bg-slate-800/60 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-slate-200/70">Local</span>
        </div>
        <div class="grid grid-cols-[2rem_1fr_auto] gap-x-2 border-b border-slate-200/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-300/55">
          <span>#</span>
          <span>Piloto</span>
          <span class="text-right">Crono</span>
        </div>
        <ol data-splash-free-leaderboard class="text-[11px]"></ol>
        <p class="border-t border-slate-200/10 bg-slate-900/45 px-2 py-1.5 text-center text-[8px] leading-snug text-slate-300/55">Tu apodo y tu mejor <span class="text-slate-100/75">carrera libre</span> se guardan localmente. Con Supabase: ranking global al finalizar.</p>
      </div>

      <div class="splash-panel flex gap-2 rounded-2xl border border-slate-200/15 bg-slate-950/48 p-2.5 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] backdrop-blur-xl">
        <div class="min-w-0 flex-1 rounded-xl border border-slate-200/10 bg-slate-900/50 px-2 py-1.5">
          <div class="text-[8px] font-bold uppercase tracking-widest text-slate-300/60">${icWifi} Ping</div>
          <span data-splash-ping class="font-mono text-base font-bold leading-none text-cyan-200">12<span class="text-xs text-cyan-200/55">ms</span></span>
        </div>
        <div class="min-w-0 flex-1 rounded-xl border border-slate-200/10 bg-slate-900/50 px-2 py-1.5">
          <div class="text-[8px] font-bold uppercase tracking-widest text-slate-300/60">Veloc.</div>
          <p class="font-mono text-base font-bold leading-none text-amber-100">0<small class="ml-0.5 text-[10px] text-amber-100/60">km/h</small></p>
        </div>
      </div>
    </div>

    <div id="splash-controles" class="splash-controls-row shrink-0 border-t border-cyan-300/15 bg-slate-950/40 px-3 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:px-6">
      <div
        class="splash-panel mx-auto w-full max-w-4xl rounded-xl border border-cyan-300/15 bg-slate-950/75 px-3 py-2.5 shadow-sm ring-1 ring-cyan-300/10 md:px-4"
        aria-label="Controles de entrada"
      >
        <p class="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200/85">${icKeyboard} Controles</p>
        <div class="flex flex-wrap content-start items-center gap-x-2.5 gap-y-1.5 text-[10px] text-slate-300/65">
          <span class="inline-flex flex-wrap items-center gap-1.5"><span class="shrink-0 text-slate-300/70">Acelerar</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact">W</kbd><span class="text-slate-400/70">·</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact" title="Arriba">↑</kbd></span>
          <span class="h-2.5 w-px bg-slate-700/70" aria-hidden="true"></span>
          <span class="inline-flex flex-wrap items-center gap-1.5"><span class="text-slate-300/70">Freno</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact">S</kbd><span class="text-slate-400/70">·</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact" title="Abajo">↓</kbd></span>
          <span class="h-2.5 w-px bg-slate-700/70" aria-hidden="true"></span>
          <span class="inline-flex flex-wrap items-center gap-1.5"><span class="text-slate-300/70">Giro</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact">A</kbd><kbd class="mtr-splash-kbd mtr-splash-kbd-compact">D</kbd><span class="text-slate-400/70">/</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact" title="Izq.">←</kbd><kbd class="mtr-splash-kbd mtr-splash-kbd-compact" title="Der.">→</kbd></span>
          <span class="h-2.5 w-px bg-slate-700/70" aria-hidden="true"></span>
          <span class="inline-flex items-center gap-1.5"><span class="text-slate-300/70">Reiniciar</span><kbd class="mtr-splash-kbd mtr-splash-kbd-compact">R</kbd></span>
        </div>
        <p class="mt-1.5 border-t border-slate-700/70 pt-1.5 text-[9px] leading-snug text-slate-300/60">${icDevice}<span class="text-slate-100/85">Móvil:</span> a dos manos: girar a la izquierda, gas y freno a la derecha; <span class="text-slate-200/75">Giro on</span> = inclinación (solo móvil) · <span class="text-slate-100/85">PC:</span> ratón, W, S, A/D</p>
      </div>
    </div>

    <footer class="splash-panel mt-0 shrink-0 border-t border-cyan-300/15 bg-slate-950/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center backdrop-blur-md md:px-8">
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] font-medium uppercase tracking-wider text-slate-300/55">
        <span class="cursor-default hover:text-slate-100/90">Privacidad</span>
        <span class="cursor-default hover:text-slate-100/90">Términos</span>
        <span class="cursor-default hover:text-slate-100/90">Legal</span>
        <span class="cursor-default hover:text-slate-100/90">Créditos</span>
      </div>
      <p class="mt-1 text-[9px] text-slate-300/45">© 2026 Mototaxi Runner · City Rush Edition · Vibe Jam</p>
    </footer>
  `;

  host.appendChild(root);

  const leaderboardOl = root.querySelector<HTMLOListElement>('[data-splash-free-leaderboard]');
  if (leaderboardOl) {
    renderSplashFreeLeaderboard(leaderboardOl);
  }

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
