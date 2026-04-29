export type InputState = {
  throttle: number;
  brake: number;
  steer: number;
};

const keys = new Set<string>();

let pointerDriving = false;
let pointerSteer = 0;
/** En multitacto, solo este `pointerId` actualiza giro/acel. del lienzo (evita dedo cruzado). */
let pointerDrivePointerId: number | null = null;

const SELECTOR_BLOCK_POINTER_DRIVER =
  '.mtr-touch-pad,.mtr-menu-overlay,.mtr-finish-overlay,.splash-root';

/** Mando en pantalla: izq. / dcha. (giro), adelante (acelerar), freno; un id por contacto, multitacto. */
const padLeftIds = new Set<number>();
const padRightIds = new Set<number>();
const padForwardIds = new Set<number>();
const padBrakeIds = new Set<number>();

/** Giro con posición del ratón sobre el lienzo (PC con puntero fino; sin acelerar solo). */
let mouseAimSteer = 0;
let useMouseAim = false;

/**
 * Giro por inclinación relativa (solo izq/der; acelerar sigue con la flecha u otros).
 * Requiere activar; en iOS 13+ permiso de orientación. Se toma un centro al activar o al recalibrar.
 */
let tiltInputOn = false;
/** Giro bruto -1..1 desde orientación (tras calibrar); el suavizado y dead zone se aplican en `pollInput`. */
let tiltSteerRaw = 0;
let tiltFiltered = 0;
let tiltHasSample = false;
let tiltRefG: number | null = null;
let tiltRefB: number | null = null;
let tiltCalAccG = 0;
let tiltCalAccB = 0;
let tiltCalCountG = 0;
let tiltCalCountB = 0;
let tiltCalTicks = 0;
/** Listener `deviceorientation` (iOS, fallback Android). */
let tiltHandler: ((e: Event) => void) | null = null;
let tiltRelativeAttached = false;
/** Listener `deviceorientationabsolute` (Chrome Android estable, fuente única si existe). */
let tiltAbsoluteHandler: ((e: Event) => void) | null = null;
let tiltAbsoluteAttached = false;
let tiltLastEventAtMs = 0;
let tiltEventCount = 0;
/** Valores crudos del último evento (debug UI). */
let tiltLastGamma: number | null = null;
let tiltLastBeta: number | null = null;
let tiltLastAlpha: number | null = null;
let tiltLastSrc: 'orientation' | 'orientationabsolute' | null = null;
let orientationSteer = 0;
let tiltDebugLastConsoleMs = 0;

/** Diagnóstico activable con `?tiltdebug=1`. Sin coste si no está activo. */
const TILT_DEBUG = ((): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('tiltdebug');
  } catch {
    return false;
  }
})();
function tiltLog(...args: unknown[]): void {
  if (TILT_DEBUG) {
    console.log('[tilt]', ...args);
  }
}

function isLikelyAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent ?? '');
}

/**
 * En landscape el volante (roll izq/dcha) alinea mejor tras intercambiar beta↔gamma respecto al modelo portrait.
 * Los valores crudos del evento siguen guardándose en tiltLast* para debug; solo el procesamiento de giro usa el swap.
 */
function normalizeBetaGammaForLandscapeSteering(
  beta: number | null,
  gamma: number | null,
): { beta: number | null; gamma: number | null } {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const landscape = w > 0 && h > 0 && w > h;
  if (!landscape) {
    return { beta, gamma };
  }
  return { beta: gamma, gamma: beta };
}
const TILT_CAL_MIN = 3;
const TILT_CAL_MAX_WAIT = 18;
const TILT_SENSE_P = 0.05;
const TILT_SENSE_L_G = 0.052;
const TILT_SENSE_L_B = 0.045;
const TILT_DEADZONE = 0.055;
const TILT_SMOOTH = 0.16;
const TILT_MAX_STEER = 0.92;
const TILT_CURVE_EXP = 1.35;
const TILT_MAX_DELTA_PER_SEC = 3.2;
let tiltLastSampleAtMs = 0;

