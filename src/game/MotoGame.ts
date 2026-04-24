import * as THREE from 'three';
import {
  CHECKPOINTS,
  CONTACT_TIME_PENALTY_MS,
  OBSTACLES,
  PEDESTRIAN_ZONE_Z_MAX,
  PEDESTRIAN_ZONE_Z_MIN,
  PHYS,
  PLAYER_RADIUS,
  SPAWN,
  TURBO,
  WORLD_FLOOR_Y,
  TIME_ATTACK_LIMIT_MS,
} from '../track/config';
import {
  isObstacleMovingPositiveZ,
  obstacleAabbAtTime,
  obstacleFootprintForMinimap,
} from '../track/obstacleMotion';
import {
  addRoadCenterDashes,
  buildRoadRibbonGeometry,
  findTForWorldZ,
  getLateralDistanceToRoadMeters,
  getOffroadSeverity,
  getRoadCenterline,
  ROAD_HALF_WIDTH,
} from '../track/roadPath';
import {
  buildVibeJamBackToRefUrl,
  buildVibeJamExitUrl,
  getVibeJamBackRefFromQuery,
} from '../lib/vibeJamPortal';
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
import {
  buildGameUi,
  type GameUiRefs,
  type SessionGameMode,
  updateRouteSegment,
} from '../ui/buildGameUi';
import { drawMinimap } from '../ui/minimap';
import { circleIntersectsObstacle, resolveCircleObstacle } from './collision';
import {
  attachKeyboard,
  attachMouseAim,
  attachPointerDriver,
  attachTouchPad,
  disposeTiltListener,
  pollInput,
  requestTiltPermissionIfNeeded,
  setTiltInputOn,
  setTiltRecalibrationPending,
} from './input';
import {
  addZebraCrossingOnRoad,
  createCrossingPedestriansOnRoad,
  getPedestrianWorldXZ,
  updatePedestrianPositions,
  type PedestrianInstance,
} from './pedestrians';
import { createParkedCar } from './parkedCar';
import { addCityscape } from './worldDecor';
import { isSupabaseConfigured, saveRaceRunToSupabase } from '../lib/raceRuns';
import { DriftTrail } from './driftTrail';
import { createDefaultTurboPickups, updateTurboPickupFloat, type TurboPickupInstance } from './turboPickups';
import { addTrafficLightsToScene, isInActiveGreenCorridor } from './trafficLights';

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

const TIMER_MAIN_BASE =
  'text-3xl font-semibold tracking-tight tabular-nums text-zinc-50 drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]';
const TIMER_MAIN_TIME_ATTACK =
  'text-4xl font-bold tracking-tight tabular-nums text-amber-50 drop-shadow-[0_0_20px_rgba(251,191,36,0.35)] sm:text-5xl';
const TIMER_FRAC_BASE = 'text-xl font-semibold tabular-nums text-zinc-400';
const TIMER_FRAC_TIME_ATTACK = 'text-2xl font-bold tabular-nums text-amber-200/90 sm:text-3xl';
const TA_BAR_OK =
  'h-full w-full min-w-0 max-w-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-[width] duration-200 ease-out';
const TA_BAR_LOW =
  'h-full w-full min-w-0 max-w-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-amber-400 transition-[width] duration-200 ease-out';

