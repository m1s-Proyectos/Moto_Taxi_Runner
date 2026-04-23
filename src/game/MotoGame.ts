import * as THREE from 'three';
import {
  CHECKPOINTS,
  CONTACT_TIME_PENALTY_MS,
  OBSTACLES,
  PEDESTRIAN_CROSSING_Z,
  PEDESTRIAN_ZONE_Z_MAX,
  PEDESTRIAN_ZONE_Z_MIN,
  PHYS,
  PLAYER_RADIUS,
  SPAWN,
  WORLD_FLOOR_Y,
} from '../track/config';
import {
  mountBikeStyle,
  readStoredBikeStyle,
  writeStoredBikeStyle,
  type BikeStyle,
} from './bikeModels';
import { GameLoopAudio } from './gameAudio';
import {
  hapticBump,
  hapticCheckpoint,
  hapticFinish,
  playBump,
  playCheckpointChime,
  playFinishFanfare,
  unlockAudio,
} from './feedback';
import { buildGameUi, type GameUiRefs, updateRouteSegment } from '../ui/buildGameUi';
import { drawMinimap } from '../ui/minimap';
import { circleIntersectsObstacle, resolveCircleObstacle } from './collision';
import { attachKeyboard, attachPointerDriver, pollInput } from './input';
import {
  addZebraCrossing,
  createCrossingPedestrians,
  updatePedestrianPositions,
  type PedestrianInstance,
} from './pedestrians';
import { createParkedCar } from './parkedCar';
import { addCityscape } from './worldDecor';
import { isSupabaseConfigured, saveRaceRunToSupabase } from '../lib/raceRuns';

type RacePhase = 'ready' | 'boarding' | 'exchange' | 'racing' | 'done';

function fmtTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = Math.floor((ms % 1000) / 10)
    .toString()
    .padStart(2, '0');
  return `${m}:${s.toString().padStart(2, '0')}.${frac}`;
}

function fmtTimeParts(ms: number): { main: string; frac: string } {
  const full = fmtTime(ms);
  const i = full.lastIndexOf('.');
  if (i === -1) return { main: full, frac: '.00' };
  return { main: full.slice(0, i), frac: `.${full.slice(i + 1)}` };
}

const ROUTE_LABELS: ['Pupy', 'Papá', 'Casa'] = ['Pupy', 'Papá', 'Casa'];

export type MotoGameOptions = {
  /** Cierra el juego y deja que la app vuelva al splash (p. ej. botón «Volver a inicio»). */
  onBackToHome?: () => void;
};

export class MotoGame {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();

  private readonly bike = new THREE.Group();
  private readonly checkpointMeshes: THREE.Group[] = [];
  private readonly camTarget = new THREE.Vector3();

  private readonly ui: GameUiRefs;

  private detachKeyboard: (() => void) | null = null;
  private detachPointer: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private raf = 0;

  private sessionStarted = false;
  private phase: RacePhase = 'ready';
  private nextCheckpointIndex = 0;
  /** Tiempo de carrera acumulado solo mientras `phase === 'racing'`. */
  private raceElapsedMs = 0;
  /** Acumulado al completar Pupy y Papá (splits / desempate, ver plan de trabajo). */
  private splitPupyMs: number | null = null;
  private splitPapaMs: number | null = null;
  private finishedRaceMs: number | null = null;
  private boardingUntilMs: number | null = null;
  private exchangeUntilMs: number | null = null;
  private exchangeMode: 'drop' | 'pick' | 'final_drop' | null = null;

  private speed = 0;

  private readonly sparks: Array<{ mesh: THREE.Mesh; age: number; vel: THREE.Vector3 }> = [];
  private lastBumpMs = 0;
  /** Evita múltiples penalizaciones por el mismo roce prolongado. */
  private wasTouchingVehicle = false;
  private wasTouchingPedInZone = false;

  private readonly pedestrians: PedestrianInstance[] = [];