const W_STEER_KEY = 1.0;
const W_STEER_PAD = 1.0;
const W_STEER_POINTER = 1.0;
const W_STEER_MOUSE = 1.0;
/** Curva suave; más cercana a 1 = giro más directo (mejor con ratón en PC). */
const STEER_NONLINEAR_EXP = 1.02;
/** (nx-0.5) * escala → -1..1. */
const CANVAS_X_STEER_MULT = 1.6;

/** Mouse sensitivity configuration */
const MOUSE_SENSITIVITY = 1.15;
const MOUSE_SMOOTHING = 0.34;
const MOUSE_DEADZONE = 0.025;
const MOUSE_IDLE_RESET_MS = 140;

/** Mouse smoothing state */
let mouseRawSteer = 0;
let mouseSmoothedSteer = 0;
let lastMouseMoveAt = 0;

/** Si el juego (p. ej. MotoGame) ajusta la respuesta con puntero fino sobre el lienzo. */
export function isMouseAimInputActive(): boolean {
  return useMouseAim;
}

function readSteerKeys(): number {
  let s = 0;
  if (keys.has('a') || keys.has('arrowleft')) s -= 1;
  if (keys.has('d') || keys.has('arrowright')) s += 1;
  return s;
}

function readThrottleKeys(): number {
  return keys.has('w') || keys.has('arrowup') ? 1 : 0;
}

function readBrakeKeys(): number {
  return keys.has('s') || keys.has('arrowdown') ? 1 : 0;
}

function isMovementKey(key: string): boolean {
  return (
    key === 'w' ||
    key === 'a' ||
    key === 's' ||
    key === 'd' ||
    key === 'arrowup' ||
    key === 'arrowdown' ||
    key === 'arrowleft' ||
    key === 'arrowright'
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function attachKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (isMovementKey(key) && !isEditableTarget(e.target)) {
      e.preventDefault();
      keys.add(key);
      return;
    }
    if (e.repeat) return;
    keys.add(key);
  };
  const up = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (isMovementKey(key) && !isEditableTarget(e.target)) {
      e.preventDefault();
    }
    keys.delete(key);
  };
  
  // Use capture phase for faster response
  window.addEventListener('keydown', down, { capture: true, passive: false });
  window.addEventListener('keyup', up, { capture: true, passive: false });
  
  return () => {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
  };
}

/**
 * Mando/overlay encima del canvas (hit test: Android/Chrome 14+).
 * `e.target` puede ser el canvas aun haya otra capa; `elementFromPoint` con dedo/pen.
 */
function isPointerDriverBlockedByTopLayer(e: PointerEvent, canvas: HTMLElement): boolean {
  if (e.target !== canvas) {
    return true;
  }
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    const top = document.elementFromPoint(e.clientX, e.clientY);
    if (!top) {
      return true;
    }
    return (top as Element).closest(SELECTOR_BLOCK_POINTER_DRIVER) != null;
  }
  return (canvas as Element).closest(SELECTOR_BLOCK_POINTER_DRIVER) != null;
}

function clearPointerDriverState(): void {
  pointerDriving = false;
  pointerSteer = 0;
  pointerDrivePointerId = null;
}

/** Conducción con ratón o dedo: mantén pulsado sobre el juego = acelera; mueve izquierda/derecha = gira. */
export function attachPointerDriver(el: HTMLElement): () => void {
  const updateSteer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    pointerSteer = Math.max(-1, Math.min(1, (nx - 0.5) * CANVAS_X_STEER_MULT));
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (e.target !== el) return;
    if (isPointerDriverBlockedByTopLayer(e, el)) return;
    pointerDriving = true;
    useMouseAim = false;
    mouseRawSteer = 0;
    mouseSmoothedSteer = 0;
    pointerDrivePointerId = e.pointerId;
    updateSteer(e);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointerDriving || e.pointerId !== pointerDrivePointerId) return;
    updateSteer(e);
  };

  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerDrivePointerId) return;
    clearPointerDriverState();
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onCtx = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', onCtx);

  return () => {
    clearPointerDriverState();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.removeEventListener('lostpointercapture', end);
    el.removeEventListener('contextmenu', onCtx);
  };
}

