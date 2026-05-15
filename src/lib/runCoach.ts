import { CHECKPOINTS, PLAYER_RADIUS } from '../track/config';

const COACH_SESSIONS_KEY = 'mtr_coach_sessions_v1';

function getCoachSessionCount(): number {
  try {
    const v = parseInt(localStorage.getItem(COACH_SESSIONS_KEY) ?? '0', 10);
    return Number.isFinite(v) ? Math.min(99, Math.max(0, v)) : 0;
  } catch {
    return 99;
  }
}

/** Tras varias sesiones se oculta la tira de pistas para no molestar a jugadores expertos. */
export function shouldShowCoachStrip(): boolean {
  return getCoachSessionCount() < 7;
}

export function bumpCoachSessionCount(): void {
  try {
    localStorage.setItem(COACH_SESSIONS_KEY, String(getCoachSessionCount() + 1));
  } catch {
    /* ignore */
  }
}


const TUTORIAL_KEY = 'mtr_run_tutorial_seen_v1';

export function hasSeenRunTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

export function markRunTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
}

export type CoachPhase = 'ready' | 'boarding' | 'exchange' | 'racing' | 'done' | 'menu';

/**
 * Pista corta contextual (español) para nuevos jugadores; `null` = ocultar.
 */
export function getCoachHintLine(opts: {
  phase: CoachPhase;
  nextCheckpointIndex: number;
  bikeX: number;
  bikeZ: number;
}): string | null {
  const { phase, nextCheckpointIndex, bikeX, bikeZ } = opts;
  if (phase === 'menu' || phase === 'done') return null;

  if (phase === 'ready') {
    return 'Acelerá (W o botón ▲) para arrancar y subir al pasajero.';
  }
  if (phase === 'boarding') {
    return 'Listo: al bajar el contador, soltá un momento el gas y acelerá de nuevo para salir con control.';
  }
  if (phase === 'exchange') {
    return 'Parada: dejá que termine la animación; después seguí la ruta al siguiente círculo.';
  }
  if (phase !== 'racing') return null;

  if (nextCheckpointIndex < 0 || nextCheckpointIndex >= CHECKPOINTS.length) return null;
  const cp = CHECKPOINTS[nextCheckpointIndex]!;
  const dx = bikeX - cp.center.x;
  const dz = bikeZ - cp.center.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const enter = cp.radius + PLAYER_RADIUS * 1.05;
  if (dist < enter * 1.35) {
    return '¡Frená un poco! Entrá al círculo brillante para completar la parada.';
  }
  if (dist < 95) {
    return 'Seguí la flecha dorada y el minimapa hacia la próxima parada.';
  }
  return 'Monedas en el camino y turbos (icono cian) te dan ventaja en la carrera.';
}
