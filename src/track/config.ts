import * as THREE from 'three';

export type CheckpointDef = {
  key: 'pupy' | 'papa' | 'mama';
  title: string;
  center: THREE.Vector3;
  radius: number;
  ringColor: number;
};

/**
 * Orden: Pupy → Papá → Mamá.
 * Ruta más larga con curvas en X (S suave) para abrir juego y evitar túnel recto.
 */
export const CHECKPOINTS: readonly CheckpointDef[] = [
  {
    key: 'pupy',
    title: 'Recoger a Pupy',
    center: new THREE.Vector3(-2.2, 0, -64),
    radius: 5.5,
    ringColor: 0x5cff9d,
  },
  {
    key: 'papa',
    title: 'Recoger a Papá (trabajo)',
    center: new THREE.Vector3(5.8, 0, -182),
    radius: 5.5,
    ringColor: 0x62b4ff,
  },
  {
    key: 'mama',
    title: 'Casa de mamá',
    center: new THREE.Vector3(-4, 0, -308),
    radius: 6.5,
    ringColor: 0xffcf5c,
  },
];

export type ObstacleMotion = {
  /** Extremos del recorrido en Z (dirección de la calle, ida y vuelta). */
  z0: number;
  z1: number;
  /** Velocidad a lo largo del tramo (m/s). */
  speed: number;
  /** Desfase 0–1 para que los coches no vayan al unísono. */
  phase01: number;
};

export type ObstacleDef = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** Circula por el tramo; si no hay, caja fija. */
  motion?: ObstacleMotion;
};

/**
 * Vehículos en calzada: reparto irregular en X/Z, tramos de marcha desincronizados.
 */
export const OBSTACLES: readonly ObstacleDef[] = [
  { min: new THREE.Vector3(-4.0, 0, -80.0), max: new THREE.Vector3(-1.9, 1.5, -77.2), motion: { z0: -88, z1: -72, speed: 3.0, phase01: 0.08 } },
  { min: new THREE.Vector3(3.9, 0, -95.0), max: new THREE.Vector3(6.0, 1.48, -92.2), motion: { z0: -102, z1: -86, speed: 2.6, phase01: 0.21 } },
  { min: new THREE.Vector3(-6.2, 0, -110.0), max: new THREE.Vector3(-4.0, 1.48, -107.2), motion: { z0: -118, z1: -100, speed: 3.2, phase01: 0.35 } },
  { min: new THREE.Vector3(1.3, 0, -128.0), max: new THREE.Vector3(3.4, 1.52, -125.2), motion: { z0: -135, z1: -119, speed: 2.5, phase01: 0.51 } },
  { min: new THREE.Vector3(-2.0, 0, -145.0), max: new THREE.Vector3(0.1, 1.5, -142.2), motion: { z0: -152, z1: -136, speed: 3.1, phase01: 0.12 } },
  { min: new THREE.Vector3(4.4, 0, -160.0), max: new THREE.Vector3(6.55, 1.51, -157.2), motion: { z0: -168, z1: -152, speed: 2.8, phase01: 0.64 } },
  { min: new THREE.Vector3(-5.2, 0, -175.0), max: new THREE.Vector3(-3.05, 1.5, -172.2), motion: { z0: -184, z1: -168, speed: 3.4, phase01: 0.19 } },
  { min: new THREE.Vector3(0.4, 0, -195.0), max: new THREE.Vector3(2.55, 1.5, -192.2), motion: { z0: -203, z1: -186, speed: 2.7, phase01: 0.41 } },
  { min: new THREE.Vector3(4.0, 0, -210.0), max: new THREE.Vector3(6.1, 1.5, -207.2), motion: { z0: -218, z1: -201, speed: 3.0, phase01: 0.77 } },
  { min: new THREE.Vector3(-1.0, 0, -224.0), max: new THREE.Vector3(1.1, 1.5, -221.2), motion: { z0: -232, z1: -216, speed: 2.4, phase01: 0.28 } },
  { min: new THREE.Vector3(-6.0, 0, -238.0), max: new THREE.Vector3(-3.85, 1.5, -235.2), motion: { z0: -247, z1: -230, speed: 3.3, phase01: 0.55 } },
  { min: new THREE.Vector3(1.0, 0, -256.0), max: new THREE.Vector3(3.15, 1.52, -253.2), motion: { z0: -264, z1: -248, speed: 2.6, phase01: 0.14 } },
  { min: new THREE.Vector3(4.4, 0, -270.0), max: new THREE.Vector3(6.55, 1.5, -267.2), motion: { z0: -278, z1: -262, speed: 2.9, phase01: 0.68 } },
  { min: new THREE.Vector3(-3.4, 0, -288.0), max: new THREE.Vector3(-1.25, 1.5, -285.2), motion: { z0: -296, z1: -280, speed: 3.1, phase01: 0.32 } },
  { min: new THREE.Vector3(0.2, 0, -300.0), max: new THREE.Vector3(2.35, 1.5, -297.2), motion: { z0: -308, z1: -291, speed: 2.5, phase01: 0.9 } },
  { min: new THREE.Vector3(-5.5, 0, -314.0), max: new THREE.Vector3(-3.35, 1.5, -311.2), motion: { z0: -322, z1: -306, speed: 2.2, phase01: 0.45 } },
  { min: new THREE.Vector3(3.4, 0, -70.0), max: new THREE.Vector3(5.55, 1.5, -67.2), motion: { z0: -78, z1: -62, speed: 3.5, phase01: 0.6 } },
  { min: new THREE.Vector3(-0.1, 0, -140.0), max: new THREE.Vector3(1.9, 1.5, -137.2), motion: { z0: -148, z1: -132, speed: 2.3, phase01: 0.7 } },
  { min: new THREE.Vector3(-4.0, 0, -252.0), max: new THREE.Vector3(-1.85, 1.5, -249.2), motion: { z0: -260, z1: -244, speed: 3.0, phase01: 0.02 } },
  { min: new THREE.Vector3(2.2, 0, -180.0), max: new THREE.Vector3(4.35, 1.5, -177.2), motion: { z0: -189, z1: -172, speed: 2.8, phase01: 0.38 } },
];

