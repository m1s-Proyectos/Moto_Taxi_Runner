export type InputState = {
  throttle: number;
  brake: number;
  steer: number;
};

// ─── Keyboard ────────────────────────────────────────────────────────────────
const keys = new Set<string>();

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
function isMovementKey(k: string): boolean {
  return ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k);
}
function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function attachKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (isMovementKey(key) && !isEditableTarget(e.target)) { e.preventDefault(); keys.add(key); return; }
    if (e.repeat) return;
    keys.add(key);
  };
  const up = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (isMovementKey(key) && !isEditableTarget(e.target)) e.preventDefault();
    keys.delete(key);
  };
  window.addEventListener('keydown', down, { capture: true, passive: false });
  window.addEventListener('keyup', up, { capture: true, passive: false });
  return () => {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
  };
}

// ─── Mouse aim (PC – fine pointer) ───────────────────────────────────────────
const CANVAS_X_STEER_MULT = 1.6;
const MOUSE_SENSITIVITY = 1.15;
const MOUSE_SMOOTHING = 0.34;
const MOUSE_DEADZONE = 0.025;
const MOUSE_IDLE_RESET_MS = 140;

let mouseAimSteer = 0;
let useMouseAim = false;
let mouseRawSteer = 0;
let mouseSmoothedSteer = 0;
let lastMouseMoveAt = 0;

export function isMouseAimInputActive(): boolean { return useMouseAim; }

export function attachMouseAim(el: HTMLElement): () => void {
  const can = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onMove = (e: MouseEvent) => {
    if (!can() || pointerDriving) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    let steer = Math.max(-1, Math.min(1, (nx - 0.5) * CANVAS_X_STEER_MULT * MOUSE_SENSITIVITY));
    if (Math.abs(steer) < MOUSE_DEADZONE) steer = 0;
    mouseRawSteer = steer;
    mouseSmoothedSteer += (mouseRawSteer - mouseSmoothedSteer) * MOUSE_SMOOTHING;
    mouseAimSteer = mouseSmoothedSteer;
    lastMouseMoveAt = performance.now();
    useMouseAim = true;
  };
  const onLeave = () => { useMouseAim = false; mouseAimSteer = 0; mouseRawSteer = 0; mouseSmoothedSteer = 0; lastMouseMoveAt = 0; };

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);
  return () => {
    useMouseAim = false; mouseAimSteer = 0; mouseRawSteer = 0; mouseSmoothedSteer = 0; lastMouseMoveAt = 0;
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseleave', onLeave);
  };
}

// ─── Pointer-driver (PC click-hold = throttle, drag = steer) ─────────────────
let pointerDriving = false;
let pointerSteer = 0;
let pointerDrivePointerId: number | null = null;

const SELECTOR_BLOCK_POINTER_DRIVER =
  '.mtr-touch-pad,.mtr-menu-overlay,.mtr-finish-overlay,.splash-root';

function isPointerDriverBlockedByTopLayer(e: PointerEvent, canvas: HTMLElement): boolean {
  if (e.target !== canvas) return true;
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    const top = document.elementFromPoint(e.clientX, e.clientY);
    if (!top) return true;
    return (top as Element).closest(SELECTOR_BLOCK_POINTER_DRIVER) != null;
  }
  return (canvas as Element).closest(SELECTOR_BLOCK_POINTER_DRIVER) != null;
}

function clearPointerDriverState(): void {
  pointerDriving = false; pointerSteer = 0; pointerDrivePointerId = null;
}

export function attachPointerDriver(el: HTMLElement): () => void {
  const updateSteer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    pointerSteer = Math.max(-1, Math.min(1, (nx - 0.5) * CANVAS_X_STEER_MULT));
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.target !== el || isPointerDriverBlockedByTopLayer(e, el)) return;
    pointerDriving = true; useMouseAim = false; mouseRawSteer = 0; mouseSmoothedSteer = 0;
    pointerDrivePointerId = e.pointerId;
    updateSteer(e);
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerDriving || e.pointerId !== pointerDrivePointerId) return;
    updateSteer(e);
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerDrivePointerId) return;
    clearPointerDriverState();
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
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

// ─── Throttle / Brake touch buttons (left side) ──────────────────────────────
const padForwardIds = new Set<number>();
const padBrakeIds = new Set<number>();

