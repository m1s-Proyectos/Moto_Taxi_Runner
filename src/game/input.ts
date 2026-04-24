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
let tiltRefG: number | null = null;
let tiltRefB: number | null = null;
let tiltCalAccG = 0;
let tiltCalAccB = 0;
let tiltCalCountG = 0;
let tiltCalCountB = 0;
let tiltCalTicks = 0;
let tiltHandler: ((e: DeviceOrientationEvent) => void) | null = null;
let tiltHandlerAttached = false;
let orientationSteer = 0;
const TILT_CAL_MIN = 3;
const TILT_CAL_MAX_WAIT = 18;
const TILT_SENSE_P = 0.05;
const TILT_SENSE_L_G = 0.052;
const TILT_SENSE_L_B = 0.045;
const TILT_DEADZONE = 0.04;
const TILT_SMOOTH = 0.12;

const W_STEER_KEY = 0.85;
const W_STEER_PAD = 1.0;
const W_STEER_POINTER = 0.8;
const W_STEER_MOUSE = 0.95;
const W_STEER_TILT = 0.6;
const W_STEER_TILT_WITH_POINTER = 0.25;
/** Curva suave; más cercana a 1 = giro más directo (mejor con ratón en PC). */
const STEER_NONLINEAR_EXP = 1.05;
/** (nx-0.5) * escala → -1..1. */
const CANVAS_X_STEER_MULT = 3.45;

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

export function attachKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    keys.add(e.key.toLowerCase());
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
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

function updateTiltFromOrientation(e: DeviceOrientationEvent): void {
  if (!tiltInputOn) {
    tiltSteerRaw = 0;
    return;
  }
  const b = e.beta;
  const g = e.gamma;
  if (b == null && g == null) return;

  if (tiltRefG === null) {
    tryFinishTiltCalibration(b, g);
    if (tiltRefG === null) {
      return;
    }
  }

  const rG = tiltRefG ?? 0;
  const rB = tiltRefB ?? 90;
  orientationSteer = relativeSteerFromTilt(b, g, rG, rB);
  tiltSteerRaw = Math.max(-1, Math.min(1, orientationSteer));
}

function ensureTiltListener(): void {
  if (tiltHandlerAttached) return;
  tiltHandler = (e) => updateTiltFromOrientation(e);
  window.addEventListener('deviceorientation', tiltHandler, { passive: true } as AddEventListenerOptions);
  tiltHandlerAttached = true;
}

/** Activa giro por inclinación (solo giro, no acelerar). En iOS 13+ pedir permiso antes. */
export function setTiltInputOn(on: boolean): void {
  tiltInputOn = on;
  if (on) {
    ensureTiltListener();
    resetTiltCalibration();
  } else {
    resetTiltCalibration();
  }
}

export function setTiltRecalibrationPending(): void {
  resetTiltCalibration();
}

/** iOS 13+ Safari: solo hace falta el permiso de orientación para giro. */
export async function requestTiltPermissionIfNeeded(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  if (typeof D.requestPermission === 'function') {
    const o = await D.requestPermission();
    if (o !== 'granted') return false;
  }
  return true;
}

export function disposeTiltListener(): void {
  if (tiltHandler && tiltHandlerAttached) {
    window.removeEventListener('deviceorientation', tiltHandler);
  }
  tiltHandler = null;
  tiltHandlerAttached = false;
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
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    mouseAimSteer = Math.max(-1, Math.min(1, (nx - 0.5) * CANVAS_X_STEER_MULT));
    useMouseAim = true;
  };
  const onEnter = () => {
    if (can()) useMouseAim = true;
  };
  const onLeave = () => {
    useMouseAim = false;
    mouseAimSteer = 0;
  };

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);

  return () => {
    useMouseAim = false;
    mouseAimSteer = 0;
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
  const kSteer = readSteerKeys();
  const kThrottle = readThrottleKeys();
  const kBrake = readBrakeKeys();

  const pSteer = padSteerValue();
  /** Mando L/R: prioridad sobre giro en lienzo (multitacto Android: gas en canvas + ←/→). */
  const padSteerActive = Math.abs(pSteer) > 1e-4;
  const ptrSteer = pointerDriving ? pointerSteer : 0;
  const aim = useMouseAim ? mouseAimSteer : 0;
  const ptr = pointerDriving && !padSteerActive ? ptrSteer : 0;
  const aimG = useMouseAim && !padSteerActive ? aim : 0;

  if (tiltInputOn) {
    let tr = tiltSteerRaw;
    if (Math.abs(tr) < TILT_DEADZONE) tr = 0;
    tiltFiltered += (tr - tiltFiltered) * TILT_SMOOTH;
  } else {
    tiltFiltered = 0;
  }

  const tiltWeight = pointerDriving && !padSteerActive ? W_STEER_TILT_WITH_POINTER : W_STEER_TILT;
  const tForBlend = tiltInputOn && !padSteerActive ? tiltFiltered : 0;

  const steerWeightedUnclamped =
    kSteer * W_STEER_KEY +
    pSteer * W_STEER_PAD +
    ptr * W_STEER_POINTER +
    aimG * W_STEER_MOUSE +
    tForBlend * tiltWeight;
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
