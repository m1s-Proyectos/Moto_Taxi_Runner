/**
 * Vibe Jam 2026: portal hub + reenvío de parámetros (webring).
 * @see https://vibejam.cc — documentación en el anuncio de la jam
 */

const HUB = 'https://vibejam.cc/portal/2026';

const PASSTHROUGH = [
  'username',
  'color',
  'avatar_url',
  'team',
  'hp',
  'velocidad_x',
  'velocidad_y',
  'velocidad_z',
  'rotación_x',
  'rotación_y',
  'rotación_z',
] as const;

export function isVibeJamPortalArrival(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('portal') === 'true';
}

/** Juego de origen (webring) para el portal de vuelta. */
export function getVibeJamBackRefFromQuery(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('ref');
}

/** URL pública de este juego (sin ?query) para `ref=`. */
export function currentGameRefUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

/** Sigue a https://vibejam.cc/portal/2026 con parámetros y `ref` a este juego. */
export function buildVibeJamExitUrl(speedMps: number): string {
  const u = new URL(HUB);
  const cur = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  for (const k of PASSTHROUGH) {
    const v = cur.get(k);
    if (v !== null) u.searchParams.set(k, v);
  }
  const sp = Math.min(40, Math.max(0, Math.abs(speedMps)));
  u.searchParams.set('speed', String(sp > 0.05 ? sp : 1.2));
  u.searchParams.set('ref', currentGameRefUrl());
  if (!u.searchParams.get('color')) u.searchParams.set('color', 'amber');
  if (!u.searchParams.get('username')) u.searchParams.set('username', 'mototaxi');
  return u.toString();
}

/**
 * Vuelve al juego indicado en `ref`, reenviando los parámetros actuales (incl. `ref` a este título).
 */
export function buildVibeJamBackToRefUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('ref');
  if (!raw) return null;
  let u: URL;
  try {
    u = raw.includes('://') ? new URL(raw) : new URL(raw, window.location.origin);
  } catch {
    return null;
  }
  for (const [k, v] of new URLSearchParams(window.location.search)) {
    u.searchParams.set(k, v);
  }
  u.searchParams.set('ref', currentGameRefUrl());
  u.searchParams.set('portal', 'true');
  return u.toString();
}
