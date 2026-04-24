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

/** Large phones/phablets that should be treated as mobile */
const UA_LARGE_PHONE_LIKE = /SM-G[0-9]{3}|SM-A[0-9]{3}|Pixel [2-9]|OnePlus [0-9]|iPhone [1-9][0-9]* Pro/i;

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
  if (UA_LARGE_PHONE_LIKE.test(ua)) {
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
    const screenWidth = window.screen.width || window.innerWidth;
    const screenHeight = window.screen.height || window.innerHeight;
    const isLargeScreen = Math.max(screenWidth, screenHeight) >= 1200;
    
    if (matchMedia('(min-width: 1200px) and (pointer: fine)').matches && !isLargeScreen) {
      return false;
    }
    if (t >= 2 && !matchMedia('(pointer: fine) and (min-width: 1024px)').matches) {
      return true;
    }
  }
  return false;
}

/**
 * Viewport (visualViewport) con ancho menor que alto: `tall`. Alinea mando L/R; más fiable que solo `orientation` en algunos WebViews.
 */
function applyLayoutAspect(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.dataset.mtrAspect = w < h ? 'tall' : 'wide';
}

/**
 * Sincroniza `document.documentElement.dataset.mtrUi` en `touch` o `desktop` (CSS y layout).
 * También `data-mtr-aspect` (`tall` | `wide`) para mando y HUD táctil.
 * Ejecutar al arrancar la app; opcionalmente al cambiar de pantalla o reconectar.
 */
export function initDeviceInputProfile(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const apply = (): void => {
    document.documentElement.dataset.mtrUi = getUseMobileGameUi() ? 'touch' : 'desktop';
  };
  const applyAll = (): void => {
    applyLayoutAspect();
    apply();
  };
  applyAll();
  window.addEventListener('resize', applyAll);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(applyAll, 80);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyAll);
  }
}