function resetTiltCalibration(): void {
  tiltRefG = null;
  tiltRefB = null;
  tiltCalAccG = 0;
  tiltCalAccB = 0;
  tiltCalCountG = 0;
  tiltCalCountB = 0;
  tiltCalTicks = 0;
  orientationSteer = 0;
  tiltSteerRaw = 0;
  tiltFiltered = 0;
  tiltHasSample = false;
  tiltLastSampleAtMs = 0;
  tiltLastAlpha = null;
}

function applyDeadzoneNormalized(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / Math.max(1e-5, 1 - dz);
  return Math.sign(v) * Math.max(0, Math.min(1, n));
}

function shapeTiltSteer(v: number): number {
  const z = applyDeadzoneNormalized(v, TILT_DEADZONE);
  if (z === 0) return 0;
  const a = Math.pow(Math.abs(z), TILT_CURVE_EXP);
  return Math.sign(z) * Math.min(TILT_MAX_STEER, a * TILT_MAX_STEER);
}

/** Giro a partir de la diferencia respecto al pose «neutro» calibrada (no valores absolutos). */
function relativeSteerFromTilt(
  b: number | null,
  g: number | null,
  rG: number,
  rB: number,
): number {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const isLandscape = w > 0 && h > 0 && w > h;
  if (isLandscape) {
    const dg = g != null ? g - rG : 0;
    const db = b != null ? b - rB : 0;
    if (b != null && g != null) {
      return Math.max(-1, Math.min(1, dg * TILT_SENSE_L_G + db * TILT_SENSE_L_B));
    }
    if (b != null) {
      return Math.max(-1, Math.min(1, db * (TILT_SENSE_L_B * 1.2)));
    }
    if (g != null) {
      return Math.max(-1, Math.min(1, dg * (TILT_SENSE_L_G * 1.1)));
    }
    return 0;
  }
  if (g != null) {
    return Math.max(-1, Math.min(1, (g - rG) * TILT_SENSE_P));
  }
  if (b != null) {
    return Math.max(-1, Math.min(1, (b - rB) * (TILT_SENSE_P * 0.85)));
  }
  return 0;
}

function tryFinishTiltCalibration(b: number | null, g: number | null): void {
  if (g != null) {
    tiltCalAccG += g;
    tiltCalCountG++;
  }
  if (b != null) {
    tiltCalAccB += b;
    tiltCalCountB++;
  }
  tiltCalTicks++;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const isLandscape = w > 0 && h > 0 && w > h;
  const haveEnoughG = tiltCalCountG >= TILT_CAL_MIN;
  const haveEnough =
    haveEnoughG && (!isLandscape || tiltCalCountB >= 1 || tiltCalTicks >= 10);
  const force =
    tiltCalTicks >= TILT_CAL_MAX_WAIT && (tiltCalCountG >= 1 || tiltCalCountB >= 1);
  if (haveEnough || force) {
    tiltRefG = tiltCalCountG > 0 ? tiltCalAccG / tiltCalCountG : 0;
    tiltRefB = tiltCalCountB > 0 ? tiltCalAccB / tiltCalCountB : 90;
  }
}

