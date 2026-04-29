import type { BikeStyle } from '../game/bikeModels';
import { ensureLocalFreeProfile } from '../lib/localFreeProfile';
import {
  createRoomAndJoin,
  formatRoomCodeDisplay,
  isRoomHost,
  joinRoomByCode,
  leaveRoomMember,
  normalizeRoomCodeInput,
  subscribeToRoomSync,
  type RoomMemberRow,
  type RoomSyncHandle,
} from '../lib/roomMembers';
import { isSupabaseConfigured } from '../lib/supabase';
import { icArrow, icCheck, icCopy, icHash, icHome, icPin, icUser } from './icons';

export type GameUiMode = 'practice' | 'multi';

/**
 * Contexto multiplayer pasado a `onStart` cuando la sesión arranca desde una sala.
 * `MotoGame` lo usa para emitir y recibir posiciones de fantasma.
 */
export type MultiplayerGameCtx = {
  playerId: string;
  syncHandle: RoomSyncHandle;
};

/** Modo de sesión: libre = lógica actual; contrarreloj = límite de tiempo. */
export type SessionGameMode = 'free' | 'time_attack';

export type GameUiRefs = {
  decorativeBg: HTMLElement;
  hudRoot: HTMLElement;
  mapCanvas: HTMLCanvasElement;
  routeSeg: [HTMLElement, HTMLElement, HTMLElement];
  timerMain: HTMLElement;
  timerFrac: HTMLElement;
  timerStatus: HTMLElement;
  timerDot: HTMLElement;
  speedValue: HTMLElement;
  speedBar: HTMLElement;
  /** Contenedor (mostrar con turbo activo) + relleno 0–100%. */
  turboHudWrap: HTMLElement;
  turboBarFill: HTMLElement;
  /** Mando táctil (móvil) – gas y freno (columna izquierda). */
  btnTouchForward: HTMLButtonElement;
  btnTouchBrake: HTMLButtonElement;
  /** Zona de arrastre táctil (móvil) – lado derecho; dedo horizontal → giro. */
  dragSteerZone: HTMLElement;
  pingBadge: HTMLElement;
  menuOverlay: HTMLElement;
  toggleSlider: HTMLElement;
  btnPractice: HTMLButtonElement;
  btnMulti: HTMLButtonElement;
  practicePanel: HTMLElement;
  multiPanel: HTMLElement;
  btnStart: HTMLButtonElement;
  startLabel: HTMLElement;
  roomCodeText: HTMLElement;
  btnCopy: HTMLButtonElement;
  finishOverlay: HTMLElement;
  finishTitle: HTMLElement;
  finishTime: HTMLElement;
  /** Estado de envío a Supabase tras completar carrera. */
  finishCloud: HTMLElement;
  /** Contenedor de cuenta atrás (solo Time Attack). */
  timeAttackHud: HTMLElement;
  timeAttackBarFill: HTMLElement;
  btnAgain: HTMLButtonElement;
  btnFinishClose: HTMLButtonElement;
  btnBackHome: HTMLButtonElement;
  passengerHud: HTMLElement;
  passengerLabel: HTMLElement;
  passengerArrow: HTMLElement;
  /**
   * Aviso al arrancar (mismo cajón, 5s): texto de PC o, en móvil vertical, sugerir girar a horizontal.
   * Contenido: `pcControlsHintText`.
   */
  pcControlsHint: HTMLElement;
  pcControlsHintText: HTMLElement;
};

function iconForStop(index: 0 | 1 | 2, state: 'done' | 'current' | 'pending'): string {
  if (state === 'done') return icCheck;
  if (index === 2) return icHome;
  return icPin;
}

/** Actualiza un paso de ruta sin sustituir el nodo (las referencias siguen válidas). */
export function updateRouteSegment(
  el: HTMLElement,
  label: string,
  index: 0 | 1 | 2,
  state: 'done' | 'current' | 'pending',
): void {
  const icon = iconForStop(index, state);
  if (state === 'done') {
    el.className = 'flex items-center gap-2 text-zinc-400';
    el.innerHTML = `<div class="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/50">${icon}</div><span class="text-xs font-medium tracking-wide">${label}</span>`;
  } else if (state === 'current') {
    el.className = 'flex items-center gap-2 text-amber-500';
    el.innerHTML = `<div class="flex h-5 w-5 animate-pulse items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">${icon}</div><span class="text-xs font-medium tracking-wide">${label}</span>`;
  } else {
    el.className = 'flex items-center gap-2 text-zinc-600 opacity-60';
    el.innerHTML = `<div class="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-800 bg-transparent">${icon}</div><span class="text-xs font-medium tracking-wide">${label}</span>`;
  }
}

const bikeBtnBase =
  'bike-style-btn flex flex-1 flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:shadow-amber-500/5 active:scale-[0.99]';
const bikeBtnOn =
  ' border-amber-500/50 bg-amber-500/[0.12] ring-2 ring-amber-400/30 shadow-[0_0_20px_-4px_rgba(245,158,11,0.45)]';
const bikeBtnOff = ' border-zinc-800 bg-zinc-950/50 hover:border-amber-500/25 hover:bg-zinc-900/70';

const sessionModeBtnBase =
  'session-mode-btn flex flex-1 flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all duration-200 hover:scale-[1.01]';
const sessionModeBtnOn = bikeBtnOn;
const sessionModeBtnOff = ' border-zinc-800 bg-zinc-950/50 hover:border-cyan-500/25 hover:bg-zinc-900/60';