  private readonly loopAudio = new GameLoopAudio();
  private bikeStyle: BikeStyle;

  constructor(container: HTMLElement, options?: MotoGameOptions) {
    this.container = container;

    const initialBike = readStoredBikeStyle();
    this.bikeStyle = initialBike;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(0x121018, 1);
    this.renderer.domElement.className =
      'absolute inset-0 z-[1] block touch-none select-none outline-none';
    this.renderer.domElement.setAttribute('tabindex', '-1');
    container.appendChild(this.renderer.domElement);

    this.ui = buildGameUi(container, {
      onStart: () => this.beginSession(),
      onModeChange: () => {},
      onCopyRoom: () => this.copyRoomPlaceholder(),
      onFinishAgain: () => {
        this.ui.finishOverlay.classList.add('hidden');
        this.resetRun();
      },
      onFinishClose: () => {
        this.ui.finishOverlay.classList.add('hidden');
      },
      initialBikeStyle: initialBike,
      onBikeStyle: (style) => this.applyBikeStyle(style),
      onBackToHome: options?.onBackToHome,
    });

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x121018, 62, 218);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 250);
    this.camera.position.set(0, 10, 14);

    const ambient = new THREE.AmbientLight(0xffe8d8, 0.42);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xc7d2fe, 0x3d2f28, 0.35);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e6, 0.82);
    sun.position.set(10, 18, 6);
    this.scene.add(sun);

    this.buildWorld();
    this.scene.add(this.bike);
    mountBikeStyle(this.bike, initialBike);

    this.resetRun();

    this.onResize();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => this.onResize());
  }

  start(): void {
    this.detachKeyboard?.();
    this.detachPointer?.();
    this.detachKeyboard = attachKeyboard();
    this.detachPointer = attachPointerDriver(this.renderer.domElement);
    this.renderer.domElement.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'r' && this.sessionStarted) this.resetRun();
    };
    window.addEventListener('keydown', onKey);
    const prevDetach = this.detachKeyboard;
    this.detachKeyboard = () => {
      prevDetach();
      window.removeEventListener('keydown', onKey);
    };

    this.clock.getDelta();
    this.raf = window.requestAnimationFrame(() => this.tick());
  }

  dispose(): void {
    window.cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onResize);
    this.detachPointer?.();
    this.detachPointer = null;
    this.detachKeyboard?.();
    this.loopAudio.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private beginSession(): void {
    unlockAudio();
    this.loopAudio.ensureLoaded();
    this.loopAudio.unlock();
    this.loopAudio.startLoops();
    this.sessionStarted = true;
    this.ui.menuOverlay.classList.add('hidden');
    this.ui.hudRoot.classList.add('mtr-hud-on');
    this.resetRun();
    this.renderer.domElement.focus({ preventScroll: true });
  }

  private applyBikeStyle(style: BikeStyle): void {
    this.bikeStyle = style;
    writeStoredBikeStyle(style);
    mountBikeStyle(this.bike, style);
  }

  private copyRoomPlaceholder(): void {
    const code = 'VJ26';
    void navigator.clipboard?.writeText(code).then(
      () => {
        this.ui.roomCodeText.textContent = code;
      },
      () => {},
    );
  }

  private onResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    let w = Math.round(rect.width);
    let h = Math.round(rect.height);
    if (w < 2 || h < 2) {
      w = Math.max(320, window.innerWidth || 640);
      h = Math.max(240, window.innerHeight || 480);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, true);
  };

  private buildWorld(): void {
    const roadCenterZ = -96;
    const roadLen = 300;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = WORLD_FLOOR_Y;
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(18, roadLen, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2f3548, roughness: 0.96, metalness: 0.02 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, roadCenterZ);
    this.scene.add(road);

    for (let z = 48; z > roadCenterZ - roadLen * 0.52; z -= 11) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 3.2),
        new THREE.MeshStandardMaterial({ color: 0xd7e2ff, roughness: 1, metalness: 0 }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.02, z);
      this.scene.add(stripe);
    }

    addCityscape(this.scene);

    addZebraCrossing(this.scene, PEDESTRIAN_CROSSING_Z);
    const peds = createCrossingPedestrians(PEDESTRIAN_CROSSING_Z, 7);
    this.pedestrians.length = 0;
    for (const p of peds) {
      this.pedestrians.push(p);
      this.scene.add(p.group);
    }

    OBSTACLES.forEach((o, i) => {
      this.scene.add(createParkedCar(o, i));
    });

    for (const cp of CHECKPOINTS) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(cp.radius - 0.35, cp.radius + 0.35, 40),
        new THREE.MeshBasicMaterial({
          color: cp.ringColor,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(cp.center).add(new THREE.Vector3(0, 0.03, 0));
      g.add(ring);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10),
        new THREE.MeshStandardMaterial({ color: cp.ringColor, roughness: 0.6, metalness: 0.1 }),
      );
      pole.position.copy(cp.center).add(new THREE.Vector3(cp.radius - 1.2, 1.1, 0));
      g.add(pole);

      this.scene.add(g);
      this.checkpointMeshes.push(g);
    }
  }

  private resetRun(): void {
    this.phase = 'ready';
    this.nextCheckpointIndex = 0;
    this.raceElapsedMs = 0;
    this.splitPupyMs = null;
    this.splitPapaMs = null;
    this.finishedRaceMs = null;
    this.boardingUntilMs = null;
    this.exchangeUntilMs = null;
    this.exchangeMode = null;
    this.speed = 0;
    this.lastBumpMs = 0;
    this.wasTouchingVehicle = false;
    this.wasTouchingPedInZone = false;

    this.clearSparks();

    this.bike.position.copy(SPAWN.position);
    this.bike.rotation.set(0, SPAWN.rotationY, 0);

    this.ui.finishOverlay.classList.add('hidden');
    this.ui.finishCloud.classList.add('hidden');
    this.ui.finishCloud.textContent = '';
    this.hidePassengerHud();

    this.syncHud();
    this.updateCheckpointVisuals();
  }

  private showPassengerHud(dir: 'up' | 'down', text: string): void {
    this.ui.passengerArrow.textContent = dir === 'up' ? '↑' : '↓';
    this.ui.passengerLabel.textContent = text;
    this.ui.passengerHud.classList.remove('hidden');
  }

  private hidePassengerHud(): void {
    this.ui.passengerHud.classList.add('hidden');
  }

  /** +10 s por contacto (un disparo al entrar en colisión, no cada frame). */
  private applyContactTimePenalty(): void {
    if (this.phase !== 'racing') return;
    this.raceElapsedMs += CONTACT_TIME_PENALTY_MS;
    const now = performance.now();
    if (now - this.lastBumpMs > 120) {
      this.lastBumpMs = now;
      playBump();
      hapticBump();
    }
  }

  private beginStopExchange(isLastCheckpoint: boolean): void {
    this.speed = 0;
    this.phase = 'exchange';
    const now = performance.now();
    if (isLastCheckpoint) {
      this.exchangeMode = 'final_drop';
      this.exchangeUntilMs = now + 1350;
      this.showPassengerHud('down', 'Bajando pasajero…');
    } else {
      this.exchangeMode = 'drop';
      this.exchangeUntilMs = now + 1200;
      this.showPassengerHud('down', 'Bajando pasajero…');
    }
  }

  private completeMidStop(): void {
    if (this.nextCheckpointIndex >= CHECKPOINTS.length) return;
    const at = this.nextCheckpointIndex;
    if (at === 0) this.splitPupyMs = this.raceElapsedMs;
    if (at === 1) this.splitPapaMs = this.raceElapsedMs;
    this.spawnSparkBurst(this.bike.position.clone(), false);
    playCheckpointChime();
    hapticCheckpoint();
    this.nextCheckpointIndex += 1;
    this.updateCheckpointVisuals();
    this.syncHud();
  }

  private completeFinalStop(): void {
    if (this.nextCheckpointIndex >= CHECKPOINTS.length) return;
    this.spawnSparkBurst(this.bike.position.clone(), true);
    playFinishFanfare();
    hapticFinish();
    this.nextCheckpointIndex += 1;
    this.updateCheckpointVisuals();
    this.finishedRaceMs = this.raceElapsedMs;
    this.phase = 'done';
    this.exchangeMode = null;
    this.exchangeUntilMs = null;
    this.hidePassengerHud();
    const total = this.finishedRaceMs ?? 0;
    this.ui.finishTime.textContent = `Tiempo: ${fmtTime(total)}`;
    this.ui.finishOverlay.classList.remove('hidden');
    this.syncHud();

    if (isSupabaseConfigured()) {
      this.ui.finishCloud.classList.remove('hidden');
      this.ui.finishCloud.className =
        'mt-2 min-h-[1.25rem] text-xs text-zinc-500';
      this.ui.finishCloud.textContent = 'Enviando resultado a Supabase…';
      void saveRaceRunToSupabase({
        timeMs: total,
        bikeStyle: this.bikeStyle,
        splitPupyMs: this.splitPupyMs,
        splitPapaMs: this.splitPapaMs,
        roomId: null,
      }).then((r) => {
        if (r.ok) {
          this.ui.finishCloud.className =
            'mt-2 min-h-[1.25rem] text-xs text-emerald-400/90';
          this.ui.finishCloud.textContent = 'Tiempo guardado en el servidor.';
          return;
        }
        if (r.reason === 'not_configured') {
          this.ui.finishCloud.classList.add('hidden');
          this.ui.finishCloud.textContent = '';
          return;
        }
        this.ui.finishCloud.className = 'mt-2 min-h-[1.25rem] text-xs text-amber-400/90';
        this.ui.finishCloud.textContent = `No se pudo guardar: ${r.message ?? 'error'}`;
      });
    } else {
      this.ui.finishCloud.classList.add('hidden');
      this.ui.finishCloud.textContent = '';
    }
  }

  private clearSparks(): void {
    for (const s of this.sparks) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.sparks.length = 0;
  }

  private spawnSparkBurst(pos: THREE.Vector3, big: boolean): void {
    const n = big ? 14 : 8;
    const s = big ? 0.11 : 0.07;
    const col = big ? 0xffe066 : 0xffaa44;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 }),
      );
      mesh.position.copy(pos).add(new THREE.Vector3(0, 0.45, 0));
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5.5,
        2.2 + Math.random() * 3.2,
        (Math.random() - 0.5) * 5.5,
      );
      this.scene.add(mesh);
      this.sparks.push({ mesh, age: 0, vel });
    }
  }

  private updateCheckpointVisuals(): void {
    for (let i = 0; i < this.checkpointMeshes.length; i++) {
      const group = this.checkpointMeshes[i]!;
      const ring = group.children[0] as THREE.Mesh;
      const mat = ring.material as THREE.MeshBasicMaterial;
      if (i < this.nextCheckpointIndex) {
        mat.opacity = 0.35;
        mat.color.setHex(0x9aa7bd);
      } else if (i === this.nextCheckpointIndex) {
        mat.opacity = 0.95;
        mat.color.setHex(CHECKPOINTS[i]!.ringColor);
      } else {
        mat.opacity = 0.55;
        mat.color.setHex(CHECKPOINTS[i]!.ringColor);
      }
    }
  }

  private syncRoutePill(): void {
    const midRace =
      this.phase === 'racing' || this.phase === 'boarding' || this.phase === 'exchange';
    for (let i = 0; i < 3; i++) {
      const state: 'done' | 'current' | 'pending' =
        this.phase === 'done'
          ? 'done'
          : midRace
            ? i < this.nextCheckpointIndex
              ? 'done'
              : i === this.nextCheckpointIndex
                ? 'current'
                : 'pending'
            : i === 0
              ? 'current'
              : 'pending';
      updateRouteSegment(this.ui.routeSeg[i]!, ROUTE_LABELS[i]!, i as 0 | 1 | 2, state);
    }
  }

  private syncHud(): void {
    this.syncRoutePill();

    const maxSpeed = PHYS.maxSpeed;
    const kph = Math.round(this.speed * 18);
    this.ui.speedValue.textContent = `${kph}`;
    const pct = Math.min(100, Math.max(0, Math.round((Math.abs(this.speed) / maxSpeed) * 100)));
    this.ui.speedBar.style.width = `${pct}%`;

    if (!this.sessionStarted) {
      const z = fmtTimeParts(0);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Menú';
      this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-zinc-500';
      return;
    }

    if (this.phase === 'ready') {
      const z = fmtTimeParts(0);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Listo';
      this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]';
      return;
    }

    if (this.phase === 'boarding') {
      const z = fmtTimeParts(0);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Subiendo';
      this.ui.timerDot.className = 'h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400';
      return;
    }

    if (this.phase === 'exchange') {
      const z = fmtTimeParts(this.raceElapsedMs);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Parada';
      this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-500';
      return;
    }

    if (this.phase === 'racing') {
      const z = fmtTimeParts(this.raceElapsedMs);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'En Curso';
      this.ui.timerDot.className = 'h-1.5 w-1.5 animate-pulse rounded-full bg-red-500';
      return;
    }

    if (this.phase === 'done' && this.finishedRaceMs !== null) {
      const z = fmtTimeParts(this.finishedRaceMs);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Meta';
      this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.45)]';
    }
  }

  private tick(): void {
    this.raf = window.requestAnimationFrame(() => this.tick());

    const dt = Math.min(0.05, this.clock.getDelta());
    const raw = pollInput();
    const input = this.sessionStarted
      ? raw
      : { throttle: 0, brake: 0, steer: 0 };

    const maxSpeed = PHYS.maxSpeed;
    const accel = PHYS.accel;
    const brake = PHYS.brake;
    const drag = PHYS.drag;

    updatePedestrianPositions(this.pedestrians, performance.now() * 0.001, 6.35);

    const nowTick = performance.now();

    if (this.phase === 'boarding') {
      this.speed = 0;
      if (this.boardingUntilMs !== null && nowTick >= this.boardingUntilMs) {
        this.phase = 'racing';
        this.boardingUntilMs = null;
        this.hidePassengerHud();
      }
    } else if (this.phase === 'exchange') {
      this.speed = 0;
      if (this.exchangeUntilMs !== null && nowTick >= this.exchangeUntilMs) {
        if (this.exchangeMode === 'drop') {
          this.exchangeMode = 'pick';
          this.exchangeUntilMs = nowTick + 1200;
          this.showPassengerHud('up', 'Subiendo pasajero…');
        } else if (this.exchangeMode === 'pick') {
          this.completeMidStop();
          this.phase = 'racing';
          this.exchangeMode = null;
          this.exchangeUntilMs = null;
          this.hidePassengerHud();
        } else if (this.exchangeMode === 'final_drop') {
          this.completeFinalStop();
        }
      }
    }

    if (this.phase === 'racing') {
      this.raceElapsedMs += dt * 1000;
    }

    if (this.phase !== 'done') {
      if (this.phase === 'ready' && input.throttle > 0) {
        unlockAudio();
        this.loopAudio.unlock();
        this.phase = 'boarding';
        this.boardingUntilMs = nowTick + 1600;
        this.showPassengerHud('up', 'Subiendo pasajero…');
      }

      const canDrive = this.phase === 'racing';

      const steerSign = input.steer;
      const steerPower = THREE.MathUtils.lerp(
        PHYS.steerLow,
        PHYS.steerHigh,
        Math.min(1, this.speed / maxSpeed),
      );
      this.bike.rotation.y -= steerSign * steerPower * dt;

      if (canDrive && input.brake > 0) {
        const b = brake * dt;
        this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - b);
      }

      const throttle = canDrive ? input.throttle : 0;
      if (canDrive) {
        this.speed += throttle * accel * dt;
        this.speed *= Math.exp(-drag * dt);
        this.speed = THREE.MathUtils.clamp(this.speed, -maxSpeed * 0.15, maxSpeed);
      } else {
        this.speed *= Math.exp(-drag * 2.5 * dt);
        if (Math.abs(this.speed) < 0.04) this.speed = 0;
      }

      if (canDrive) {
        this.bike.translateZ(-this.speed * dt);
      }

      let x = this.bike.position.x;
      let z = this.bike.position.z;
      if (canDrive) {
        let touchingVehicle = false;
        for (const o of OBSTACLES) {
          if (circleIntersectsObstacle(x, z, PLAYER_RADIUS, o)) touchingVehicle = true;
          const res = resolveCircleObstacle(x, z, PLAYER_RADIUS, o);
          if (res.hit) {
            x = res.x;
            z = res.z;
            this.speed *= 0.35;
          }
        }
        if (touchingVehicle && !this.wasTouchingVehicle) {
          this.applyContactTimePenalty();
        }
        this.wasTouchingVehicle = touchingVehicle;

        const inPedZone = z >= PEDESTRIAN_ZONE_Z_MIN && z <= PEDESTRIAN_ZONE_Z_MAX;
        let touchingPedInZone = false;
        for (const ped of this.pedestrians) {
          const px = ped.group.position.x;
          const pz = ped.group.position.z;
          const dx = x - px;
          const dz = z - pz;
          const dist = Math.hypot(dx, dz);
          const rr = PLAYER_RADIUS + ped.radius;
          if (dist < rr && dist > 1e-5) {
            if (inPedZone) touchingPedInZone = true;
            x = px + (dx / dist) * rr;
            z = pz + (dz / dist) * rr;
            this.speed *= 0.38;
          }
        }
        if (touchingPedInZone && !this.wasTouchingPedInZone) {
          this.applyContactTimePenalty();
        }
        this.wasTouchingPedInZone = touchingPedInZone;
      } else {
        this.wasTouchingVehicle = false;
        this.wasTouchingPedInZone = false;
      }
      this.bike.position.x = x;
      this.bike.position.z = z;
      this.bike.position.y = SPAWN.position.y;

      if (canDrive && this.nextCheckpointIndex < CHECKPOINTS.length) {
        const cp = CHECKPOINTS[this.nextCheckpointIndex]!;
        const dx = x - cp.center.x;
        const dz = z - cp.center.z;
        if (dx * dx + dz * dz <= (cp.radius + PLAYER_RADIUS * 0.85) ** 2) {
          const isLast = this.nextCheckpointIndex === CHECKPOINTS.length - 1;
          this.beginStopExchange(isLast);
        }
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - s.age / 0.48);
      if (s.age > 0.55) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        mat.dispose();
        this.sparks.splice(i, 1);
      }
    }

    this.syncHud();

    if (this.sessionStarted) {
      drawMinimap(this.ui.mapCanvas, {
        x: this.bike.position.x,
        z: this.bike.position.z,
        rotY: this.bike.rotation.y,
      });
    }

    this.loopAudio.sync(this.sessionStarted, this.phase, this.speed, input.throttle, PHYS.maxSpeed);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bike.quaternion);
    const back = forward.clone().multiplyScalar(-1);
    const desiredCam = this.bike.position.clone().add(back.multiplyScalar(12)).add(new THREE.Vector3(0, 7, 0));
    this.camera.position.lerp(desiredCam, 1 - Math.pow(0.001, dt));
    this.camTarget.copy(this.bike.position).add(forward.clone().multiplyScalar(6)).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
