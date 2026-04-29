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
  getTiltDebugInfo,
  hasTiltSignalSample,
  isTiltSensorAvailable,
  isMouseAimInputActive,
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
import { tickCityShaders } from '../lib/cityShaders';
import { getUseMobileGameUi } from '../lib/deviceInputProfile';
import { createNightSky, type NightSky } from './nightSky';
import { ensureLocalFreeProfile, recordFreeModePersonalBestIfBetter } from '../lib/localFreeProfile';
import { isSupabaseConfigured, saveRaceRunToSupabase } from '../lib/raceRuns';
import { DriftTrail } from './driftTrail';
import { createDefaultTurboPickups, updateTurboPickupFloat, type TurboPickupInstance } from './turboPickups';
import { addTrafficLightsToScene, isInActiveGreenCorridor } from './trafficLights';
import { getAsphaltColorMap, getAsphaltNormalMap, getSidewalkMap } from '../lib/proceduralTextures';

type RacePhase = 'ready' | 'boarding' | 'exchange' | 'racing' | 'done';

/**
 * Tope de Δt por frame (s): solo para picos (cambio de pestaña). Un cap bajo p. ej. 0.05s
 * descartaba tiempo real cuando el frame tardaba >50 ms → acel. más lenta en PC con carga de GPU.
 */
const MAX_SIM_STEP_SEC = 0.2;

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

/** Suavizado con Δt (evita muelle distinto a 60/120 fps). Más λ = sigue al input antes. */
const SMOOTH_STEER_IN_HZ = 24;
const SMOOTH_STEER_IN_MOUSE_HZ = 27;
const SMOOTH_STEER_RELEASE_HZ = 16;
const SMOOTH_CAMERA_FOLLOW_HZ = 18;
const SMOOTH_LEAN_HZ = 24;
const SMOOTH_LEAN_RESET_HZ = 20;
/** Sin gas: freno motor fuerte (suelta clic/ratón o tecla y la moto cae a 0 enseguida). */
const COAST_DRAG_MULT = 3.5;
const COAST_STOP_SPEED_EPS = 0.2;
/** Arranque más ágil y crucero estable para evitar salida lenta. */
const LAUNCH_SPEED_MPS = 8.2;
const CRUISE_SPEED_MPS = 12.2;
const CRUISE_CATCHUP_HZ = 3.2;

type HandlingProfileName = 'arcade' | 'balanced' | 'realistic';
type HandlingProfile = {
  steerDeadzone: number;
  steerInHz: number;
  steerInMouseHz: number;
  steerReleaseHz: number;
  yawRateLow: number;
  yawRateHigh: number;
  highSpeedSteerDamping: number;
  steerAssistBaseHz: number;
  steerAssistSpeedHz: number;
  recoverMinSpeed: number;
  turnDragBase: number;
  turnAssistStart: number;
  cruiseTurnPenalty: number;
  softSlipMps: number;
};

const HANDLING_PROFILES: Readonly<Record<HandlingProfileName, HandlingProfile>> = {
  arcade: {
    steerDeadzone: 0.06,
    steerInHz: 24,
    steerInMouseHz: 27,
    steerReleaseHz: 16,
    yawRateLow: 2.35,
    yawRateHigh: 1.48,
    highSpeedSteerDamping: 0.34,
    steerAssistBaseHz: 2.1,
    steerAssistSpeedHz: 2.2,
    recoverMinSpeed: 2.2,
    turnDragBase: 1.08,
    turnAssistStart: 0.44,
    cruiseTurnPenalty: 0.3,
    softSlipMps: 0.56,
  },
  balanced: {
    steerDeadzone: 0.05,
    steerInHz: SMOOTH_STEER_IN_HZ,
    steerInMouseHz: SMOOTH_STEER_IN_MOUSE_HZ,
    steerReleaseHz: SMOOTH_STEER_RELEASE_HZ,
    yawRateLow: 2.15,
    yawRateHigh: 1.32,
    highSpeedSteerDamping: 0.31,
    steerAssistBaseHz: 1.7,
    steerAssistSpeedHz: 1.7,
    recoverMinSpeed: 2.4,
    turnDragBase: 0.84,
    turnAssistStart: 0.5,
    cruiseTurnPenalty: 0.13,
    softSlipMps: 0.32,
  },
  realistic: {
    steerDeadzone: 0.045,
    steerInHz: 17,
    steerInMouseHz: 20,
    steerReleaseHz: 13,
    yawRateLow: 1.8,
    yawRateHigh: 1.08,
    highSpeedSteerDamping: 0.38,
    steerAssistBaseHz: 1.05,
    steerAssistSpeedHz: 0.95,
    recoverMinSpeed: 2.7,
    turnDragBase: 0.62,
    turnAssistStart: 0.56,
    cruiseTurnPenalty: 0.08,
    softSlipMps: 0.18,
  },
};