/** Centro Z del paso de cebra (2.º tramo, antes de la oficina de Papá). */
export const PEDESTRIAN_CROSSING_Z = -152;

/** Tramo en Z donde chocar con un peatón suma penalización al tiempo. */
export const PEDESTRIAN_ZONE_Z_MIN = PEDESTRIAN_CROSSING_Z - 10;
export const PEDESTRIAN_ZONE_Z_MAX = PEDESTRIAN_CROSSING_Z + 10;

/** Suma al cronómetro por cada contacto nuevo con vehículo u peatón (zona peatonal). */
export const CONTACT_TIME_PENALTY_MS = 10_000;

/**
 * Semáforos: `zOnRoute` se proyecta a la mediana; en estado verde (Fase 4) el tramo
 * no aplica colisión con coches móviles ni peatones.
 * `lateralMax`: ancho en m desde el eje de la vía; `side`: 1 dcha / -1 izq. del recorrido.
 */
export const TRAFFIC_LIGHTS: readonly {
  zOnRoute: number;
  zHalf: number;
  lateralMax: number;
  side: 1 | -1;
}[] = [
  { zOnRoute: -64, zHalf: 11, lateralMax: 9.0, side: 1 },
  { zOnRoute: PEDESTRIAN_CROSSING_Z, zHalf: 10, lateralMax: 9.0, side: -1 },
  { zOnRoute: -302, zHalf: 12, lateralMax: 9.0, side: 1 },
];

/** Time Attack: pista alargada → margen extra respecto a la versión corta. */
export const TIME_ATTACK_LIMIT_MS = 5 * 60 * 1000;

export const SPAWN = {
  position: new THREE.Vector3(0, 0.35, 4),
  /** Mirando hacia -Z (hacia la primera parada). */
  rotationY: 0,
};

/** Curva de dificultad / sensación de conducción (Fase 2). */
export const PHYS = {
  maxSpeed: 28.5,
  accel: 44,
  brake: 50,
  drag: 1.22,
  /** Fricción extra al salirse de calzada (acumulativa con `drag` en césped/arcén). */
  offRoadExtraDrag: 1.9,
  steerLow: 1.15,
  steerHigh: 2.05,
} as const;

/**
 * Impulsos: iconos 3D antes de cada parada; al pasar, sube el techo de velocidad unos segundos.
 */
export const TURBO = {
  pickupRadius: 1.65,
  durationMs: 5_000,
  /** Vmax mientras dura el turbo. */
  maxSpeedMult: 1.32,
} as const;

/**
 * Objetos turbo: posición en la ruta y **cuándo** pueden cogerse.
 * `minNextCheckpointIndex` en juego: `1` = ya completaste Pupy y vas hacia Papá; `2` = ya Papá, vas a Casa.
 * Así no se recoge turbo antes de subir a un pasajero ni se gasta mientras baja/sub en la parada.
 */
export const TURBO_PICKUP_DEFS: readonly {
  zOnRoute: number;
  minNextCheckpointIndex: number;
}[] = [
  { zOnRoute: -120, minNextCheckpointIndex: 1 },
  { zOnRoute: -242, minNextCheckpointIndex: 2 },
  { zOnRoute: -300, minNextCheckpointIndex: 2 },
];

/** Vista cenital del minimapa (mundo X-Z). */
export const MINIMAP = {
  xMin: -16,
  xMax: 16,
  zMin: -360,
  zMax: 12,
} as const;

export const PLAYER_RADIUS = 0.85;
export const WORLD_FLOOR_Y = 0;