function updateTiltFromOrientation(e: DeviceOrientationEvent, src: 'orientation' | 'orientationabsolute'): void {
  if (!tiltInputOn) {
    tiltSteerRaw = 0;
    return;
  }

  const rawA = e.alpha != null && Number.isFinite(e.alpha) ? e.alpha : null;
  const rawB = e.beta != null && Number.isFinite(e.beta) ? e.beta : null;
  const rawG = e.gamma != null && Number.isFinite(e.gamma) ? e.gamma : null;

  tiltLastAlpha = rawA;
  tiltLastBeta = rawB;
  tiltLastGamma = rawG;

  const { beta: b, gamma: g } = normalizeBetaGammaForLandscapeSteering(rawB, rawG);

  tiltLastEventAtMs = performance.now();
  tiltEventCount++;
  tiltLastSrc = src;

  if (rawB == null && rawG == null) {
    if (TILT_DEBUG && tiltEventCount % 30 === 1) {
      tiltLog('event with null gamma/beta from', src, '— sensor not delivering values');
    }
    return;
  }

  tiltHasSample = true;
  if (TILT_DEBUG && tiltEventCount === 1) {
    tiltLog('first event from', src, { alpha: rawA, gamma: rawG, beta: rawB });
  }

  if (tiltRefG === null) {
    tryFinishTiltCalibration(b, g);
    if (tiltRefG === null) {
      return;
    }
  }

  const rG = tiltRefG ?? 0;
  const rB = tiltRefB ?? 90;
  orientationSteer = relativeSteerFromTilt(b, g, rG, rB);
  const shaped = shapeTiltSteer(Math.max(-1, Math.min(1, orientationSteer)));

  const nowMs = performance.now();
  const dt = tiltLastSampleAtMs > 0 ? Math.max(0.001, (nowMs - tiltLastSampleAtMs) / 1000) : 0.016;
  tiltLastSampleAtMs = nowMs;
  const maxDelta = TILT_MAX_DELTA_PER_SEC * dt;
  const lo = tiltSteerRaw - maxDelta;
  const hi = tiltSteerRaw + maxDelta;
  tiltSteerRaw = Math.max(lo, Math.min(hi, shaped));

  if (TILT_DEBUG) {
    const t = performance.now();
    if (t - tiltDebugLastConsoleMs > 320) {
      tiltDebugLastConsoleMs = t;
      const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(1));
      console.log(
        `Sensor Active: [${fmt(rawA)}, ${fmt(rawB)}, ${fmt(rawG)}] | src=${src} rawSteer=${tiltSteerRaw.toFixed(3)}`,
      );
    }
  }
}

/**
 * Android Chrome: `deviceorientationabsolute` como fuente única reduce salto magnético / drift.
 * iOS / fallback: solo `deviceorientation`.
 */
function ensureTiltListener(): void {
  if (tiltRelativeAttached || tiltAbsoluteAttached) return;
  const android = isLikelyAndroid();
  const hasAbs = typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;

  if (android && hasAbs) {
    tiltAbsoluteHandler = (ev: Event) =>
      updateTiltFromOrientation(ev as DeviceOrientationEvent, 'orientationabsolute');
    window.addEventListener('deviceorientationabsolute', tiltAbsoluteHandler, {
      passive: true,
    } as AddEventListenerOptions);
    tiltAbsoluteAttached = true;
    tiltLog('Android: primary deviceorientationabsolute');
    return;
  }

  tiltHandler = (ev: Event) => updateTiltFromOrientation(ev as DeviceOrientationEvent, 'orientation');
  window.addEventListener('deviceorientation', tiltHandler, { passive: true } as AddEventListenerOptions);
  tiltRelativeAttached = true;
  tiltLog('attached deviceorientation');
}