let globalPointerPadGuardsInstalled = false;
function ensureGlobalPointerPadGuards(): void {
  if (globalPointerPadGuardsInstalled || typeof window === 'undefined') return;
  globalPointerPadGuardsInstalled = true;
  const dropId = (e: PointerEvent) => { padForwardIds.delete(e.pointerId); padBrakeIds.delete(e.pointerId); };
  window.addEventListener('pointerup', dropId);
  window.addEventListener('pointercancel', dropId);
  const flushOnHide = () => {
    padForwardIds.clear(); padBrakeIds.clear(); clearPointerDriverState(); dragSteerPointerId = null; dragSteerRaw = 0;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushOnHide(); });
  window.addEventListener('blur', flushOnHide);
}

const passiveFalse = { passive: false } as const;

/**
 * Connects throttle and brake touch buttons (left column on mobile).
 * Keyboard (W/S/arrows) continues to work on PC independently.
 */
export function attachThrottleBrake(els: {
  forward: HTMLElement;
  brake: HTMLElement;
}): () => void {
  ensureGlobalPointerPadGuards();

  const capture = (target: HTMLElement, set: Set<number>, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    set.add(e.pointerId);
  };
  const releaseF = (e: PointerEvent) => {
    padForwardIds.delete(e.pointerId);
    try { els.forward.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const releaseB = (e: PointerEvent) => {
    padBrakeIds.delete(e.pointerId);
    try { els.brake.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const downF = (e: PointerEvent) => capture(els.forward, padForwardIds, e);
  const downB = (e: PointerEvent) => capture(els.brake, padBrakeIds, e);

  els.forward.addEventListener('pointerdown', downF, passiveFalse);
  els.forward.addEventListener('pointerup', releaseF);
  els.forward.addEventListener('pointercancel', releaseF);
  els.forward.addEventListener('lostpointercapture', releaseF);
  els.brake.addEventListener('pointerdown', downB, passiveFalse);
  els.brake.addEventListener('pointerup', releaseB);
  els.brake.addEventListener('pointercancel', releaseB);
  els.brake.addEventListener('lostpointercapture', releaseB);

  return () => {
    padForwardIds.clear(); padBrakeIds.clear();
    els.forward.removeEventListener('pointerdown', downF);
    els.forward.removeEventListener('pointerup', releaseF);
    els.forward.removeEventListener('pointercancel', releaseF);
    els.forward.removeEventListener('lostpointercapture', releaseF);
    els.brake.removeEventListener('pointerdown', downB);
    els.brake.removeEventListener('pointerup', releaseB);
    els.brake.removeEventListener('pointercancel', releaseB);
    els.brake.removeEventListener('lostpointercapture', releaseB);
  };
}

// ─── Drag-to-Steer zone (right side of screen on mobile) ────────────────────
/**
 * How many pixels of horizontal drag = full steer deflection (±1).
 * Lower = more sensitive. 90 px feels responsive without being twitchy.
 */
const DRAG_FULL_STEER_PX = 90;
const DRAG_DEADZONE_PX = 6;

let dragSteerRaw = 0;
let dragSteerPointerId: number | null = null;
let dragStartX = 0;

/**
 * Attaches a touch-drag steering zone to the given element (right side overlay).
 * - Horizontal finger movement → steer -1..1 (relative to touch-down point).
 * - Lifting the finger resets steer to 0 (auto-center).
 * - Safe for multi-touch: only the first contact steers.
 */
export function attachDragSteer(el: HTMLElement): () => void {
  ensureGlobalPointerPadGuards();

  const onDown = (e: PointerEvent) => {
    if (dragSteerPointerId !== null) return; // already tracking one finger
    e.preventDefault();
    e.stopPropagation();
    dragSteerPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragSteerRaw = 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== dragSteerPointerId) return;
    const delta = e.clientX - dragStartX;
    const abs = Math.abs(delta);
    if (abs < DRAG_DEADZONE_PX) {
      dragSteerRaw = 0;
      return;
    }
    // Map delta → -1..1
    const effective = (abs - DRAG_DEADZONE_PX) * Math.sign(delta);
    dragSteerRaw = Math.max(-1, Math.min(1, effective / DRAG_FULL_STEER_PX));
  };

  const onEnd = (e: PointerEvent) => {
    if (e.pointerId !== dragSteerPointerId) return;
    dragSteerPointerId = null;
    dragSteerRaw = 0; // auto-center on lift
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  el.addEventListener('pointerdown', onDown, passiveFalse);
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
  el.addEventListener('lostpointercapture', onEnd);

  return () => {
    dragSteerRaw = 0;
    dragSteerPointerId = null;
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onEnd);
    el.removeEventListener('pointercancel', onEnd);
    el.removeEventListener('lostpointercapture', onEnd);
  };
}

// ─── pollInput ───────────────────────────────────────────────────────────────
const STEER_NONLINEAR_EXP = 1.02;
const W_STEER_KEY = 1.0;
const W_STEER_POINTER = 1.0;
const W_STEER_MOUSE = 1.0;
const W_STEER_DRAG = 1.0;

function applySteerNonlinearity(v: number, exp: number): number {
  const a = Math.abs(v);
  if (a < 1e-5) return 0;
  return Math.sign(v) * Math.pow(a, exp);
}

export function pollInput(): InputState {
  const now = performance.now();

  // Mouse-aim idle decay
  if (useMouseAim && !pointerDriving && lastMouseMoveAt > 0 && now - lastMouseMoveAt > MOUSE_IDLE_RESET_MS) {
    mouseSmoothedSteer *= 0.78;
    if (Math.abs(mouseSmoothedSteer) < 0.01) {
      mouseSmoothedSteer = 0; mouseRawSteer = 0; mouseAimSteer = 0; useMouseAim = false;
    } else {
      mouseAimSteer = mouseSmoothedSteer;
    }
  }

  const kSteer = readSteerKeys();
  const kThrottle = readThrottleKeys();
  const kBrake = readBrakeKeys();

  // Steer priority: keyboard > drag-touch > pointer-driver (canvas click) > mouse-aim
  let steerRaw = 0;
  if (Math.abs(kSteer) > 1e-4) {
    steerRaw = kSteer * W_STEER_KEY;
  } else if (dragSteerPointerId !== null || Math.abs(dragSteerRaw) > 1e-4) {
    steerRaw = dragSteerRaw * W_STEER_DRAG;
  } else if (pointerDriving) {
    steerRaw = pointerSteer * W_STEER_POINTER;
  } else if (useMouseAim) {
    steerRaw = mouseAimSteer * W_STEER_MOUSE;
  }

  const steerClamped = Math.max(-1, Math.min(1, steerRaw));
  const steer = Math.max(-1, Math.min(1, applySteerNonlinearity(steerClamped, STEER_NONLINEAR_EXP)));

  const pThrottle = padForwardIds.size > 0 ? 1 : 0;
  const pBrake = padBrakeIds.size > 0 ? 1 : 0;

  const throttle = Math.max(kThrottle, pThrottle, pointerDriving ? 1 : 0);
  const brake = Math.max(kBrake, pBrake);

  return { throttle, brake, steer };
}

// ─── Stubs kept for API compatibility (tilt fully removed) ───────────────────
export function isTiltSensorAvailable(): boolean { return false; }
export function hasTiltSignalSample(): boolean { return false; }
export function setTiltInputOn(_on: boolean): boolean { return false; }
export function setTiltRecalibrationPending(): void { /* no-op */ }
export function disposeTiltListener(): void { /* no-op */ }
export function getTiltDebugInfo() {
  return {
    available: false, on: false, attached: false,
    relativeAttached: false, absoluteAttached: false,
    hasSample: false, eventCount: 0, msSinceLastEvent: -1,
    lastSrc: null as null, lastAlpha: null, lastGamma: null, lastBeta: null,
    rawSteer: 0, filteredSteer: 0, sensorActiveLabel: 'Tilt disabled',
  };
}
export type TiltDebugInfo = ReturnType<typeof getTiltDebugInfo>;

// ─── Legacy touchpad export (for external references) ────────────────────────
/**
 * @deprecated Use attachThrottleBrake + attachDragSteer instead.
 * Kept to avoid breaking callers that pass {forward, left, right, brake}.
 */
export function attachTouchPad(els: {
  forward: HTMLElement;
  brake: HTMLElement;
  left?: HTMLElement;
  right?: HTMLElement;
}): () => void {
  return attachThrottleBrake({ forward: els.forward, brake: els.brake });
}
