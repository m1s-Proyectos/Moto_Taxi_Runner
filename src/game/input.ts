export type InputState = {
  throttle: number;
  brake: number;
  steer: number;
};

const keys = new Set<string>();

let pointerDriving = false;
let pointerSteer = 0;

/** Mando en pantalla: izq. / dcha. (giro) y adelante (acelerar); independiente por botón, multitacto. */
let padLeft = false;
let padRight = false;
let padForward = false;

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

/** Conducción con ratón o dedo: mantén pulsado sobre el juego = acelera; mueve izquierda/derecha = gira. */
export function attachPointerDriver(el: HTMLElement): () => void {
  const updateSteer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    pointerSteer = Math.max(-1, Math.min(1, (nx - 0.5) * 2.4));
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerDriving = true;
    updateSteer(e);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointerDriving) return;
    updateSteer(e);
  };

  const end = (e: PointerEvent) => {
    if (!pointerDriving) return;
    pointerDriving = false;
    pointerSteer = 0;
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
    pointerDriving = false;
    pointerSteer = 0;
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.removeEventListener('lostpointercapture', end);
    el.removeEventListener('contextmenu', onCtx);
  };
}

export function pollInput(): InputState {
  const kSteer = readSteerKeys();
  const kThrottle = readThrottleKeys();
  const kBrake = readBrakeKeys();

  const pSteer = padSteerValue();
  const pThrottle = padForward ? 1 : 0;
  const steerExtra = pointerDriving ? pointerSteer : 0;
  const steer = Math.max(-1, Math.min(1, kSteer + pSteer + steerExtra));
  const throttle = Math.max(kThrottle, pThrottle, pointerDriving ? 1 : 0);

  return {
    throttle,
    brake: kBrake,
    steer,
  };
}

function padSteerValue(): number {
  let s = 0;
  if (padLeft) s -= 1;
  if (padRight) s += 1;
  return Math.max(-1, Math.min(1, s));
}

/**
 * Tres botones: adelante (acelerar), izquierda, derecha. El giro aplica al eje de la moto
 * (yaw; la física ya usa `steer` respecto a la orientación hacia adelante).
 */
export function attachTouchPad(els: {
  forward: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
}): () => void {
  const downF = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.forward.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padForward = true;
  };
  const upF = (e: PointerEvent) => {
    padForward = false;
    try {
      els.forward.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const downL = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.left.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padLeft = true;
  };
  const upL = (e: PointerEvent) => {
    padLeft = false;
    try {
      els.left.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const downR = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.right.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padRight = true;
  };
  const upR = (e: PointerEvent) => {
    padRight = false;
    try {
      els.right.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const loseF = () => {
    padForward = false;
  };
  const loseL = () => {
    padLeft = false;
  };
  const loseR = () => {
    padRight = false;
  };

  els.forward.addEventListener('pointerdown', downF);
  els.forward.addEventListener('pointerup', upF);
  els.forward.addEventListener('pointercancel', upF);
  els.forward.addEventListener('lostpointercapture', loseF);
  els.left.addEventListener('pointerdown', downL);
  els.left.addEventListener('pointerup', upL);
  els.left.addEventListener('pointercancel', upL);
  els.left.addEventListener('lostpointercapture', loseL);
  els.right.addEventListener('pointerdown', downR);
  els.right.addEventListener('pointerup', upR);
  els.right.addEventListener('pointercancel', upR);
  els.right.addEventListener('lostpointercapture', loseR);

  return () => {
    padLeft = false;
    padRight = false;
    padForward = false;
    els.forward.removeEventListener('pointerdown', downF);
    els.forward.removeEventListener('pointerup', upF);
    els.forward.removeEventListener('pointercancel', upF);
    els.forward.removeEventListener('lostpointercapture', loseF);
    els.left.removeEventListener('pointerdown', downL);
    els.left.removeEventListener('pointerup', upL);
    els.left.removeEventListener('pointercancel', upL);
    els.left.removeEventListener('lostpointercapture', loseL);
    els.right.removeEventListener('pointerdown', downR);
    els.right.removeEventListener('pointerup', upR);
    els.right.removeEventListener('pointercancel', upR);
    els.right.removeEventListener('lostpointercapture', loseR);
  };
}