export function isTiltSensorAvailable(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

export function hasTiltSignalSample(): boolean {
  return tiltHasSample;
}

/** Activa giro por inclinación (solo giro, no acelerar). En iOS 13+ pedir permiso antes. */
export function setTiltInputOn(on: boolean): boolean {
  if (on && !isTiltSensorAvailable()) {
    tiltInputOn = false;
    resetTiltCalibration();
    tiltLog('setTiltInputOn(true) but sensor API not available');
    return false;
  }
  tiltInputOn = on;
  if (on) {
    // Limpiar contadores diagnósticos para que la detección de "sin señal" arranque limpia.
    tiltLastEventAtMs = 0;
    tiltEventCount = 0;
    tiltLastGamma = null;
    tiltLastBeta = null;
    tiltLastAlpha = null;
    tiltLastSrc = null;
    ensureTiltListener();
    resetTiltCalibration();
    tiltLog('tilt steering ENABLED');
  } else {
    resetTiltCalibration();
    tiltLog('tilt steering DISABLED');
  }
  return true;
}

export function setTiltRecalibrationPending(): void {
  resetTiltCalibration();
}

/**
 * Solo `DeviceOrientationEvent.requestPermission()` — llamar desde el clic/tap del botón Giro (Safari iOS).
 */
export function requestOrientationPermissionFromUserGesture(): Promise<boolean> {
  if (!isTiltSensorAvailable()) {
    return Promise.resolve(false);
  }
  const Doe = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<PermissionState>;
  };
  if (typeof Doe.requestPermission === 'function') {
    return Doe.requestPermission().then((state) => {
      tiltLog('DeviceOrientationEvent.requestPermission ->', state);
      return state === 'granted';
    });
  }
  return Promise.resolve(true);
}

/**
 * iOS: orientación obligatoria; opcionalmente motion en segundo sitio (algunos builds lo esperan).
 * Android: sin prompt — sigue true tras orientationOk.
 */
export async function requestTiltPermissionIfNeeded(): Promise<boolean> {
  const orientationOk = await requestOrientationPermissionFromUserGesture();
  if (!orientationOk) return false;
  const Dme = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as unknown as
    | { requestPermission?: () => Promise<PermissionState> }
    | undefined;
  try {
    if (Dme && typeof Dme.requestPermission === 'function') {
      const m = await Dme.requestPermission();
      tiltLog('DeviceMotionEvent.requestPermission ->', m);
    }
    return true;
  } catch (err) {
    tiltLog('DeviceMotionEvent.requestPermission threw', err);
    return true;
  }
}

export type TiltDebugInfo = {
  available: boolean;
  on: boolean;
  /** true si hay cualquier listener de orientación activo. */
  attached: boolean;
  relativeAttached: boolean;
  absoluteAttached: boolean;
  hasSample: boolean;
  eventCount: number;
  msSinceLastEvent: number;
  lastSrc: 'orientation' | 'orientationabsolute' | null;
  lastAlpha: number | null;
  lastGamma: number | null;
  lastBeta: number | null;
  rawSteer: number;
  filteredSteer: number;
  /** Una línea lista para overlay / log cuando `?tiltdebug=1`. */
  sensorActiveLabel: string;
};

/** Snapshot de diagnóstico del subsistema tilt (úsalo en overlay/console). */
export function getTiltDebugInfo(): TiltDebugInfo {
  const ms = tiltLastEventAtMs > 0 ? performance.now() - tiltLastEventAtMs : -1;
  const fmt = (v: number | null) => (v == null ? 'null' : v.toFixed(2));
  const sensorActiveLabel = `Sensor Active: [${fmt(tiltLastAlpha)}, ${fmt(tiltLastBeta)}, ${fmt(tiltLastGamma)}]`;
  return {
    available: isTiltSensorAvailable(),
    on: tiltInputOn,
    attached: tiltRelativeAttached || tiltAbsoluteAttached,
    relativeAttached: tiltRelativeAttached,
    absoluteAttached: tiltAbsoluteAttached,
    hasSample: tiltHasSample,
    eventCount: tiltEventCount,
    msSinceLastEvent: ms,
    lastSrc: tiltLastSrc,
    lastAlpha: tiltLastAlpha,
    lastGamma: tiltLastGamma,
    lastBeta: tiltLastBeta,
    rawSteer: tiltSteerRaw,
    filteredSteer: tiltFiltered,
    sensorActiveLabel,
  };
}

