import './style.css';
import { MotoGame } from './game/MotoGame';
import { mountSplashScreen } from './ui/splashScreen';

function getAppHost(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) {
    throw new Error('Falta el contenedor #app');
  }
  return el;
}

const appHost = getAppHost();

let activeGame: MotoGame | null = null;

function showSplash(): void {
  mountSplashScreen(appHost, startGame);
}

function startGame(): void {
  try {
    activeGame?.dispose();
    activeGame = null;

    const game = new MotoGame(appHost, {
      onBackToHome: () => {
        activeGame?.dispose();
        activeGame = null;
        showSplash();
      },
    });
    activeGame = game;
    game.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appHost.innerHTML = `<pre style="margin:16px;padding:12px;border:1px solid #f66;border-radius:8px;background:#1a1010;color:#fec;white-space:pre-wrap;font:14px/1.4 system-ui,sans-serif">No se pudo iniciar el juego.\n\n${message}\n\nSi usas WebGL bloqueado o modo muy restrictivo, prueba otro navegador o revisa la consola (F12).</pre>`;
    console.error(err);
  }
}

showSplash();
