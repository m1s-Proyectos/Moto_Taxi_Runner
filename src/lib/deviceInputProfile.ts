/**
 * Clasifica si el juego debe usar el mando táctil (móvil/tablet) o teclado+ratón (escritorio).
 * No usar solo ancho de viewport: los móviles grandes en apaisado superan 768px y quedarían como «desktop».
 */
export function getUseMobileGameUi(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (isLikelyHandheldFromUserAgent()) {
    return true;
  }
  return isTouchPrimaryDevice();
}

const UA_PHONE_LIKE =
  /Mobi|Android|iPhone|iPod|IEMobile|wOSBrowser|webOS|BlackBerry|Opera Mini|OPiOS|CriOS|FxiOS|EdgiOS|Mobile\/|Phone|; SM-|SAMSUNG|Build\/P|Pixel|Nexus|BB10|PlayBook|Tablet|Silk|Kindle|UCBrowser|KTXN|Baidu|Miui|HeyTap|HMSCore|wv\)/i;

/** Nombres de modelo frecuentes (Android) cuando no entra “Mobile”/“Mobi” en el UA. */
const UA_TABLET_LIKE = /SM-T[0-9]|SHIELD Tablet|KFTT|Tab A|Nexus 7|Nexus 9/i;

function isLikelyHandheldFromUserAgent(): boolean {
  const ua = navigator.userAgent;
  if (UA_PHONE_LIKE.test(ua)) {
    return true;
  }
  if (/\biPad\b/i.test(ua)) {
    return true;
  }
  if (UA_TABLET_LIKE.test(ua)) {
    return true;
  }
  if (/(Macintosh|MacIntel)/.test(ua) && 'ontouchstart' in window && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/**
 * Táctil como entrada principal, sin exigir ancho: evita 7" y similares con viewport ancho.
 */
function isTouchPrimaryDevice(): boolean {
  const t = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  if (t <= 0) {
    return false;
  }
  if (matchMedia('(pointer: coarse)').matches) {
    return true;
  }
  if (matchMedia('(hover: none)').matches) {
    return true;
  }
  if ('ontouchstart' in window) {
    if (matchMedia('(min-width: 1200px) and (pointer: fine)').matches) {
      return false;
    }
    if (t >= 2 && !matchMedia('(pointer: fine) and (min-width: 1024px)').matches) {
      return true;
    }
  }
  return false;
}

/**
 * Sincroniza `document.documentElement.dataset.mtrUi` en `touch` o `desktop` (CSS y layout).
 * Ejecutar al arrancar la app; opcionalmente al cambiar de pantalla o reconectar.
 */
export function initDeviceInputProfile(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const apply = (): void => {
    document.documentElement.dataset.mtrUi = getUseMobileGameUi() ? 'touch' : 'desktop';
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(apply, 80);
  });
}