export function disposeTiltListener(): void {
  if (tiltAbsoluteHandler && tiltAbsoluteAttached) {
    window.removeEventListener('deviceorientationabsolute', tiltAbsoluteHandler);
    tiltAbsoluteHandler = null;
    tiltAbsoluteAttached = false;
  }
  if (tiltHandler && tiltRelativeAttached) {
    window.removeEventListener('deviceorientation', tiltHandler);
    tiltHandler = null;
    tiltRelativeAttached = false;
  }
  setTiltInputOn(false);
}

/**
 * Raton sobre el lienzo: posición X → giro (puntero fino: PC). S/A/D se suman; acelerar sigue con W o clic.
 */
export function attachMouseAim(el: HTMLElement): () => void {
  const can = (): boolean =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const onMove = (e: MouseEvent) => {
    if (!can()) return;
    if (pointerDriving) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;

    const nx = (e.clientX - r.left) / r.width;
    let steer = Math.max(-1, Math.min(1, (nx - 0.5) * CANVAS_X_STEER_MULT * MOUSE_SENSITIVITY));
    if (Math.abs(steer) < MOUSE_DEADZONE) {
      steer = 0;
    }
    mouseRawSteer = steer;
    mouseSmoothedSteer += (mouseRawSteer - mouseSmoothedSteer) * MOUSE_SMOOTHING;
    mouseAimSteer = mouseSmoothedSteer;
    lastMouseMoveAt = performance.now();
    useMouseAim = true;
  };
  const onEnter = () => {
    if (!can()) return;
    if (pointerDriving) return;
    lastMouseMoveAt = performance.now();
  };
  const onLeave = () => {
    useMouseAim = false;
    mouseAimSteer = 0;
    mouseRawSteer = 0;
    mouseSmoothedSteer = 0;
    lastMouseMoveAt = 0;
  };

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);

  return () => {
    useMouseAim = false;
    mouseAimSteer = 0;
    mouseRawSteer = 0;
    mouseSmoothedSteer = 0;
    lastMouseMoveAt = 0;
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mouseleave', onLeave);
  };
}

/** Curva de respuesta: más mando cerca de recto, más sensibilidad al acercarse a -1/1. */
function applySteerNonlinearity(steerSum: number, exp: number): number {
  const a = Math.abs(steerSum);
  if (a < 1e-5) return 0;
  return Math.sign(steerSum) * Math.pow(a, exp);
}