export function buildGameUi(
  container: HTMLElement,
  handlers: {
    onStart: (sessionMode: SessionGameMode, mpCtx?: MultiplayerGameCtx | null) => void;
    onModeChange: (mode: GameUiMode) => void;
    /** Opcional; si no hay sala Supabase, `buildGameUi` copia el código mostrado. */
    onCopyRoom?: () => void;
    onFinishAgain: () => void;
    onFinishClose: () => void;
    initialBikeStyle: BikeStyle;
    onBikeStyle: (style: BikeStyle) => void;
    /** Si existe, muestra «Volver a inicio» (p. ej. regreso al splash). */
    onBackToHome?: () => void;
  },
): GameUiRefs {
  container.classList.add(
    'relative',
    'h-dvh',
    'min-h-0',
    'w-full',
    'max-w-full',
    'shrink-0',
    'overflow-hidden',
    'bg-zinc-950',
    'font-sans',
    'text-zinc-50',
    'antialiased',
  );

  const decorativeBg = document.createElement('div');
  decorativeBg.className =
    'pointer-events-none absolute inset-0 z-0 flex items-end justify-center overflow-hidden bg-zinc-950';
  decorativeBg.innerHTML = `
    <div class="absolute bottom-[-50%] left-[-50%] h-[200%] w-[200%]" style="background-size:60px 60px;background-image:linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);transform:perspective(300px) rotateX(75deg);"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,#09090b_90%)]"></div>
  `;
  if (container.firstChild) {
    container.insertBefore(decorativeBg, container.firstChild);
  } else {
    container.appendChild(decorativeBg);
  }

  const seg0 = document.createElement('div');
  const seg1 = document.createElement('div');
  const seg2 = document.createElement('div');
  updateRouteSegment(seg0, 'Pupy', 0, 'current');
  updateRouteSegment(seg1, 'Papá', 1, 'pending');
  updateRouteSegment(seg2, 'Casa', 2, 'pending');

  const routePill = document.createElement('div');
  routePill.className =
    'flex w-max items-center rounded-full border border-zinc-800/80 bg-zinc-900/60 py-1.5 pl-2 pr-4 shadow-sm shadow-black/20 backdrop-blur-md';
  const div1 = document.createElement('div');
  div1.className = 'mx-2 h-px w-6 bg-zinc-800';
  const div2 = document.createElement('div');
  div2.className = 'mx-2 h-px w-6 bg-zinc-800';
  routePill.append(seg0, div1, seg1, div2, seg2);

  const routeCol = document.createElement('div');
  routeCol.className = 'pointer-events-none fixed left-6 top-6 z-10 flex flex-col';
  const routeLbl = document.createElement('span');
  routeLbl.className = 'mb-2 ml-2 text-xs font-medium uppercase tracking-widest text-zinc-500';
  routeLbl.textContent = 'Ruta Activa';
  routeCol.append(routeLbl, routePill);

  const timerMain = document.createElement('span');
  timerMain.dataset.role = 'timer-main';
  timerMain.className =
    'text-3xl font-semibold tracking-tight tabular-nums text-zinc-50 drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]';
  timerMain.textContent = '0:00';
  const timerFrac = document.createElement('span');
  timerFrac.dataset.role = 'timer-frac';
  timerFrac.className = 'text-xl font-semibold tabular-nums text-zinc-400';
  timerFrac.textContent = '.00';
  const timeAttackHud = document.createElement('div');
  timeAttackHud.dataset.role = 'time-attack-hud';
  timeAttackHud.className =
    'mtr-ta-hud pointer-events-none mb-0.5 flex hidden w-full min-w-[min(90vw,280px)] max-w-sm flex-col items-center gap-1.5 rounded-xl border border-amber-500/30 bg-zinc-950/75 px-3 py-2 shadow-lg shadow-amber-500/5 backdrop-blur-md';
  timeAttackHud.setAttribute('aria-live', 'polite');
  const timeAttackLabel = document.createElement('div');
  timeAttackLabel.className =
    'w-full text-center text-[9px] font-bold uppercase leading-tight tracking-[0.28em] text-amber-400/90';
  timeAttackLabel.textContent = 'Time left';
  const timeAttackSub = document.createElement('div');
  timeAttackSub.className = 'text-center text-[10px] font-medium text-zinc-500';
  timeAttackSub.textContent = 'Complete Pupy → Papá → Casa before zero';
  const timeAttackTrack = document.createElement('div');
  timeAttackTrack.className =
    'h-2 w-full max-w-[240px] overflow-hidden rounded-full border border-amber-500/25 bg-zinc-900/90';
  const timeAttackBarFill = document.createElement('div');
  timeAttackBarFill.dataset.role = 'time-attack-bar';
  timeAttackBarFill.className =
    'h-full w-full min-w-0 max-w-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-[width] duration-200 ease-out';
  timeAttackBarFill.style.width = '100%';
  timeAttackTrack.append(timeAttackBarFill);
  timeAttackHud.append(timeAttackLabel, timeAttackSub, timeAttackTrack);

  const timerRow = document.createElement('div');
  timerRow.className = 'flex items-baseline justify-center gap-0';
  timerRow.append(timerMain, timerFrac);
  const timerDot = document.createElement('div');
  timerDot.dataset.role = 'timer-dot';
  timerDot.className = 'h-1.5 w-1.5 rounded-full bg-zinc-500';
  const timerStatus = document.createElement('span');
  timerStatus.dataset.role = 'timer-status';
  timerStatus.className = 'text-xs font-medium uppercase tracking-widest text-zinc-500';
  timerStatus.textContent = 'Menú';
  const timerMeta = document.createElement('div');
  timerMeta.className = 'mt-1 flex items-center gap-1.5';
  timerMeta.append(timerDot, timerStatus);
  const timerCol = document.createElement('div');
  timerCol.className =
    'pointer-events-none fixed left-1/2 top-6 z-10 flex w-[min(96vw,28rem)] -translate-x-1/2 flex-col items-center';
  timerCol.append(timeAttackHud, timerRow, timerMeta);

  const mapWrap = document.createElement('div');
  mapWrap.className =
    'pointer-events-none fixed right-[max(0.5rem,env(safe-area-inset-right))] top-16 z-10 flex flex-col items-end gap-0.5 sm:right-3 sm:top-20 sm:gap-1 md:right-6 md:top-24';
  const mapLbl = document.createElement('span');
  mapLbl.className =
    'text-[8px] font-medium uppercase tracking-widest text-zinc-500 sm:text-[9px] md:text-[10px]';
  mapLbl.textContent = 'Recorrido';
  const mapCanvas = document.createElement('canvas');
  mapCanvas.dataset.role = 'minimap';
  mapCanvas.className =
    'rounded-lg border border-zinc-800/90 bg-zinc-950/85 shadow-md shadow-black/35 backdrop-blur-sm sm:rounded-xl sm:shadow-lg sm:shadow-black/40';
  mapWrap.append(mapLbl, mapCanvas);

  const hudRoot = document.createElement('div');
  hudRoot.className =
    'pointer-events-none fixed inset-0 z-10 opacity-0 transition-opacity duration-300 [&.mtr-hud-on]:opacity-100';
  hudRoot.append(routeCol, timerCol, mapWrap);

  const kbd = document.createElement('div');
  kbd.className =
    'mtr-show-desktop-only pointer-events-none fixed bottom-6 left-6 z-10 gap-5 opacity-50';
  kbd.innerHTML = `
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-center">
        <kbd class="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 border-b-2 bg-zinc-900 font-mono text-xs text-zinc-400 shadow-sm">W</kbd>
      </div>
      <div class="flex gap-1.5">
        <kbd class="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 border-b-2 bg-zinc-900 font-mono text-xs text-zinc-400 shadow-sm">A</kbd>
        <kbd class="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 border-b-2 bg-zinc-900 font-mono text-xs text-zinc-400 shadow-sm">S</kbd>
        <kbd class="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 border-b-2 bg-zinc-900 font-mono text-xs text-zinc-400 shadow-sm">D</kbd>
      </div>
    </div>
    <div class="flex flex-col justify-end gap-1 pb-1">
      <span class="text-xs font-medium tracking-wide text-zinc-500">Mover / Acelerar</span>
      <div class="flex items-center gap-1 text-zinc-600">
        <kbd class="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] uppercase">R</kbd>
        <span class="text-[10px] font-medium uppercase tracking-wider">Reiniciar</span>
      </div>
      <span class="max-w-[200px] pt-1 text-[10px] leading-snug text-zinc-600">Móvil: flechas en pantalla; el giro es respecto al sentido de marcha.</span>
    </div>
  `;
  hudRoot.append(kbd);

  const speedWrap = document.createElement('div');
  speedWrap.className =
    'mtr-hud-speed-wrap pointer-events-none fixed z-10 flex flex-col items-end right-3';
  const speedValue = document.createElement('span');
  speedValue.dataset.role = 'speed-val';
  speedValue.className = 'pr-1 text-4xl font-semibold italic tracking-tight tabular-nums text-zinc-50';
  speedValue.textContent = '0';
  const speedRow = document.createElement('div');
  speedRow.className = 'flex items-baseline gap-1.5 text-zinc-50';
  speedRow.append(
    speedValue,
    (() => {
      const u = document.createElement('span');
      u.className = 'text-xs font-medium uppercase tracking-widest text-zinc-500';
      u.textContent = 'km/h';
      return u;
    })(),
  );
  const speedBar = document.createElement('div');
  speedBar.dataset.role = 'speed-bar';
  speedBar.className = 'h-full w-0 rounded-full bg-gradient-to-r from-amber-600 to-amber-400';
  const speedTrack = document.createElement('div');
  speedTrack.className =
    'mt-2 h-1 w-32 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm';
  speedTrack.append(speedBar);
  const turboHudWrap = document.createElement('div');
  turboHudWrap.dataset.role = 'turbo-hud';
  turboHudWrap.className = 'mt-2.5 hidden w-32 flex-col items-end gap-0.5';
  const turboLbl = document.createElement('span');
  turboLbl.className = 'text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400/90';
  turboLbl.textContent = 'Turbo';
  const turboTrack = document.createElement('div');
  turboTrack.className =
    'h-1 w-full overflow-hidden rounded-full border border-cyan-800/50 bg-zinc-950/90';
  const turboBarFill = document.createElement('div');
  turboBarFill.dataset.role = 'turbo-bar';
  turboBarFill.className = 'h-full w-0 rounded-full bg-gradient-to-r from-cyan-700 to-sky-300 shadow-[0_0_8px_rgba(34,211,238,0.35)]';
  turboTrack.append(turboBarFill);
  turboHudWrap.append(turboLbl, turboTrack);
  speedWrap.append(speedRow, speedTrack, turboHudWrap);
  hudRoot.append(speedWrap);

  /** Flecha + marcas de velocidad (acelerar). */
  const iconTouchAccel = `<span class="flex flex-col items-center gap-0.5"><span class="flex gap-0.5 opacity-80" aria-hidden="true">
<svg class="h-1.5 w-1.5" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M4 0L8 4H0L4 0z"/></svg>
<svg class="h-1.5 w-2" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M4 0L8 4H0L4 0z"/></svg>
<svg class="h-1.5 w-2.5" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M4 0L8 4H0L4 0z"/></svg>
</span>
<svg class="h-8 w-8 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4M4 12l8-8 8 8"/></svg></span>`;
  /** Símbolo de stop (freno). */
  const iconTouchBrake = `<svg class="h-7 w-7 sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
<path d="M9.3 2.2h5.4L22 7.3v9.4l-7.1 5.1H9.3L2 16.7V7.3L9.3 2.2z" fill="currentColor" fill-opacity="0.22"/>
<path d="M8.5 9.5h7v1.5h-7V9.5zm0 3.5h7v1.4h-7V13z" fill="currentColor"/></svg>`;

  // ── Gas button ──
  const btnTouchForward = document.createElement('button');
  btnTouchForward.type = 'button';
  btnTouchForward.dataset.role = 'touch-forward';
  btnTouchForward.setAttribute('aria-label', 'Acelerar (gas)');
  btnTouchForward.className =
    'mtr-touch-btn mtr-touch-throttle pointer-events-auto flex h-[4.35rem] w-[4.1rem] min-h-[4rem] min-w-[3.9rem] shrink-0 touch-manipulation select-none items-center justify-center rounded-2xl border-2 border-amber-400/55 bg-gradient-to-b from-zinc-800/95 to-zinc-900/95 text-amber-100 shadow-lg shadow-amber-950/30 transition-transform active:scale-[0.98] sm:h-[4.5rem] sm:min-h-[4.4rem] sm:w-[4.25rem] sm:min-w-[4rem]';
  btnTouchForward.innerHTML = iconTouchAccel;

  // ── Brake button ──
  const btnTouchBrake = document.createElement('button');
  btnTouchBrake.type = 'button';
  btnTouchBrake.dataset.role = 'touch-brake';
  btnTouchBrake.setAttribute('aria-label', 'Frenar');
  btnTouchBrake.className =
    'mtr-touch-btn mtr-touch-brake pointer-events-auto flex h-14 w-[4.1rem] min-h-[3.4rem] touch-manipulation select-none items-center justify-center rounded-2xl border-2 border-rose-500/50 bg-zinc-900/95 text-rose-200 shadow-md shadow-rose-950/25 transition-transform active:scale-[0.97] sm:h-[3.75rem] sm:w-[4.25rem]';
  btnTouchBrake.innerHTML = iconTouchBrake;

  // ── Drag-steer zone (right half, fills available space) ──
  const dragSteerZone = document.createElement('div');
  dragSteerZone.dataset.role = 'drag-steer-zone';
  dragSteerZone.setAttribute('aria-label', 'Zona de giro: desliza horizontalmente para girar');
  dragSteerZone.setAttribute('role', 'slider');
  dragSteerZone.className =
    'mtr-drag-steer pointer-events-auto flex flex-1 touch-manipulation select-none flex-col items-center justify-center self-stretch rounded-2xl border border-zinc-700/40 bg-zinc-900/30';
  // Visual hint: two horizontal arrows + label
  dragSteerZone.innerHTML = `
    <div class="flex flex-col items-center gap-1 opacity-40 pointer-events-none" aria-hidden="true">
      <svg class="h-7 w-14" viewBox="0 0 56 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14h48M4 14l8-7M4 14l8 7M52 14l-8-7M52 14l-8 7"/>
      </svg>
      <span class="text-[8px] font-bold uppercase tracking-widest text-zinc-400">Giro</span>
    </div>`;

  // ── Row: left column (brake + gas) | right zone (drag steer) ──
  const touchRow = document.createElement('div');
  touchRow.className =
    'mtr-touch-bar mtr-two-thumb mx-auto flex w-full max-w-[100vw] items-stretch gap-2 px-0.5 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:gap-3 sm:px-1';

  // Left column: brake on top, gas on bottom
  const touchColLeft = document.createElement('div');
  touchColLeft.className =
    'mtr-touch-cluster-left flex min-h-0 min-w-0 flex-col items-center justify-end gap-2 self-end pb-0.5 pl-0.5 sm:pl-1';
  touchColLeft.append(btnTouchBrake, btnTouchForward);

  touchRow.append(touchColLeft, dragSteerZone);

  const touchDetails = document.createElement('details');
  touchDetails.className = 'mx-auto mt-0.5 w-full max-w-sm px-3 text-center';
  const sumTip = document.createElement('summary');
  sumTip.className =
    'cursor-pointer list-none py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-400 sm:text-[11px]';
  sumTip.textContent = '⚙  Controles';
  const tipP = document.createElement('p');
  tipP.className =
    'pt-0.5 pb-1 text-left text-[9px] leading-relaxed text-zinc-500 sm:text-[10px]';
  tipP.textContent =
    'Móvil: Gas y freno a la izquierda. Desliza el dedo derecho horizontalmente para girar. PC: W / ↑ acelerar · S / ↓ frenar · A/D / ← → girar · Ratón para giro fino.';

  touchDetails.append(sumTip, tipP);
  const touchPad = document.createElement('div');
  touchPad.className =
    'mtr-touch-pad mtr-show-touch-only pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-stretch bg-gradient-to-t from-zinc-950/95 via-zinc-950/50 to-transparent pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2';
  touchPad.setAttribute('role', 'group');
  touchPad.setAttribute('aria-label', 'Control de conducción');
  touchPad.append(touchRow, touchDetails);
  hudRoot.append(touchPad);

  const passengerHud = document.createElement('div');
  passengerHud.dataset.role = 'passenger-hud';
  passengerHud.className =
    'mtr-hud-passenger pointer-events-none fixed left-1/2 z-20 hidden w-[min(92vw,320px)] -translate-x-1/2 transition-opacity duration-200';
  const passengerInner = document.createElement('div');
  passengerInner.className =
    'flex items-center justify-center gap-3 rounded-2xl border border-amber-500/35 bg-zinc-950/90 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md';
  const passengerIconWrap = document.createElement('div');
  passengerIconWrap.className =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-400';
  passengerIconWrap.innerHTML = icUser;
  const passengerArrow = document.createElement('span');
  passengerArrow.dataset.role = 'passenger-arrow';
  passengerArrow.className = 'text-2xl font-semibold leading-none text-amber-300';
  passengerArrow.textContent = '↑';
  passengerArrow.setAttribute('aria-hidden', 'true');
  const passengerLabel = document.createElement('p');
  passengerLabel.dataset.role = 'passenger-label';
  passengerLabel.className = 'text-sm font-medium leading-snug tracking-wide text-zinc-100';
  passengerLabel.textContent = 'Pasajero';
  passengerInner.append(passengerIconWrap, passengerArrow, passengerLabel);
  passengerHud.append(passengerInner);

  const pcControlsHint = document.createElement('div');
  pcControlsHint.dataset.role = 'session-start-hint';
  pcControlsHint.setAttribute('role', 'status');
  pcControlsHint.setAttribute('aria-live', 'polite');
  pcControlsHint.className =
    'mtr-pc-control-hint mtr-session-start-hint pointer-events-none fixed left-1/2 top-[min(28%,8rem)] z-30 flex hidden w-[min(92vw,22rem)] -translate-x-1/2 flex-col items-center sm:top-[min(32%,7.5rem)] sm:w-96';
  const pcControlsHintText = document.createElement('p');
  pcControlsHintText.dataset.role = 'session-hint-text';
  pcControlsHintText.className =
    'w-full rounded-2xl border-2 border-amber-400/90 bg-zinc-950/98 px-4 py-4 text-center text-[0.85rem] font-semibold leading-relaxed text-amber-50 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_50px_rgba(0,0,0,0.65),0_0_40px_rgba(245,158,11,0.2)] sm:px-5 sm:py-4 sm:text-base';
  pcControlsHintText.textContent =
    'Puedes usar el teclado o arrastrar el ratón en el juego para moverte (W, S, A, D, clic sostenido).';
  pcControlsHint.append(pcControlsHintText);
  hudRoot.append(pcControlsHint, passengerHud);

  container.appendChild(hudRoot);

  const menuOverlay = document.createElement('div');
  menuOverlay.className =
    'mtr-menu-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-zinc-950/65 p-3 py-4 backdrop-blur-md sm:items-center sm:p-4';
  menuOverlay.innerHTML = `
    <div class="pointer-events-none absolute inset-0 mtr-menu-ambient" aria-hidden="true"></div>
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(9_9_11/0.72)_100%)]" aria-hidden="true"></div>
    <div class="pointer-events-none absolute inset-0 mtr-menu-scanline" aria-hidden="true"></div>
    <div class="mtr-menu-card relative z-10 my-auto flex w-full max-w-[440px] min-h-0 max-h-[min(100dvh,100vh)] flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-zinc-900/94 shadow-[0_0_0_1px_rgb(39_39_42/0.8),0_25px_60px_-12px_rgb(0_0_0/0.75),0_0_80px_-20px_rgb(245_158_11/0.18)] backdrop-blur-xl">
      <div class="mtr-card-accent-line pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" aria-hidden="true"></div>
      <div class="relative flex shrink-0 items-start justify-between border-b border-zinc-800/50 bg-gradient-to-b from-zinc-800/25 to-zinc-900/40 px-6 py-5">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h1 class="mtr-menu-title text-2xl font-black tracking-[0.42em]">MTR</h1>
            <span class="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Beta</span>
          </div>
          <span class="text-xs font-medium tracking-wide text-zinc-400">Mototaxi Runner · Vibe Jam 2026</span>
        </div>
        <span data-role="ping" class="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-200 shadow-inner shadow-black/20">
          <span class="mtr-live-pulse h-2 w-2 shrink-0 rounded-full bg-green-500"></span>
          Local
        </span>
      </div>
      <div class="shrink-0 border-b border-zinc-800/40 bg-zinc-950/20 px-6 py-2.5" data-role="back-home-row">
        <button type="button" data-role="back-home" class="group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-zinc-500 transition-all hover:bg-zinc-800/50 hover:text-amber-400 hover:shadow-[0_0_12px_-4px_rgb(245_158_11/0.35)]">
          <span aria-hidden="true" class="transition-transform group-hover:-translate-x-0.5">←</span> Volver a inicio
        </button>
      </div>
      <div class="mtr-menu-body min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-6 [scrollbar-gutter:stable]">
        <div class="relative mb-6 flex items-center rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-1 shadow-inner shadow-black/30">
          <button type="button" data-mode="practice" class="relative z-10 flex-1 rounded-lg py-2 text-xs font-semibold transition-colors duration-300">Práctica</button>
          <button type="button" data-mode="multi" class="relative z-10 flex-1 rounded-lg py-2 text-xs font-semibold transition-colors duration-300">Multijugador</button>
          <div data-role="toggle-slider" class="pointer-events-none absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-lg border border-amber-500/20 bg-gradient-to-b from-zinc-700/90 to-zinc-800/90 shadow-md shadow-black/40 transition-[left] duration-300 ease-out" style="left:4px"></div>
        </div>
        <div data-panel="practice" class="flex flex-col gap-4">
          <p class="text-sm leading-relaxed text-zinc-400">Carrera local: completa <strong class="font-semibold text-amber-100/95">Pupy → Papá → Casa</strong> lo más rápido posible. Misma pista que en multijugador (cuando esté activo).</p>
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-500/85">Game mode</label>
            <div class="flex flex-col gap-2 sm:flex-row">
              <button type="button" data-session-mode="free" class="${sessionModeBtnBase}${sessionModeBtnOn}">
                <span class="text-xs font-semibold text-zinc-100">Free Mode</span>
                <span class="text-[10px] leading-snug text-zinc-500">Sin límite; mismo comportamiento de siempre.</span>
              </button>
              <button type="button" data-session-mode="time_attack" class="${sessionModeBtnBase}${sessionModeBtnOff}">
                <span class="text-xs font-semibold text-zinc-100">Time Attack</span>
                <span class="text-[10px] leading-snug text-zinc-500">Contrarreloj: termina la ruta antes de que se agote el tiempo.</span>
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">Estilo mototaxi (3D)</label>
            <div class="flex gap-2">
              <button type="button" data-bike="urban" class="${bikeBtnBase}${bikeBtnOff}">
                <span class="text-xs font-semibold text-zinc-100">MotoTaxi Blanco/Rojo</span>
                <span class="text-[10px] leading-snug text-zinc-500">Por defecto · ref. <code class="font-mono text-zinc-400">mototaxi2.jpg</code></span>
              </button>
              <button type="button" data-bike="classic" class="${bikeBtnBase}${bikeBtnOff}">
                <span class="text-xs font-semibold text-zinc-100">MotoTaxi Blanco/Negro</span>
                <span class="text-[10px] leading-snug text-zinc-500">Ref. <code class="font-mono text-zinc-400">mototaxi1.jpg</code></span>
              </button>
            </div>
            <p class="text-[10px] leading-snug text-zinc-600">Modelos 3D aproximados a esas fotos; para pixel-perfect se puede sustituir por GLB más adelante.</p>
          </div>
        </div>
        <div data-panel="multi" class="mt-6 hidden flex flex-col gap-6">
          <div data-role="multi-banner" class="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center text-xs font-medium text-amber-200/90">
            Fase 3: sala por código; los corredores se actualizan en tiempo real con Supabase.
          </div>
          <div class="flex flex-col gap-2.5">
            <label class="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Código de sala</label>
            <button type="button" data-role="room-btn" class="group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 opacity-60 transition-all hover:border-zinc-700">
              <div class="flex items-center gap-3">
                <span class="text-zinc-500">${icHash}</span>
                <span data-role="room-code" class="font-mono text-2xl font-medium tracking-[0.2em] text-zinc-100">— — — —</span>
              </div>
              <div class="flex items-center gap-1.5 rounded bg-zinc-800/50 px-2.5 py-1 text-xs font-medium text-zinc-400">
                ${icCopy}
                Copiar
              </div>
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-medium uppercase tracking-widest text-zinc-500" for="mtr-join-code">Unirse con código</label>
            <div class="flex gap-2">
              <input id="mtr-join-code" type="text" data-role="join-code" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ej. XK7P"
                class="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-2 font-mono text-sm uppercase tracking-widest text-zinc-100 outline-none ring-amber-500/0 transition placeholder:text-zinc-600 focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/20" />
              <button type="button" data-role="join-room" class="shrink-0 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/15">
                Unirse
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <label class="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Corredores</label>
            <div data-role="runners-list" class="flex flex-col gap-2" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <div class="shrink-0 border-t border-zinc-800/40 bg-zinc-950/25 p-6 pt-4">
        <button type="button" data-role="start" class="mtr-start-cta group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-amber-100 to-amber-200 py-4 pl-4 pr-5 text-sm font-bold tracking-wide text-zinc-950 transition-all hover:from-white hover:to-amber-100 hover:brightness-[1.03] disabled:animate-none disabled:shadow-none">
          <span class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-hover:[animation:mtr-shimmer_1.2s_ease-in-out_infinite]"></span>
          <span data-role="start-label" class="relative">Arrancar Motor</span>
          <span class="relative transition-transform duration-300 group-hover:translate-x-1">${icArrow}</span>
        </button>
      </div>
    </div>
  `;
  container.appendChild(menuOverlay);

  const finishOverlay = document.createElement('div');
  finishOverlay.className =
    'mtr-finish-overlay fixed inset-0 z-[60] flex hidden items-start justify-center overflow-y-auto overflow-x-hidden bg-zinc-950/55 p-3 py-4 backdrop-blur-sm sm:items-center sm:p-4';
  finishOverlay.innerHTML = `
    <div class="my-auto w-full max-w-[420px] max-h-[min(100dvh,100svh)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-zinc-800/80 bg-zinc-900/95 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl [scrollbar-gutter:stable]" role="dialog" aria-modal="true" aria-label="Resultado">
      <h2 data-role="finish-title" class="text-xl font-semibold tracking-tight text-zinc-50">¡Llegaste!</h2>
      <p data-role="finish-time" class="mt-3 font-mono text-lg text-amber-400/95">Tiempo: 0:00.00</p>
      <p data-role="finish-cloud" class="mt-2 hidden min-h-[1.25rem] text-xs text-zinc-500" aria-live="polite"></p>
      <p class="mt-2 text-sm leading-relaxed text-zinc-400">Desempate (si aplica): menor tiempo en el último tramo (casa de mamá), luego el anterior.</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button type="button" data-role="again" class="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white">Otra carrera</button>
        <button type="button" data-role="finish-close" class="rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800">Seguir</button>
      </div>
    </div>
  `;
  container.appendChild(finishOverlay);

  const q = <T extends HTMLElement>(root: HTMLElement | DocumentFragment, sel: string): T => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`Missing ${sel}`);
    return el as T;
  };

  const pingBadge = q(menuOverlay, '[data-role="ping"]');
  const toggleSlider = q(menuOverlay, '[data-role="toggle-slider"]');
  const btnPractice = q(menuOverlay, '[data-mode="practice"]') as HTMLButtonElement;
  const btnMulti = q(menuOverlay, '[data-mode="multi"]') as HTMLButtonElement;
  const practicePanel = q(menuOverlay, '[data-panel="practice"]');
  const btnBikeClassic = q(practicePanel, '[data-bike="classic"]') as HTMLButtonElement;
  const btnBikeUrban = q(practicePanel, '[data-bike="urban"]') as HTMLButtonElement;
  const btnModeFree = q(practicePanel, '[data-session-mode="free"]') as HTMLButtonElement;
  const btnModeTimeAttack = q(practicePanel, '[data-session-mode="time_attack"]') as HTMLButtonElement;
  const multiPanel = q(menuOverlay, '[data-panel="multi"]');
  const btnStart = q(menuOverlay, '[data-role="start"]') as HTMLButtonElement;
  const startLabel = q(menuOverlay, '[data-role="start-label"]');
  const roomCodeText = q(menuOverlay, '[data-role="room-code"]');
  const btnCopy = q(menuOverlay, '[data-role="room-btn"]') as HTMLButtonElement;
  const multiBanner = q(menuOverlay, '[data-role="multi-banner"]');
  const runnersList = q(menuOverlay, '[data-role="runners-list"]');
  const joinCodeInput = q(menuOverlay, '[data-role="join-code"]') as HTMLInputElement;
  const btnJoinRoom = q(menuOverlay, '[data-role="join-room"]') as HTMLButtonElement;
  const finishTitle = q(finishOverlay, '[data-role="finish-title"]');
  const finishTime = q(finishOverlay, '[data-role="finish-time"]');
  const finishCloud = q(finishOverlay, '[data-role="finish-cloud"]');
  const btnAgain = q(finishOverlay, '[data-role="again"]') as HTMLButtonElement;
  const btnFinishClose = q(finishOverlay, '[data-role="finish-close"]') as HTMLButtonElement;
  const btnBackHome = q(menuOverlay, '[data-role="back-home"]') as HTMLButtonElement;
  const backHomeRow = q(menuOverlay, '[data-role="back-home-row"]') as HTMLElement;
  if (handlers.onBackToHome) {
    btnBackHome.addEventListener('click', () => handlers.onBackToHome!());
  } else {
    backHomeRow.classList.add('hidden');
  }

  let mpUnsub: (() => void) | null = null;
  let mpSync: RoomSyncHandle | null = null;
  let mpRoomCode: string | null = null;
  let mpPlayerId: string | null = null;
  let mpEntering = false;
  let menuUiMode: GameUiMode = 'practice';

  function escapeUi(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderRunnersList(members: RoomMemberRow[], selfId: string): void {
    runnersList.textContent = '';
    if (members.length === 0) {
      const empty = document.createElement('div');
      empty.className =
        'flex min-h-[54px] items-center justify-center rounded-lg border border-dashed border-zinc-800/30 bg-zinc-950/20 px-2';
      empty.innerHTML =
        '<span class="text-xs font-medium text-zinc-600">Nadie en la sala aún</span>';
      runnersList.appendChild(empty);
      return;
    }
    for (const m of members) {
      const row = document.createElement('div');
      const isSelf = m.player_id === selfId;
      const label = m.display_name?.trim() || `${m.player_id.slice(0, 8)}…`;
      row.className =
        'flex items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-800/20 p-2.5';
      row.innerHTML = `
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">${icUser}</div>
          <span class="min-w-0 truncate text-sm font-medium text-zinc-100">${escapeUi(label)}</span>
        </div>
        <span class="shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
          isSelf
            ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
            : 'border-zinc-600/40 bg-zinc-900/50 text-zinc-400'
        }">${isSelf ? 'Tú' : 'En sala'}</span>`;
      runnersList.appendChild(row);
    }
  }

  function applyMultiplayerStartUi(members: RoomMemberRow[], selfId: string): void {
    if (menuUiMode !== 'multi') return;
    if (!mpRoomCode) return;
    const host = isRoomHost(members, selfId);
    if (host) {
      btnStart.disabled = false;
      startLabel.textContent = 'Iniciar carrera';
      btnStart.classList.remove('cursor-not-allowed', 'opacity-60');
    } else {
      btnStart.disabled = true;
      startLabel.textContent = 'Esperando anfitrión…';
      btnStart.classList.add('cursor-not-allowed', 'opacity-60');
    }
  }

  async function cleanupMultiplayerRoom(): Promise<void> {
    mpSync = null;
    if (mpUnsub) {
      mpUnsub();
      mpUnsub = null;
    }
    const code = mpRoomCode;
    const pid = mpPlayerId;
    mpRoomCode = null;
    mpPlayerId = null;
    if (code && pid) {
      await leaveRoomMember(code, pid);
    }
  }

  async function enterMultiplayerTab(): Promise<void> {
    if (mpEntering) return;
    mpEntering = true;
    joinCodeInput.value = '';
    roomCodeText.textContent = '— — — —';
    btnCopy.classList.add('opacity-60');

    try {
      await cleanupMultiplayerRoom();

      const prof = ensureLocalFreeProfile();
      mpPlayerId = prof.id;

      if (!isSupabaseConfigured()) {
        multiBanner.textContent =
          'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (.env) y ejecuta la migración supabase/migrations/003_room_members_presence.sql.';
        runnersList.innerHTML =
          '<div class="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-4 text-center text-xs leading-relaxed text-zinc-500">Sin Supabase: sin salas online.</div>';
        return;
      }

      multiBanner.textContent = 'Creando sala…';
      runnersList.innerHTML =
        '<div class="flex min-h-[54px] items-center justify-center text-xs text-zinc-500">Conectando…</div>';

      const created = await createRoomAndJoin({
        playerId: prof.id,
        displayName: prof.handle,
      });

      if (!created.ok) {
        multiBanner.textContent = created.message;
        runnersList.innerHTML = `<div class="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300/95">${escapeUi(
          created.message,
        )}</div>`;
        return;
      }

      mpRoomCode = created.roomCode;
      roomCodeText.textContent = formatRoomCodeDisplay(created.roomCode);
      btnCopy.classList.remove('opacity-60');
      multiBanner.textContent =
        'Comparte el código o usa «Unirse» en otro dispositivo con el mismo código. La lista se actualiza en vivo.';

      const sync = subscribeToRoomSync(created.roomCode, {
        onMembersChange: (members: RoomMemberRow[]) => {
          renderRunnersList(members, prof.id);
          applyMultiplayerStartUi(members, prof.id);
        },
        onStartRaceBroadcast: () => {
          if (menuOverlay.classList.contains('hidden')) return;
          const mpCtx: MultiplayerGameCtx | null = mpSync
            ? { playerId: prof.id, syncHandle: mpSync }
            : null;
          handlers.onStart(sessionMode, mpCtx);
        },
      });
      if (!sync) {
        multiBanner.textContent = 'No se pudo conectar al canal en tiempo real.';
        mpSync = null;
        mpUnsub = null;
        return;
      }
      mpSync = sync;
      mpUnsub = () => sync.unsubscribe();
    } finally {
      mpEntering = false;
    }
  }

  const applyMode = (m: GameUiMode) => {
    menuUiMode = m;
    handlers.onModeChange(m);
    if (m === 'practice') {
      toggleSlider.style.left = '4px';
      btnPractice.classList.add('text-zinc-50');
      btnPractice.classList.remove('text-zinc-400');
      btnMulti.classList.add('text-zinc-400');
      btnMulti.classList.remove('text-zinc-50');
      practicePanel.classList.remove('hidden');
      multiPanel.classList.add('hidden');
      btnStart.disabled = false;
      startLabel.textContent = 'Arrancar Motor';
      btnStart.classList.remove('cursor-not-allowed', 'opacity-60');
      void cleanupMultiplayerRoom();
    } else {
      toggleSlider.style.left = 'calc(50% - 0px)';
      btnMulti.classList.add('text-zinc-50');
      btnMulti.classList.remove('text-zinc-400');
      btnPractice.classList.add('text-zinc-400');
      btnPractice.classList.remove('text-zinc-50');
      practicePanel.classList.add('hidden');
      multiPanel.classList.remove('hidden');
      btnStart.disabled = true;
      startLabel.textContent = 'Conectando…';
      btnStart.classList.add('cursor-not-allowed', 'opacity-60');
      void enterMultiplayerTab();
    }
  };

  const applyBikeUi = (style: BikeStyle) => {
    const onC = style === 'classic';
    btnBikeClassic.className = bikeBtnBase + (onC ? bikeBtnOn : bikeBtnOff);
    btnBikeUrban.className = bikeBtnBase + (!onC ? bikeBtnOn : bikeBtnOff);
  };

  let sessionMode: SessionGameMode = 'free';
  const applySessionMode = (m: SessionGameMode) => {
    sessionMode = m;
    const free = m === 'free';
    btnModeFree.className = sessionModeBtnBase + (free ? sessionModeBtnOn : sessionModeBtnOff);
    btnModeTimeAttack.className = sessionModeBtnBase + (!free ? sessionModeBtnOn : sessionModeBtnOff);
  };

  btnModeFree.addEventListener('click', () => applySessionMode('free'));
  btnModeTimeAttack.addEventListener('click', () => applySessionMode('time_attack'));
  applySessionMode('free');

  btnBikeClassic.addEventListener('click', () => {
    handlers.onBikeStyle('classic');
    applyBikeUi('classic');
  });
  btnBikeUrban.addEventListener('click', () => {
    handlers.onBikeStyle('urban');
    applyBikeUi('urban');
  });
  applyBikeUi(handlers.initialBikeStyle);

  btnPractice.addEventListener('click', () => applyMode('practice'));
  btnMulti.addEventListener('click', () => applyMode('multi'));
  applyMode('practice');

  btnStart.addEventListener('click', async () => {
    if (btnStart.disabled) return;
    if (menuUiMode === 'practice') {
      handlers.onStart(sessionMode);
      return;
    }
    if (!mpSync) return;
    const r = await mpSync.sendStartRace();
    if (!r.ok) {
      multiBanner.textContent = r.message;
    }
  });

  joinCodeInput.addEventListener('input', () => {
    joinCodeInput.value = normalizeRoomCodeInput(joinCodeInput.value);
  });

  btnJoinRoom.addEventListener('click', async () => {
    if (!isSupabaseConfigured()) return;
    const target = normalizeRoomCodeInput(joinCodeInput.value);
    if (target.length !== 4) {
      multiBanner.textContent = 'Introduce un código de 4 caracteres.';
      return;
    }
    const prof = ensureLocalFreeProfile();
    mpPlayerId = prof.id;
    multiBanner.textContent = 'Uniendo…';

    mpSync = null;
    if (mpUnsub) {
      mpUnsub();
      mpUnsub = null;
    }
    const prevCode = mpRoomCode;
    mpRoomCode = null;
    if (prevCode) {
      await leaveRoomMember(prevCode, prof.id);
    }

    const r = await joinRoomByCode({
      roomCode: target,
      playerId: prof.id,
      displayName: prof.handle,
    });
    if (!r.ok) {
      multiBanner.textContent = r.message;
      void enterMultiplayerTab();
      return;
    }

    mpRoomCode = target;
    roomCodeText.textContent = formatRoomCodeDisplay(target);
    btnCopy.classList.remove('opacity-60');
    multiBanner.textContent = `En sala ${formatRoomCodeDisplay(target)} · lista en vivo.`;

    const sync = subscribeToRoomSync(target, {
      onMembersChange: (members: RoomMemberRow[]) => {
        renderRunnersList(members, prof.id);
        applyMultiplayerStartUi(members, prof.id);
      },
      onStartRaceBroadcast: () => {
        if (menuOverlay.classList.contains('hidden')) return;
        const mpCtx: MultiplayerGameCtx | null = mpSync
          ? { playerId: prof.id, syncHandle: mpSync }
          : null;
        handlers.onStart(sessionMode, mpCtx);
      },
    });
    if (!sync) {
      multiBanner.textContent = 'No se pudo conectar al canal en tiempo real.';
      mpSync = null;
      mpUnsub = null;
      return;
    }
    mpSync = sync;
    mpUnsub = () => sync.unsubscribe();
  });

  btnCopy.addEventListener('click', async () => {
    const raw = roomCodeText.textContent ?? '';
    const code = normalizeRoomCodeInput(raw.replace(/\s/g, ''));
    if (code.length === 4) {
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        /* ignore */
      }
    }
    handlers.onCopyRoom?.();
  });
  btnAgain.addEventListener('click', () => handlers.onFinishAgain());
  btnFinishClose.addEventListener('click', () => handlers.onFinishClose());

  return {
    decorativeBg,
    hudRoot,
    mapCanvas,
    routeSeg: [seg0, seg1, seg2],
    timerMain,
    timerFrac,
    timerStatus,
    timerDot,
    speedValue,
    speedBar,
    turboHudWrap,
    turboBarFill,
    btnTouchForward,
    btnTouchBrake,
    dragSteerZone,
    pingBadge,
    menuOverlay,
    toggleSlider,
    btnPractice,
    btnMulti,
    practicePanel,
    multiPanel,
    btnStart,
    startLabel,
    roomCodeText,
    btnCopy,
    finishOverlay,
    finishTitle,
    finishTime,
    finishCloud,
    timeAttackHud,
    timeAttackBarFill,
    btnAgain,
    btnFinishClose,
    btnBackHome,
    passengerHud,
    passengerLabel,
    passengerArrow,
    pcControlsHint,
    pcControlsHintText,
  };
}
