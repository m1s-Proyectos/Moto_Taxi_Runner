import { Howl, Howler } from 'howler';

export type AudioRacePhase = 'ready' | 'boarding' | 'exchange' | 'racing' | 'done';

/**
 * Bucles con Howler: motor (volumen + rate según velocidad) y ambiente de carretera.
 * Archivos en /public/sounds/ — sirven estáticos con el juego (sin backend propio).
 */
export class GameLoopAudio {
  private engine: Howl | null = null;
  private ambient: Howl | null = null;
  private loopsRunning = false;

  ensureLoaded(): void {
    if (this.engine) return;
    this.engine = new Howl({
      src: ['/sounds/engine.mp3'],
      loop: true,
      volume: 0,
      preload: true,
    });
    this.ambient = new Howl({
      src: ['/sounds/ambient.mp3'],
      loop: true,
      volume: 0,
      preload: true,
    });
  }

  /** Desbloquea AudioContext de Howler (p. ej. tras gesto del usuario). */
  unlock(): void {
    const c = Howler.ctx;
    if (c?.state === 'suspended') {
      void c.resume();
    }
  }

  startLoops(): void {
    this.ensureLoaded();
    this.unlock();
    if (!this.engine || !this.ambient) return;
    if (!this.ambient.playing()) void this.ambient.play();
    if (!this.engine.playing()) void this.engine.play();
    this.loopsRunning = true;
  }

  /**
   * @param phase — si no estás en carrera, baja el motor; en meta, atenúa todo.
   */
  sync(
    sessionActive: boolean,
    phase: AudioRacePhase,
    speed: number,
    throttle: number,
    maxSpeed: number,
  ): void {
    if (!this.loopsRunning || !this.engine || !this.ambient) return;

    if (!sessionActive) {
      this.engine.volume(0);
      this.ambient.volume(0);
      return;
    }

    if (phase === 'done') {
      this.ambient.volume(0.06);
      this.engine.volume(0.05);
      this.engine.rate(0.85);
      return;
    }

    if (phase === 'boarding' || phase === 'exchange') {
      this.ambient.volume(0.07);
      this.engine.volume(0.07);
      this.engine.rate(0.8);
      return;
    }

    const t = Math.min(1, Math.abs(speed) / maxSpeed);
    const th = Math.max(throttle, t * 0.62);

    this.ambient.volume(0.09 + 0.1 * t);

    const rate = 0.78 + 0.38 * t + 0.1 * th;
    this.engine.rate(Math.min(1.22, Math.max(0.7, rate)));
    const vol = 0.03 + 0.4 * t * (0.48 + 0.52 * th);
    this.engine.volume(Math.min(0.55, vol));
  }

  stop(): void {
    this.engine?.stop();
    this.ambient?.stop();
    this.loopsRunning = false;
  }

  dispose(): void {
    this.stop();
    this.engine?.unload();
    this.ambient?.unload();
    this.engine = null;
    this.ambient = null;
  }
}
