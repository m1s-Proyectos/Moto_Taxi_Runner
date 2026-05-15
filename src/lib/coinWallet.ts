/**
 * Cartera global de monedas (solo dispositivo, localStorage).
 * Cada cliente (práctica o multijugador) persiste lo que **él** recoge; no hay servidor de economía,
 * así que no hay desincronización entre procesos: dos jugadores en sala = dos carteras locales.
 */
const STORAGE_KEY = 'mtr_coin_wallet_v1';

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(9_999_999, Math.floor(n)));
}

/** Lee el saldo guardado (0 si no hay dato o error). */
export function getCoinWallet(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return clampInt(Number.isFinite(n) ? n : 0);
  } catch {
    return 0;
  }
}

/** Suma monedas, persiste y devuelve el nuevo total. */
export function addCoinsToWallet(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return getCoinWallet();
  const next = clampInt(getCoinWallet() + delta);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

/**
 * Resta monedas si hay saldo suficiente. Persiste y devuelve `true` si aplicó el cargo.
 */
export function trySpendCoins(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  const cur = getCoinWallet();
  const cost = clampInt(amount);
  if (cur < cost) return false;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampInt(cur - cost)));
  } catch {
    return false;
  }
  return true;
}