export function pollInput(): InputState {
  const now = performance.now();
  if (useMouseAim && !pointerDriving && lastMouseMoveAt > 0 && now - lastMouseMoveAt > MOUSE_IDLE_RESET_MS) {
    mouseSmoothedSteer *= 0.78;
    if (Math.abs(mouseSmoothedSteer) < 0.01) {
      mouseSmoothedSteer = 0;
      mouseRawSteer = 0;
      mouseAimSteer = 0;
      useMouseAim = false;
    } else {
      mouseAimSteer = mouseSmoothedSteer;
    }
  }

  const kSteer = readSteerKeys();
  const kThrottle = readThrottleKeys();
  const kBrake = readBrakeKeys();

  const pSteer = padSteerValue();
  /** Mando L/R: prioridad sobre giro en lienzo (multitacto Android: gas en canvas + ←/→). */
  const padSteerActive = Math.abs(pSteer) > 1e-4;
  const ptrSteer = pointerDriving ? pointerSteer : 0;
  const aim = useMouseAim && !pointerDriving ? mouseAimSteer : 0;
  const ptr = pointerDriving && !padSteerActive ? ptrSteer : 0;
  const aimG = useMouseAim && !padSteerActive && !pointerDriving ? aim : 0;

  if (tiltInputOn) {
    const tr = Math.max(-1, Math.min(1, tiltSteerRaw));
    // Smoothing adaptativo: cerca del centro más estable, en giro fuerte más responsivo.
    const gain = TILT_SMOOTH + Math.abs(tr) * 0.1;
    tiltFiltered += (tr - tiltFiltered) * Math.max(0.06, Math.min(0.32, gain));
  } else {
    tiltFiltered = 0;
  }

  const tForBlend = tiltInputOn ? tiltFiltered : 0;

  let steerWeightedUnclamped = 0;
  if (tiltInputOn) {
    // Modo "Steering ON": volante principal = inclinación del dispositivo.
    // Mantiene aceleración en botones/teclas/click, pero el giro viene del tilt.
    steerWeightedUnclamped = tForBlend;
  } else if (padSteerActive) {
    steerWeightedUnclamped = pSteer * W_STEER_PAD;
  } else if (pointerDriving) {
    steerWeightedUnclamped = ptr * W_STEER_POINTER;
  } else if (Math.abs(kSteer) > 1e-4) {
    // Teclado manda; mouse aporta ajuste fino sin pelear el giro.
    steerWeightedUnclamped = kSteer * W_STEER_KEY + aimG * 0.22;
  } else {
    steerWeightedUnclamped = aimG * W_STEER_MOUSE;
  }
  const steerWeighted = Math.max(-1, Math.min(1, steerWeightedUnclamped));

  const pureMouseSteer =
    useMouseAim &&
    !pointerDriving &&
    !tiltInputOn &&
    !padSteerActive &&
    Math.abs(pSteer) < 0.001 &&
    Math.abs(kSteer) < 0.001;
  const onlyPadSteer =
    !tiltInputOn &&
    Math.abs(kSteer) < 0.001 &&
    Math.abs(pSteer) > 1e-4 &&
    (!pointerDriving || padSteerActive);
  const steerCurved = pureMouseSteer
    ? steerWeighted
    : onlyPadSteer
      ? Math.max(-1, Math.min(1, steerWeighted))
      : applySteerNonlinearity(steerWeighted, STEER_NONLINEAR_EXP);
  const steer = Math.max(-1, Math.min(1, steerCurved));

  const forwardPad = padForwardIds.size > 0;
  const brakePad = padBrakeIds.size > 0;
  const pThrottle = brakePad ? 0 : (forwardPad ? 1 : 0);
  const throttle = Math.max(kThrottle, pThrottle, pointerDriving ? 1 : 0);
  const brake = Math.max(kBrake, brakePad ? 1 : 0);

  return {
    throttle,
    brake,
    steer,
  };
}

function padSteerValue(): number {
  let s = 0;
  if (padLeftIds.size > 0) s -= 1;
  if (padRightIds.size > 0) s += 1;
  return Math.max(-1, Math.min(1, s));
}

const passiveFalse = { passive: false } as const;

let globalPointerPadGuardsInstalled = false;

/**
 * Refuerza suelta de contactos: `pointerup`/`pointercancel` en ventana, blur, pestaña oculta.
 */
function ensureGlobalPointerPadGuards(): void {
  if (globalPointerPadGuardsInstalled || typeof window === 'undefined') {
    return;
  }
  globalPointerPadGuardsInstalled = true;
  const dropId = (e: PointerEvent) => {
    padForwardIds.delete(e.pointerId);
    padLeftIds.delete(e.pointerId);
    padRightIds.delete(e.pointerId);
    padBrakeIds.delete(e.pointerId);
  };
  window.addEventListener('pointerup', dropId);
  window.addEventListener('pointercancel', dropId);
  const flushOnHide = () => {
    padForwardIds.clear();
    padLeftIds.clear();
    padRightIds.clear();
    padBrakeIds.clear();
    clearPointerDriverState();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushOnHide();
    }
  });
  window.addEventListener('blur', flushOnHide);
}

