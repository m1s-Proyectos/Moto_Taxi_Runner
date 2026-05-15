/** Audio + vibración ligeros (sin archivos externos). */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function unlockAudio(): void {
  const c = ctx();
  if (c.state === 'suspended') {
    void c.resume();
  }
}

function tone(freq: number, when: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
  const c = ctx();
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function playCheckpointChime(): void {
  unlockAudio();
  tone(523.25, 0, 0.1, 0.075, 'triangle');
  tone(659.25, 0.06, 0.11, 0.068, 'triangle');
  tone(783.99, 0.13, 0.14, 0.055, 'sine');
}

export function playFinishFanfare(): void {
  unlockAudio();
  tone(392, 0, 0.12, 0.08);
  tone(494, 0.1, 0.12, 0.07);
  tone(659, 0.22, 0.2, 0.09);
}

/** Multijugador: victoria (arpegio ascendente, brillo arcade). */
export function playMultiplayerVictory(): void {
  unlockAudio();
  const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66];
  freqs.forEach((f, i) => tone(f, i * 0.07, 0.14, 0.065, 'triangle'));
  tone(1318.51, 0.38, 0.22, 0.07, 'sine');
}

/** Multijugador: derrota (descenso suave). */
export function playMultiplayerDefeat(): void {
  unlockAudio();
  tone(392, 0, 0.2, 0.055);
  tone(349.23, 0.12, 0.22, 0.05);
  tone(293.66, 0.26, 0.28, 0.045);
  tone(246.94, 0.42, 0.35, 0.04);
}

/** Sonido corto al recoger moneda (sin archivo externo). */
export function playCoinCollect(): void {
  unlockAudio();
  tone(990, 0, 0.045, 0.06, 'triangle');
  tone(1318, 0.035, 0.07, 0.052, 'sine');
  tone(1760, 0.08, 0.06, 0.038, 'sine');
}

export function playBump(): void {
  unlockAudio();
  const c = ctx();
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.08);
  o.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(0.04, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.start(t0);
  o.stop(t0 + 0.12);
}

export function hapticCheckpoint(): void {
  try {
    navigator.vibrate?.(22);
  } catch {
    /* ignore */
  }
}

export function hapticFinish(): void {
  try {
    navigator.vibrate?.([35, 55, 35]);
  } catch {
    /* ignore */
  }
}

export function hapticBump(): void {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* ignore */
  }
}