const ACTIVE_HANDLING_PROFILE: HandlingProfileName = 'arcade';
const HANDLING = HANDLING_PROFILES[ACTIVE_HANDLING_PROFILE];

function applyDeadzone(value: number, dz: number): number {
  const a = Math.abs(value);
  if (a <= dz) return 0;
  const scaled = (a - dz) / Math.max(1e-6, 1 - dz);
  return Math.sign(value) * scaled;
}

function normalizeAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngleRad(current: number, target: number, alpha: number): number {
  const delta = normalizeAngleRad(target - current);
  return current + delta * alpha;
}

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
  private tiltDebugOverlay: HTMLDivElement | null = null;
  private tiltDebugAccumMs = 0;
  private resizeObserver: ResizeObserver | null = null;
  private raf = 0;
  private nightSky: NightSky | null = null;

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
  /**
   * Bloquea movimiento al entrar en fase `racing` hasta detectar aceleración manual.
   * Conserva el launch speed actual, pero evita cualquier avance automático.
   */
  private awaitingManualLaunch = false;
  private pcControlsHintTimeout: number | null = null;

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
  private readonly steerAssistTangent = new THREE.Vector3();

  constructor(container: HTMLElement, options?: MotoGameOptions) {
    this.vibeJamAutoStart = options?.vibeJamAutoStart === true;
    this.container = container;
    ensureLocalFreeProfile();

    const initialBike = readStoredBikeStyle();
    this.bikeStyle = initialBike;

    const preferMsaa =
      typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: preferMsaa,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(0xbfe7ff, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.scene.fog = new THREE.Fog(0xe9f6ff, 100, 430);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 250);
    this.camera.position.set(0, 10, 14);

    const ambient = new THREE.AmbientLight(0xf2f7ff, 1.02);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xb0ddff, 0xf2d8b8, 1.04);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffefbf, 1.12);
    sun.position.set(-56, 82, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 12;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -52;
    sun.shadow.camera.right = 52;
    sun.shadow.camera.top = 52;
    sun.shadow.camera.bottom = -52;
    sun.shadow.bias = -0.00012;
    this.scene.add(sun);
    const skyBounce = new THREE.DirectionalLight(0xd9ecff, 0.54);
    skyBounce.position.set(34, 40, 24);
    this.scene.add(skyBounce);
    const warmFill = new THREE.DirectionalLight(0xffe3b8, 0.48);
    warmFill.position.set(46, 28, -22);
    this.scene.add(warmFill);
    const roadFill = new THREE.DirectionalLight(0xffe9b7, 0.32);
    roadFill.position.set(0, 1, 0);
    this.scene.add(roadFill);

    this.buildWorld();
    this.nightSky = createNightSky();
    this.scene.add(this.nightSky.group);
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
      brake: this.ui.btnTouchBrake,
    });
    this.detachMouseAim = attachMouseAim(this.renderer.domElement);
    this.detachPointerDriver = attachPointerDriver(this.renderer.domElement);

    const tiltSig = this.tiltInputAbort.signal;
    if (!isTiltSensorAvailable()) {
      this.ui.btnTilt.setAttribute('aria-pressed', 'false');
      this.ui.btnTilt.classList.remove('mtr-tilt-on');
      this.ui.btnTilt.textContent = 'Giro n/a';
      this.ui.btnTilt.disabled = true;
    } else {
      this.ui.btnTilt.disabled = false;
    }
    this.ui.btnTilt.addEventListener(
      'click',
      () => {
        if (tiltSig.aborted) return;
        if (!isTiltSensorAvailable()) return;
        const wasOn = this.ui.btnTilt.getAttribute('aria-pressed') === 'true';
        if (!wasOn) {
          // Primera línea efectiva del enable: permiso iOS dentro del mismo gesto (sin UI antes del prompt).
          void requestTiltPermissionIfNeeded().then((granted) => {
            if (tiltSig.aborted) return;
            if (!granted) {
              this.ui.btnTilt.setAttribute('aria-pressed', 'false');
              this.ui.btnTilt.classList.remove('mtr-tilt-on');
              this.ui.btnTilt.textContent = 'Giro off';
              return;
            }
            this.ui.btnTilt.textContent = 'Giro…';
            this.ui.btnTilt.classList.add('mtr-tilt-on');
            this.ui.btnTilt.setAttribute('aria-pressed', 'true');
            setTiltRecalibrationPending();
            if (!setTiltInputOn(true)) {
              this.ui.btnTilt.setAttribute('aria-pressed', 'false');
              this.ui.btnTilt.classList.remove('mtr-tilt-on');
              this.ui.btnTilt.textContent = 'Giro n/a';
              return;
            }
            this.ui.btnTilt.textContent = 'Giro on';
            window.setTimeout(() => {
              if (tiltSig.aborted) return;
              if (this.ui.btnTilt.getAttribute('aria-pressed') !== 'true') return;
              if (!hasTiltSignalSample()) {
                setTiltInputOn(false);
                this.ui.btnTilt.setAttribute('aria-pressed', 'false');
                this.ui.btnTilt.classList.remove('mtr-tilt-on');
                this.ui.btnTilt.textContent = 'Giro n/a';
              }
            }, 2600);
          });
          return;
        }
        setTiltInputOn(false);
        this.ui.btnTilt.setAttribute('aria-pressed', 'false');
        this.ui.btnTilt.classList.remove('mtr-tilt-on');
        this.ui.btnTilt.textContent = 'Giro off';
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

    if (this.shouldShowTiltDebug()) {
      this.mountTiltDebugOverlay();
    }
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
    this.removeTiltDebugOverlay();
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
    this.hidePcControlsHint();
    this.loopAudio.dispose();
    this.driftTrail.dispose();
    this.nightSky?.dispose();
    this.nightSky = null;
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
    if (this.ui.btnTilt.getAttribute('aria-pressed') === 'true') {
      // Neutral calibration al iniciar carrera (pose actual del teléfono = recto).
      setTiltRecalibrationPending();
    }
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
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    /** Tope 2: antes solo PC bajaba a 1.65 (pixelación en pantallas grandes / HiDPI). */
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, true);
  };

  private updateCameraRigForViewport(w: number, h: number): void {
    const isMobileRig = typeof window !== 'undefined' && getUseMobileGameUi();
    const landscape = w > h;
    const shortSide = Math.min(w, h);
    const isPhone = isMobileRig && shortSide < 640;
    if (isPhone && landscape) {
      this.cameraBack = 6.6;
      this.cameraUp = 3.5;
      this.cameraLook = 2.5;
      this.camera.fov = 50;
    } else if (isMobileRig) {
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
      new THREE.MeshStandardMaterial({
        color: 0x9fbc8f,
        map: getSidewalkMap(),
        roughness: 0.95,
        metalness: 0,
        emissive: 0x0,
        emissiveIntensity: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = WORLD_FLOOR_Y;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getAsphaltColorMap(),
      normalMap: getAsphaltNormalMap(),
      normalScale: new THREE.Vector2(0.38, 0.38),
      roughness: 0.86,
      metalness: 0.08,
      emissive: 0x0,
      emissiveIntensity: 0,
    });
    const roadGeo = buildRoadRibbonGeometry(ROAD_HALF_WIDTH, 0.01, 256);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    road.castShadow = false;
    this.scene.add(road);

    // Relieve visual barato: franjas muy sutiles para simular reparaciones/cracks.
    const patchMat = new THREE.MeshStandardMaterial({
      color: 0x5f6772,
      roughness: 0.92,
      metalness: 0.02,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const patchGeo = new THREE.PlaneGeometry(0.18, 2.8);
    const patchCurve = getRoadCenterline();
    const pTmp = new THREE.Vector3();
    for (let t = 0.02; t < 0.98; t += 0.035) {
      patchCurve.getPointAt(t, pTmp);
      const patch = new THREE.Mesh(patchGeo, patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.y = THREE.MathUtils.degToRad((Math.sin(t * 40) * 7));
      patch.position.set(pTmp.x + Math.sin(t * 9) * 0.7, 0.018, pTmp.z);
      this.scene.add(patch);
    }

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
    this.awaitingManualLaunch = false;
    this.currentSteer = 0;
    this.lastBumpMs = 0;
    this.wasTouchingVehicle = false;
    this.wasTouchingPedInZone = false;
    this.vibePortalExitDone = false;
    this.vibePortalBackDone = false;
    this.hidePcControlsHint();

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

  /** Aviso al primer «Subiendo pasajero…»: PC (teclado/ratón) o móvil vertical (girar a horizontal). */
  private hidePcControlsHint(): void {
    if (this.pcControlsHintTimeout !== null) {
      clearTimeout(this.pcControlsHintTimeout);
      this.pcControlsHintTimeout = null;
    }
    this.ui.pcControlsHint.classList.add('hidden');
  }

  private showSessionStartHintForInitialBoarding(): void {
    if (typeof window === 'undefined') return;
    this.hidePcControlsHint();
    const w = window;
    const mq = (q: string) => w.matchMedia(q).matches;
    const isDesktopForHint =
      !getUseMobileGameUi() && (mq('(pointer: fine)') || mq('(hover: hover)'));
    const inPortrait = mq('(orientation: portrait)');

    const textPc =
      'Puedes usar el teclado o arrastrar el ratón en el juego para moverte (W, S, A, D, clic sostenido).';
    const textMobileRotate =
      'Para más comodidad, gira tu celular al modo horizontal (mando a dos manos).';

    if (isDesktopForHint) {
      this.ui.pcControlsHintText.textContent = textPc;
    } else if (getUseMobileGameUi() && inPortrait) {
      this.ui.pcControlsHintText.textContent = textMobileRotate;
    } else {
      return;
    }

    this.ui.pcControlsHint.classList.remove('hidden');
    this.pcControlsHintTimeout = w.setTimeout(() => {
      this.pcControlsHintTimeout = null;
      this.ui.pcControlsHint.classList.add('hidden');
    }, 5000);
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
    if (this.sessionGameMode === 'free') {
      recordFreeModePersonalBestIfBetter(total);
    }
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
    const kph = Math.round(this.speed * 3.6);
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

    const dt = Math.min(MAX_SIM_STEP_SEC, this.clock.getDelta());
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
        this.awaitingManualLaunch = true;
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
          this.awaitingManualLaunch = true;
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
        this.boardingUntilMs = nowTick + 850;
        this.showPassengerHud('up', 'Subiendo pasajero…');
        this.showSessionStartHintForInitialBoarding();
      }

      const canDrive = this.phase === 'racing';

      const steerInput = applyDeadzone(input.steer, HANDLING.steerDeadzone);

      if (canDrive) {
        const speedNorm = Math.min(1, Math.abs(this.speed) / maxSpeed);
        const steerInHz = isMouseAimInputActive() ? HANDLING.steerInMouseHz : HANDLING.steerInHz;
        const steerHz = Math.abs(steerInput) > 1e-3 ? steerInHz : HANDLING.steerReleaseHz;
        const steerTAlpha = 1 - Math.exp(-steerHz * dt);
        this.currentSteer = THREE.MathUtils.lerp(
          this.currentSteer,
          steerInput,
          Math.min(1, steerTAlpha),
        );

        const yawRate = THREE.MathUtils.lerp(HANDLING.yawRateLow, HANDLING.yawRateHigh, speedNorm);
        const speedDamping = 1 - speedNorm * HANDLING.highSpeedSteerDamping;
        this.bike.rotation.y -= this.currentSteer * yawRate * Math.max(0.45, speedDamping) * dt;

        // Asistencia arcade: al soltar dirección, recentra suavemente hacia la tangente de la ruta.
        if (Math.abs(steerInput) < 0.02 && Math.abs(this.speed) > HANDLING.recoverMinSpeed) {
          const tRoad = findTForWorldZ(this.bike.position.z);
          getRoadCenterline().getTangentAt(tRoad, this.steerAssistTangent);
          this.steerAssistTangent.y = 0;
          if (this.steerAssistTangent.lengthSq() > 1e-6) {
            this.steerAssistTangent.normalize();
            const desiredYaw = Math.atan2(this.steerAssistTangent.x, -this.steerAssistTangent.z);
            const assistHz = HANDLING.steerAssistBaseHz + HANDLING.steerAssistSpeedHz * speedNorm;
            const assistAlpha = 1 - Math.exp(-assistHz * dt);
            this.bike.rotation.y = lerpAngleRad(
              this.bike.rotation.y,
              desiredYaw,
              Math.min(1, assistAlpha),
            );
          }
        }
      } else {
        const relAlpha = 1 - Math.exp(-HANDLING.steerReleaseHz * dt);
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, 0, Math.min(1, relAlpha));
      }

      if (canDrive && input.brake > 0) {
        const b = brake * dt;
        this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - b);
      }

      if (canDrive && this.awaitingManualLaunch) {
        // Idle estricto: sin aceleración manual no hay movimiento residual ni auto-cruise.
        this.speed = 0;
        if (input.throttle > 0) {
          // Conserva el "feel" de arranque actual (launch speed), pero solo tras input del jugador.
          this.awaitingManualLaunch = false;
          this.speed = Math.max(this.speed, LAUNCH_SPEED_MPS);
        }
      }

      const canApplyDrivePhysics = canDrive && !this.awaitingManualLaunch;
      const throttle = canApplyDrivePhysics ? input.throttle : 0;
      if (canApplyDrivePhysics) {
        const steerMag = Math.abs(this.currentSteer);
        const speedNorm = Math.min(1, Math.abs(this.speed) / maxSpeed);
        this.speed += throttle * accel * dt;
        const rollDrag = throttle > 0 ? drag : drag * COAST_DRAG_MULT;
        this.speed *= Math.exp(-rollDrag * dt);
        if (steerMag > HANDLING.turnAssistStart) {
          const over = (steerMag - HANDLING.turnAssistStart) / (1 - HANDLING.turnAssistStart);
          const turnDrag = HANDLING.turnDragBase * over * (0.35 + speedNorm * 0.65);
          this.speed *= Math.exp(-turnDrag * dt);
        }
        this.speed = THREE.MathUtils.clamp(this.speed, -maxSpeed * 0.15, maxSpeed);
        if (input.brake < 0.01) {
          const cruiseTarget = Math.min(
            maxSpeed,
            CRUISE_SPEED_MPS * (1 - HANDLING.cruiseTurnPenalty * steerMag * speedNorm),
          );
          const cruiseAlpha = 1 - Math.exp(-CRUISE_CATCHUP_HZ * dt);
          if (this.speed < cruiseTarget) {
            this.speed = THREE.MathUtils.lerp(this.speed, cruiseTarget, Math.min(1, cruiseAlpha));
          }
        }
        if (throttle < 0.01 && Math.abs(this.speed) < COAST_STOP_SPEED_EPS) {
          this.speed = 0;
        }
      } else {
        this.speed *= Math.exp(-drag * 2.5 * dt);
        if (Math.abs(this.speed) < 0.04) this.speed = 0;
      }

      if (canApplyDrivePhysics) {
        // Solo desplazamiento hacia adelante en local: el arco del giro lo da yaw + translateZ
        // (el antiguo empuje en X con sin(yaw) sumaba derrape lateral falso y poco controlable al girar)
        this.bike.translateZ(-this.speed * dt);
        const speedNorm = Math.min(1, Math.abs(this.speed) / maxSpeed);
        const steerMag = Math.abs(this.currentSteer);
        if (steerMag > 0.08 && speedNorm > 0.22) {
          // Deslizamiento lateral suave para "feel" arcade sin romper colisiones/recorrido.
          const slipMps = -this.currentSteer * HANDLING.softSlipMps * speedNorm;
          this.bike.position.x += Math.cos(this.bike.rotation.y) * slipMps * dt;
          this.bike.position.z += Math.sin(this.bike.rotation.y) * slipMps * dt;
        }
      }

      let x = this.bike.position.x;
      let z = this.bike.position.z;
      if (canApplyDrivePhysics) {
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
              this.speed *= 0.15;
              // Force position update immediately
              this.bike.position.set(x, this.bike.position.y, z);
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
              this.speed *= 0.15;
              // Force position update immediately
              this.bike.position.set(x, this.bike.position.y, z);
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
        
        // Building collision check - prevent going through buildings
        if (Math.abs(x) > 11) {
          // Force vehicle back onto road
          x = Math.sign(x) * 10.5;
          this.speed *= 0.1;
          this.bike.position.set(x, this.bike.position.y, z);
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
      const steerAbs = Math.abs(this.currentSteer);
      const fromSteer = steerAbs * speedNorm * 0.64;
      const fromTurn = Math.min(1, Math.abs(yawRate) * 0.5) * speedNorm;
      const driftI = Math.min(1, fromSteer * 0.6 + fromTurn * 0.5);
      const minDr = 0.1;
      const isDrift = canDrive && Math.abs(this.speed) > 1.1 && driftI > minDr;
      if (isDrift) {
        const turnSign =
          steerAbs > 0.04
            ? Math.sign(this.currentSteer)
            : Math.abs(yawRate) > 0.07
              ? -Math.sign(yawRate)
              : 0;
        const targetZ = turnSign === 0 ? 0 : -turnSign * 0.12 * driftI;
        const la = 1 - Math.exp(-SMOOTH_LEAN_HZ * dt);
        this.bike.rotation.z = THREE.MathUtils.lerp(this.bike.rotation.z, targetZ, Math.min(1, la));
      } else {
        const l0 = 1 - Math.exp(-SMOOTH_LEAN_RESET_HZ * dt);
        this.bike.rotation.z = THREE.MathUtils.lerp(this.bike.rotation.z, 0, Math.min(1, l0));
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
    const camAlpha = 1 - Math.exp(-SMOOTH_CAMERA_FOLLOW_HZ * dt);
    this.camera.position.lerp(desiredCam, Math.min(1, camAlpha));
    this.camTarget
      .copy(this.bike.position)
      .add(forward.clone().multiplyScalar(this.cameraLook))
      .add(new THREE.Vector3(0, 1.1, 0));
    this.camera.lookAt(this.camTarget);

    this.nightSky?.update(this.camera);
    tickCityShaders(tSec);
    this.renderer.render(this.scene, this.camera);

    if (this.tiltDebugOverlay) {
      this.tiltDebugAccumMs += dt * 1000;
      if (this.tiltDebugAccumMs >= 100) {
        this.tiltDebugAccumMs = 0;
        this.refreshTiltDebugOverlay(input.steer);
      }
    }
  }

  private shouldShowTiltDebug(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).has('tiltdebug');
    } catch {
      return false;
    }
  }

  private mountTiltDebugOverlay(): void {
    if (this.tiltDebugOverlay || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'z-index:9999',
      'background:rgba(2,6,23,0.85)',
      'color:#a5f3fc',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'padding:8px 10px',
      'border:1px solid rgba(34,211,238,0.4)',
      'border-radius:8px',
      'pointer-events:none',
      'white-space:pre',
      'min-width:200px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    ].join(';');
    el.textContent = 'tilt debug…';
    document.body.appendChild(el);
    this.tiltDebugOverlay = el;
  }

  private refreshTiltDebugOverlay(finalSteer: number): void {
    const overlay = this.tiltDebugOverlay;
    if (!overlay) return;
    const info = getTiltDebugInfo();
    const ms = info.msSinceLastEvent;
    const since = ms < 0 ? 'never' : `${ms.toFixed(0)}ms`;
    overlay.textContent = [
      info.sensorActiveLabel,
      `tilt: ${info.on ? 'ON' : 'off'}  available:${info.available ? 'y' : 'n'}`,
      `attached: do=${info.relativeAttached ? 'y' : 'n'} doa=${info.absoluteAttached ? 'y' : 'n'}`,
      `events: ${info.eventCount}  src:${info.lastSrc ?? '-'}  last:${since}`,
      `raw: ${info.rawSteer.toFixed(3)}  filt: ${info.filteredSteer.toFixed(3)}`,
      `final steer: ${finalSteer.toFixed(3)}`,
    ].join('\n');
  }

  private removeTiltDebugOverlay(): void {
    if (this.tiltDebugOverlay) {
      this.tiltDebugOverlay.remove();
      this.tiltDebugOverlay = null;
    }
  }
}