/**
 * Mando táctil: izquierda, derecha, adelante, freno. Un `pointerId` por contacto, multitacto.
 * `preventDefault` requiere listener no pasivo. `stopPropagation` evita colisión con lógica del padre.
 */
export function attachTouchPad(els: {
  forward: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  brake: HTMLElement;
}): () => void {
  ensureGlobalPointerPadGuards();

  const captureAndAdd = (target: HTMLElement, set: Set<number>, e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    set.add(e.pointerId);
  };

  const releaseF = (e: PointerEvent) => {
    padForwardIds.delete(e.pointerId);
    try {
      els.forward.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const releaseL = (e: PointerEvent) => {
    padLeftIds.delete(e.pointerId);
    try {
      els.left.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const releaseR = (e: PointerEvent) => {
    padRightIds.delete(e.pointerId);
    try {
      els.right.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const releaseB = (e: PointerEvent) => {
    padBrakeIds.delete(e.pointerId);
    try {
      els.brake.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const loseF = (e: PointerEvent) => {
    padForwardIds.delete(e.pointerId);
  };
  const loseL = (e: PointerEvent) => {
    padLeftIds.delete(e.pointerId);
  };
  const loseR = (e: PointerEvent) => {
    padRightIds.delete(e.pointerId);
  };
  const loseB = (e: PointerEvent) => {
    padBrakeIds.delete(e.pointerId);
  };

  const downF = (e: PointerEvent) => captureAndAdd(els.forward, padForwardIds, e);
  const downL = (e: PointerEvent) => captureAndAdd(els.left, padLeftIds, e);
  const downR = (e: PointerEvent) => captureAndAdd(els.right, padRightIds, e);
  const downB = (e: PointerEvent) => captureAndAdd(els.brake, padBrakeIds, e);

  els.forward.addEventListener('pointerdown', downF, passiveFalse);
  els.forward.addEventListener('pointerup', releaseF);
  els.forward.addEventListener('pointercancel', releaseF);
  els.forward.addEventListener('lostpointercapture', loseF);
  els.left.addEventListener('pointerdown', downL, passiveFalse);
  els.left.addEventListener('pointerup', releaseL);
  els.left.addEventListener('pointercancel', releaseL);
  els.left.addEventListener('lostpointercapture', loseL);
  els.right.addEventListener('pointerdown', downR, passiveFalse);
  els.right.addEventListener('pointerup', releaseR);
  els.right.addEventListener('pointercancel', releaseR);
  els.right.addEventListener('lostpointercapture', loseR);
  els.brake.addEventListener('pointerdown', downB, passiveFalse);
  els.brake.addEventListener('pointerup', releaseB);
  els.brake.addEventListener('pointercancel', releaseB);
  els.brake.addEventListener('lostpointercapture', loseB);

  return () => {
    padForwardIds.clear();
    padLeftIds.clear();
    padRightIds.clear();
    padBrakeIds.clear();
    els.forward.removeEventListener('pointerdown', downF);
    els.forward.removeEventListener('pointerup', releaseF);
    els.forward.removeEventListener('pointercancel', releaseF);
    els.forward.removeEventListener('lostpointercapture', loseF);
    els.left.removeEventListener('pointerdown', downL);
    els.left.removeEventListener('pointerup', releaseL);
    els.left.removeEventListener('pointercancel', releaseL);
    els.left.removeEventListener('lostpointercapture', loseL);
    els.right.removeEventListener('pointerdown', downR);
    els.right.removeEventListener('pointerup', releaseR);
    els.right.removeEventListener('pointercancel', releaseR);
    els.right.removeEventListener('lostpointercapture', loseR);
    els.brake.removeEventListener('pointerdown', downB);
    els.brake.removeEventListener('pointerup', releaseB);
    els.brake.removeEventListener('pointercancel', releaseB);
    els.brake.removeEventListener('lostpointercapture', loseB);
  };
}