export type MotoGameOptions = {
  /** Cierra el juego y deja que la app vuelva al splash (p. ej. botón «Volver a inicio»). */
  onBackToHome?: () => void;
  /** Vibe Jam: `?portal=true` abre al instante (sin menú) para continuidad webring. */
  vibeJamAutoStart?: boolean;
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
  /** Cámara más cerca en móvil (sobre todo apaisado) para ver mejor pista y moto. */
  private cameraBack = 12;
  private cameraUp = 7;
  private cameraLook = 6;
  private onOrientation = (): void => {
    requestAnimationFrame(() => this.onResize());
  };

  private readonly ui: GameUiRefs;

  private detachKeyboard: (() => void) | null = null;
  private detachTouchPad: (() => void) | null = null;
  private detachMouseAim: (() => void) | null = null;
  private detachPointerDriver: (() => void) | null = null;
  private tiltInputAbort: AbortController | null = null;
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
  private currentSteer = 0;

  private readonly sparks: Array<{ mesh: THREE.Mesh; age: number; vel: THREE.Vector3 }> = [];
  private lastBumpMs = 0;
  /** Evita múltiples penalizaciones por el mismo roce prolongado. */
  private wasTouchingVehicle = false;
  private wasTouchingPedInZone = false;

  private readonly pedestrians: PedestrianInstance[] = [];

  private readonly loopAudio = new GameLoopAudio();
  private bikeStyle: BikeStyle;
  private sessionGameMode: SessionGameMode = 'free';
  private timeAttackFailed = false;
  private readonly obstacleCarGroups: THREE.Group[] = [];
  private readonly minimapObstacleFp: { cx: number; cz: number; hw: number; hd: number }[] = OBSTACLES.map(
    () => ({ cx: 0, cz: 0, hw: 0, hd: 0 }),
  );
  private readonly pedWorldScratch = { x: 0, z: 0 };
  private readonly driftTrail: DriftTrail;
  private bikeDriftLastYaw: number;
  private turboPickups: TurboPickupInstance[] = [];
  private turboBoostUntilMs: number | null = null;

  private readonly vibeJamAutoStart: boolean;
  private vibeRingExit: THREE.Group | null = null;
  private vibeRingBack: THREE.Group | null = null;
  private vibeExitXZ = { x: 0, z: 0 };
  private vibeBackXZ: { x: number; z: number } | null = null;
  private vibePortalExitDone = false;
  private vibePortalBackDone = false;
  private readonly vibeVjP = new THREE.Vector3();
  private readonly vibeVjTan = new THREE.Vector3();
  private readonly vibeVjRight = new THREE.Vector3();

  constructor(container: HTMLElement, options?: MotoGameOptions) {
    this.vibeJamAutoStart = options?.vibeJamAutoStart === true;
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
      onStart: (mode) => {
        this.sessionGameMode = mode;
        this.beginSession();
      },
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
    this.scene.fog = new THREE.Fog(0x121018, 78, 340);

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
    this.driftTrail = new DriftTrail(this.scene, { maxPoints: 48 });
    this.bikeDriftLastYaw = SPAWN.rotationY;
    this.scene.add(this.bike);
    mountBikeStyle(this.bike, initialBike);

    this.resetRun();

    this.onResize();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onOrientation);
    requestAnimationFrame(() => this.onResize());
  }

  start(): void {
    this.detachKeyboard?.();
    this.detachTouchPad?.();
    this.detachMouseAim?.();
    this.detachPointerDriver?.();
    this.tiltInputAbort?.abort();
    this.tiltInputAbort = new AbortController();
    this.detachKeyboard = attachKeyboard();
    this.detachTouchPad = attachTouchPad({
      forward: this.ui.btnTouchForward,
      left: this.ui.btnTouchLeft,
      right: this.ui.btnTouchRight,
    });
    this.detachMouseAim = attachMouseAim(this.renderer.domElement);
    this.detachPointerDriver = attachPointerDriver(this.renderer.domElement);

    const tiltSig = this.tiltInputAbort.signal;
    this.ui.btnTilt.addEventListener(
      'click',
      async () => {
        if (tiltSig.aborted) return;
        const wasOn = this.ui.btnTilt.getAttribute('aria-pressed') === 'true';
        if (!wasOn) {
          if (!(await requestTiltPermissionIfNeeded())) return;
          setTiltRecalibrationPending();
          setTiltInputOn(true);
          this.ui.btnTilt.setAttribute('aria-pressed', 'true');
          this.ui.btnTilt.classList.add('mtr-tilt-on');
          this.ui.btnTilt.textContent = 'Giro on';
        } else {
          setTiltInputOn(false);
          this.ui.btnTilt.setAttribute('aria-pressed', 'false');
          this.ui.btnTilt.classList.remove('mtr-tilt-on');
          this.ui.btnTilt.textContent = 'Giro off';
        }
      },
      { signal: tiltSig },
    );
    this.ui.btnTilt.addEventListener(
      'dblclick',
      (e) => {
        e.preventDefault();
        if (this.ui.btnTilt.getAttribute('aria-pressed') === 'true') {
          setTiltRecalibrationPending();
        }
      },
      { signal: tiltSig },
    );
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
    if (this.vibeJamAutoStart) {
      queueMicrotask(() => {
        this.beginSession();
      });
    }
    this.raf = window.requestAnimationFrame(() => this.tick());
  }

  dispose(): void {
    window.cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onOrientation);
    this.tiltInputAbort?.abort();
    this.tiltInputAbort = null;
    disposeTiltListener();
    this.ui.btnTilt.setAttribute('aria-pressed', 'false');
    this.ui.btnTilt.classList.remove('mtr-tilt-on');
    this.ui.btnTilt.textContent = 'Giro off';
    this.detachPointerDriver?.();
    this.detachPointerDriver = null;
    this.detachMouseAim?.();
    this.detachMouseAim = null;
    this.detachTouchPad?.();
    this.detachTouchPad = null;
    this.detachKeyboard?.();
    this.loopAudio.dispose();
    this.driftTrail.dispose();
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
    this.updateCameraRigForViewport(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, true);
  };

  private updateCameraRigForViewport(w: number, h: number): void {
    const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
    const landscape = w > h;
    const shortSide = Math.min(w, h);
    const isPhone = isTouch && shortSide < 640;
    if (isPhone && landscape) {
      this.cameraBack = 6.6;
      this.cameraUp = 3.5;
      this.cameraLook = 2.5;
      this.camera.fov = 50;
    } else if (isTouch) {
      this.cameraBack = 8.2;
      this.cameraUp = 4.8;
      this.cameraLook = 3.2;
      this.camera.fov = 54;
    } else {
      this.cameraBack = 12;
      this.cameraUp = 7;
      this.cameraLook = 6;
      this.camera.fov = 58;
    }
  }

  private buildWorld(): void {
    /** Abarca salida z≈+4 y final de ruta z≈-320 con margen. */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(720, 720, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = WORLD_FLOOR_Y;
    this.scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f3548, roughness: 0.96, metalness: 0.02 });
    const roadGeo = buildRoadRibbonGeometry(ROAD_HALF_WIDTH, 0.01, 256);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    this.scene.add(road);
    addRoadCenterDashes(this.scene, 0.022, { tStep: 0.03, dashLen: 1.4, dashW: 0.36 });

    addCityscape(this.scene);

    addZebraCrossingOnRoad(this.scene);
    const peds = createCrossingPedestriansOnRoad(this.scene, 7);
    this.pedestrians.length = 0;
    for (const p of peds) {
      this.pedestrians.push(p);
      this.scene.add(p.group);
    }

    this.obstacleCarGroups.length = 0;
    OBSTACLES.forEach((o, i) => {
      const g = createParkedCar(o, i);
      this.scene.add(g);
      this.obstacleCarGroups.push(g);
    });
    const tSpawn = performance.now() * 0.001;
    for (let i = 0; i < this.obstacleCarGroups.length; i++) {
      this.syncObstacleTransform(i, tSpawn);
    }

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

    this.turboPickups = createDefaultTurboPickups(this.scene);
    addTrafficLightsToScene(this.scene);
    this.addVibeJamPortals();
  }

  /** Anillos webring Vibe Jam 2026: salida a hub, vuelta a `ref` si vino de otro juego. */
  private addVibeJamPortals(): void {
    const curve = getRoadCenterline();
    const tExit = findTForWorldZ(-40);
    curve.getPointAt(tExit, this.vibeVjP);
    curve.getTangentAt(tExit, this.vibeVjTan);
    this.vibeVjTan.y = 0;
    if (this.vibeVjTan.lengthSq() < 1e-8) {
      this.vibeVjRight.set(1, 0, 0);
    } else {
      this.vibeVjTan.normalize();
      this.vibeVjRight.set(-this.vibeVjTan.z, 0, this.vibeVjTan.x);
    }
    const offE = 6.5;
    const exX = this.vibeVjP.x + this.vibeVjRight.x * offE;
    const exZ = this.vibeVjP.z + this.vibeVjRight.z * offE;
    this.vibeRingExit = this.createVibeJamRingGroup(0x22d3ee, 'Portal Vibe Jam');
    this.vibeRingExit.position.set(exX, 0, exZ);
    this.scene.add(this.vibeRingExit);
    this.vibeExitXZ = { x: exX, z: exZ };

    const backRef = getVibeJamBackRefFromQuery();
    if (backRef) {
      const tBack = findTForWorldZ(2.2);
      curve.getPointAt(tBack, this.vibeVjP);
      curve.getTangentAt(tBack, this.vibeVjTan);
      this.vibeVjTan.y = 0;
      this.vibeVjTan.normalize();
      this.vibeVjRight.set(-this.vibeVjTan.z, 0, this.vibeVjTan.x);
      const offB = 6.2;
      const bX = this.vibeVjP.x - this.vibeVjRight.x * offB;
      const bZ = this.vibeVjP.z - this.vibeVjRight.z * offB;
      this.vibeRingBack = this.createVibeJamRingGroup(0xec4899, 'Volver a juego previo');
      this.vibeRingBack.position.set(bX, 0, bZ);
      this.scene.add(this.vibeRingBack);
      this.vibeBackXZ = { x: bX, z: bZ };
    } else {
      this.vibeBackXZ = null;
    }
  }

  private createVibeJamRingGroup(hex: number, label: string): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.48,
      metalness: 0.2,
      roughness: 0.38,
    });
    const tor = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.11, 10, 40), mat);
    tor.rotation.x = Math.PI / 2;
    tor.position.y = 0.72;
    g.add(tor);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 88;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(6,4,16,0.7)';
    ctx.fillRect(0, 0, 512, 88);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 26px system-ui,Segoe UI,sans-serif';
    ctx.fillText(label, 20, 55);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    spr.position.y = 1.7;
    spr.scale.set(4.2, 0.72, 1);
    g.add(spr);
    return g;
  }

  private checkVibeJamPortals(bx: number, bz: number): void {
    const r = 3.1;
    const r2 = r * r;
    if (!this.vibePortalExitDone) {
      const dx = bx - this.vibeExitXZ.x;
      const dz = bz - this.vibeExitXZ.z;
      if (dx * dx + dz * dz < r2) {
        this.vibePortalExitDone = true;
        window.location.assign(buildVibeJamExitUrl(this.speed));
      }
    }
    if (this.vibeBackXZ && !this.vibePortalBackDone) {
      const dx = bx - this.vibeBackXZ.x;
      const dz = bz - this.vibeBackXZ.z;
      if (dx * dx + dz * dz < r2) {
        const url = buildVibeJamBackToRefUrl();
        if (url) {
          this.vibePortalBackDone = true;
          window.location.assign(url);
        }
      }
    }
  }

  /** Muestra turbos y permite recogerlos solo tras la parada correspondiente (p. ej. Pupy hecha → `nextCheckpointIndex >= 1`). */
  private syncTurboPickupVisibility(): void {
    for (const tp of this.turboPickups) {
      if (!tp.active) {
        tp.group.visible = false;
        continue;
      }
      tp.group.visible = this.nextCheckpointIndex >= tp.minNextCheckpointIndex;
    }
  }

  private getEffectiveMaxSpeed(): number {
    if (this.turboBoostUntilMs === null) {
      return PHYS.maxSpeed;
    }
    if (performance.now() >= this.turboBoostUntilMs) {
      return PHYS.maxSpeed;
    }
    return PHYS.maxSpeed * TURBO.maxSpeedMult;
  }

  private syncObstacleTransform(index: number, tSec: number): void {
    const o = OBSTACLES[index]!;
    const g = this.obstacleCarGroups[index]!;
    const aabb = obstacleAabbAtTime(o, tSec);
    const cx = (aabb.min.x + aabb.max.x) * 0.5;
    const cz = (aabb.min.z + aabb.max.z) * 0.5;
    g.position.set(cx, o.min.y, cz);
    const forwardPlusZ = o.motion ? isObstacleMovingPositiveZ(o, tSec) : true;
    g.rotation.set(0, forwardPlusZ ? 0 : Math.PI, 0);
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
    this.currentSteer = 0;
    this.lastBumpMs = 0;
    this.wasTouchingVehicle = false;
    this.wasTouchingPedInZone = false;
    this.vibePortalExitDone = false;
    this.vibePortalBackDone = false;

    this.clearSparks();
    this.driftTrail.clear();
    for (const tp of this.turboPickups) {
      tp.active = true;
    }
    this.syncTurboPickupVisibility();
    this.turboBoostUntilMs = null;

    this.bike.position.copy(SPAWN.position);
    this.bike.rotation.set(0, SPAWN.rotationY, 0);
    this.bikeDriftLastYaw = SPAWN.rotationY;

    this.ui.finishOverlay.classList.add('hidden');
    this.ui.finishTitle.textContent = '¡Llegaste!';
    this.ui.finishCloud.classList.add('hidden');
    this.ui.finishCloud.textContent = '';
    this.timeAttackFailed = false;
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
    this.timeAttackFailed = false;
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
    this.ui.finishTitle.textContent = '¡Llegaste!';
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

  private failTimeAttack(): void {
    if (this.timeAttackFailed || this.sessionGameMode !== 'time_attack') return;
    this.timeAttackFailed = true;
    this.speed = 0;
    this.phase = 'done';
    this.finishedRaceMs = this.raceElapsedMs;
    this.hidePassengerHud();
    this.exchangeMode = null;
    this.exchangeUntilMs = null;
    this.ui.finishTitle.textContent = "Time's up!";
    this.ui.finishTime.textContent = `Límite ${fmtTime(TIME_ATTACK_LIMIT_MS)} · Tiempo: ${fmtTime(this.raceElapsedMs)}`;
    this.ui.finishCloud.classList.add('hidden');
    this.ui.finishCloud.textContent = '';
    this.ui.finishOverlay.classList.remove('hidden');
    playBump();
    hapticBump();
    this.syncHud();
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

  /** Tiempo restante de Time Attack; en modo libre no se usa en HUD. */
  private timeAttackRemainingMs(): number {
    return Math.max(0, TIME_ATTACK_LIMIT_MS - this.raceElapsedMs);
  }

  /**
   * Panel de Time Attack: cuenta atrás legible, bara de tiempo restante y estilos reforzados.
   * En modo libre o el reloj vuelve a tipografía normal.
   */
  private updateTimeAttackHudVisuals(): void {
    const hud = this.ui.timeAttackHud;
    const bar = this.ui.timeAttackBarFill;
    const showTaHud =
      this.sessionStarted &&
      this.sessionGameMode === 'time_attack' &&
      this.phase !== 'done';

    if (!showTaHud) {
      hud.classList.add('hidden');
      this.ui.timerMain.className = TIMER_MAIN_BASE;
      this.ui.timerFrac.className = TIMER_FRAC_BASE;
      return;
    }

    hud.classList.remove('hidden');
    const rem = this.timeAttackRemainingMs();
    const pct = Math.max(0, Math.min(100, (rem / TIME_ATTACK_LIMIT_MS) * 100));
    bar.style.width = `${pct}%`;
    this.ui.timerMain.className = TIMER_MAIN_TIME_ATTACK;
    this.ui.timerFrac.className = TIMER_FRAC_TIME_ATTACK;
    if (rem < 30_000) {
      hud.classList.add('ring-2', 'ring-red-500/50', 'border-red-500/40');
      bar.className = TA_BAR_LOW;
    } else {
      hud.classList.remove('ring-2', 'ring-red-500/50', 'border-red-500/40');
      bar.className = TA_BAR_OK;
    }
  }

  private syncHud(): void {
    const endHud = () => this.updateTimeAttackHudVisuals();
    this.syncRoutePill();

    const maxSpeed = this.getEffectiveMaxSpeed();
    const kph = Math.round(this.speed * 18);
    this.ui.speedValue.textContent = `${kph}`;
    const pct = Math.min(100, Math.max(0, Math.round((Math.abs(this.speed) / maxSpeed) * 100)));
    this.ui.speedBar.style.width = `${pct}%`;
    if (this.turboBoostUntilMs !== null && performance.now() < this.turboBoostUntilMs) {
      this.ui.turboHudWrap.classList.remove('hidden');
      const rem = (this.turboBoostUntilMs - performance.now()) / TURBO.durationMs;
      this.ui.turboBarFill.style.width = `${Math.max(0, Math.min(100, rem * 100))}%`;
    } else {
      this.ui.turboHudWrap.classList.add('hidden');
      this.ui.turboBarFill.style.width = '0%';
    }

    if (!this.sessionStarted) {
      const z = fmtTimeParts(0);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      this.ui.timerStatus.textContent = 'Menú';
      this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-zinc-500';
      endHud();
      return;
    }

    if (this.phase === 'ready') {
      if (this.sessionGameMode === 'time_attack') {
        const z = fmtTimeParts(this.timeAttackRemainingMs());
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Time Attack';
        this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]';
      } else {
        const z = fmtTimeParts(0);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Listo';
        this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]';
      }
      endHud();
      return;
    }

    if (this.phase === 'boarding') {
      if (this.sessionGameMode === 'time_attack') {
        const z = fmtTimeParts(this.timeAttackRemainingMs());
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Time Attack';
        this.ui.timerDot.className = 'h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400';
      } else {
        const z = fmtTimeParts(0);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Subiendo';
        this.ui.timerDot.className = 'h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400';
      }
      endHud();
      return;
    }

    if (this.phase === 'exchange') {
      if (this.sessionGameMode === 'time_attack') {
        const rem = this.timeAttackRemainingMs();
        const z = fmtTimeParts(rem);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Parada';
        this.ui.timerDot.className =
          rem < 30_000
            ? 'h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.4)]'
            : 'h-1.5 w-1.5 rounded-full bg-amber-500';
      } else {
        const z = fmtTimeParts(this.raceElapsedMs);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Parada';
        this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-500';
      }
      endHud();
      return;
    }

    if (this.phase === 'racing') {
      if (this.sessionGameMode === 'time_attack') {
        const rem = this.timeAttackRemainingMs();
        const z = fmtTimeParts(rem);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'Time Attack';
        this.ui.timerDot.className =
          rem < 30_000
            ? 'h-1.5 w-1.5 animate-pulse rounded-full bg-red-500'
            : 'h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500';
      } else {
        const z = fmtTimeParts(this.raceElapsedMs);
        this.ui.timerMain.textContent = z.main;
        this.ui.timerFrac.textContent = z.frac;
        this.ui.timerStatus.textContent = 'En Curso';
        this.ui.timerDot.className = 'h-1.5 w-1.5 animate-pulse rounded-full bg-red-500';
      }
      endHud();
      return;
    }

    if (this.phase === 'done' && this.finishedRaceMs !== null) {
      const z = fmtTimeParts(this.finishedRaceMs);
      this.ui.timerMain.textContent = z.main;
      this.ui.timerFrac.textContent = z.frac;
      if (this.timeAttackFailed) {
        this.ui.timerStatus.textContent = "Time's up";
        this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-rose-500';
      } else {
        this.ui.timerStatus.textContent = 'Meta';
        this.ui.timerDot.className = 'h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.45)]';
      }
    }
    endHud();
  }

  private tick(): void {
    this.raf = window.requestAnimationFrame(() => this.tick());

    const dt = Math.min(0.05, this.clock.getDelta());
    const tSec = performance.now() * 0.001;
    for (let i = 0; i < this.obstacleCarGroups.length; i++) {
      this.syncObstacleTransform(i, tSec);
    }
    const raw = pollInput();
    const input = this.sessionStarted
      ? raw
      : { throttle: 0, brake: 0, steer: 0 };

    const accel = PHYS.accel;
    const brake = PHYS.brake;
    const drag = PHYS.drag;

    updatePedestrianPositions(this.pedestrians, performance.now() * 0.001, 6.35);

    const nowTick = performance.now();
    if (this.turboBoostUntilMs !== null && nowTick >= this.turboBoostUntilMs) {
      this.turboBoostUntilMs = null;
    }
    const maxSpeed = this.getEffectiveMaxSpeed();

    this.syncTurboPickupVisibility();
    for (const tp of this.turboPickups) {
      if (tp.group.visible) {
        updateTurboPickupFloat(tp, tSec, dt);
      }
    }

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

      const steerInput = input.steer;

      if (canDrive) {
        const speedFactor = Math.max(0.25, Math.abs(this.speed) / maxSpeed);
        const steerStrength = THREE.MathUtils.lerp(
          PHYS.steerLow,
          PHYS.steerHigh,
          speedFactor,
        );
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, steerInput, 0.15);
        this.bike.rotation.y -= this.currentSteer * steerStrength * dt;
      } else {
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, 0, 0.22);
      }

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
        // pequeño deslizamiento lateral para que el giro se sienta real
        this.bike.position.x += Math.sin(this.bike.rotation.y) * this.speed * 0.02;
      }

      let x = this.bike.position.x;
      let z = this.bike.position.z;
      if (canDrive) {
        const greenFreePass = isInActiveGreenCorridor(x, z);
        let touchingVehicle = false;
        if (!greenFreePass) {
          for (let oi = 0; oi < OBSTACLES.length; oi++) {
            const o = obstacleAabbAtTime(OBSTACLES[oi]!, tSec);
            if (circleIntersectsObstacle(x, z, PLAYER_RADIUS, o)) touchingVehicle = true;
            const res = resolveCircleObstacle(x, z, PLAYER_RADIUS, o);
            if (res.hit) {
              x = res.x;
              z = res.z;
              this.speed *= 0.35;
            }
          }
        }
        if (touchingVehicle && !this.wasTouchingVehicle) {
          this.applyContactTimePenalty();
        }
        this.wasTouchingVehicle = touchingVehicle;

        const inPedZone = z >= PEDESTRIAN_ZONE_Z_MIN && z <= PEDESTRIAN_ZONE_Z_MAX;
        let touchingPedInZone = false;
        if (!greenFreePass) {
          for (const ped of this.pedestrians) {
            getPedestrianWorldXZ(ped, this.pedWorldScratch);
            const px = this.pedWorldScratch.x;
            const pz = this.pedWorldScratch.z;
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
        }
        if (touchingPedInZone && !this.wasTouchingPedInZone) {
          this.applyContactTimePenalty();
        }
        this.wasTouchingPedInZone = touchingPedInZone;

        const lat = getLateralDistanceToRoadMeters(x, z);
        const off = getOffroadSeverity(lat);
        if (off > 0) {
          this.speed *= Math.exp(-PHYS.offRoadExtraDrag * off * dt);
        }

        const pickR = TURBO.pickupRadius + PLAYER_RADIUS * 0.88;
        const pickR2 = pickR * pickR;
        for (const tp of this.turboPickups) {
          if (!tp.active) {
            continue;
          }
          if (this.nextCheckpointIndex < tp.minNextCheckpointIndex) {
            continue;
          }
          const dx = x - tp.x;
          const dz = z - tp.z;
          if (dx * dx + dz * dz <= pickR2) {
            tp.active = false;
            tp.group.visible = false;
            this.turboBoostUntilMs = nowTick + TURBO.durationMs;
            this.speed = Math.min(this.getEffectiveMaxSpeed(), this.speed + 2.8);
            playCheckpointChime();
            hapticCheckpoint();
          }
        }
      } else {
        this.wasTouchingVehicle = false;
        this.wasTouchingPedInZone = false;
      }
      this.bike.position.x = x;
      this.bike.position.z = z;
      this.bike.position.y = SPAWN.position.y;

      const yawNow = this.bike.rotation.y;
      const yawRate = (yawNow - this.bikeDriftLastYaw) / Math.max(1e-4, dt);
      const speedNorm = Math.min(1, Math.abs(this.speed) / maxSpeed);
      const steerAbs = Math.abs(steerInput);
      const fromSteer = steerAbs * speedNorm * 0.64;
      const fromTurn = Math.min(1, Math.abs(yawRate) * 0.5) * speedNorm;
      const driftI = Math.min(1, fromSteer * 0.6 + fromTurn * 0.5);
      const minDr = 0.1;
      const isDrift = canDrive && Math.abs(this.speed) > 1.1 && driftI > minDr;
      if (isDrift) {
        const turnSign =
          steerAbs > 0.04
            ? Math.sign(steerInput)
            : Math.abs(yawRate) > 0.07
              ? -Math.sign(yawRate)
              : 0;
        const targetZ = turnSign === 0 ? 0 : -turnSign * 0.12 * driftI;
        this.bike.rotation.z = THREE.MathUtils.lerp(this.bike.rotation.z, targetZ, 0.25);
      } else {
        this.bike.rotation.z = THREE.MathUtils.lerp(this.bike.rotation.z, 0, 0.22);
      }
      this.driftTrail.update(dt, isDrift ? driftI : 0, minDr, this.bike);
      this.bikeDriftLastYaw = yawNow;

      if (canDrive && this.nextCheckpointIndex < CHECKPOINTS.length) {
        const cp = CHECKPOINTS[this.nextCheckpointIndex]!;
        const dx = x - cp.center.x;
        const dz = z - cp.center.z;
        if (dx * dx + dz * dz <= (cp.radius + PLAYER_RADIUS * 0.85) ** 2) {
          const isLast = this.nextCheckpointIndex === CHECKPOINTS.length - 1;
          this.beginStopExchange(isLast);
        }
      }

      if (this.sessionStarted && this.phase === 'racing' && canDrive) {
        this.checkVibeJamPortals(x, z);
      }
    }

    if (this.vibeRingExit) {
      this.vibeRingExit.rotation.y += dt * 0.45;
    }
    if (this.vibeRingBack) {
      this.vibeRingBack.rotation.y += dt * 0.4;
    }

    if (
      this.sessionStarted &&
      this.phase === 'racing' &&
      this.sessionGameMode === 'time_attack' &&
      this.raceElapsedMs >= TIME_ATTACK_LIMIT_MS
    ) {
      this.failTimeAttack();
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
      for (let i = 0; i < OBSTACLES.length; i++) {
        obstacleFootprintForMinimap(OBSTACLES[i]!, tSec, this.minimapObstacleFp[i]!);
      }
      drawMinimap(
        this.ui.mapCanvas,
        {
          x: this.bike.position.x,
          z: this.bike.position.z,
          rotY: this.bike.rotation.y,
        },
        this.minimapObstacleFp,
      );
    }

    this.loopAudio.sync(this.sessionStarted, this.phase, this.speed, input.throttle, this.getEffectiveMaxSpeed());

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bike.quaternion);
    const back = forward.clone().multiplyScalar(-1);
    const desiredCam = this.bike.position
      .clone()
      .add(back.multiplyScalar(this.cameraBack))
      .add(new THREE.Vector3(0, this.cameraUp, 0));
    this.camera.position.lerp(desiredCam, 1 - Math.pow(0.001, dt));
    this.camTarget
      .copy(this.bike.position)
      .add(forward.clone().multiplyScalar(this.cameraLook))
      .add(new THREE.Vector3(0, 1.1, 0));
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
