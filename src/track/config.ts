import * as THREE from 'three';

export type CheckpointDef = {
  key: 'pupy' | 'papa' | 'mama';
  title: string;
  center: THREE.Vector3;
  radius: number;
  ringColor: number;
};

/** Orden fijo: Pupy → Papá → Mamá. Pista alargada (~2× tramo anterior en -Z). */
export const CHECKPOINTS: readonly CheckpointDef[] = [
  {
    key: 'pupy',
    title: 'Recoger a Pupy',
    center: new THREE.Vector3(0, 0, -52),
    radius: 5.5,
    ringColor: 0x5cff9d,
  },
  {
    key: 'papa',
    title: 'Recoger a Papá (trabajo)',
    center: new THREE.Vector3(7, 0, -118),
    radius: 5.5,
    ringColor: 0x62b4ff,
  },
  {
    key: 'mama',
    title: 'Casa de mamá',
    center: new THREE.Vector3(-6, 0, -198),
    radius: 6.5,
    ringColor: 0xffcf5c,
  },
];

export type ObstacleDef = {
  min: THREE.Vector3;
  max: THREE.Vector3;
};

/** Coches aparcados / averiados; colocados para cerrar carriles. */
export const OBSTACLES: readonly ObstacleDef[] = [
  { min: new THREE.Vector3(-1.05, 0, -56.5), max: new THREE.Vector3(1.05, 1.48, -53.5) },
  { min: new THREE.Vector3(4.0, 0, -68.8), max: new THREE.Vector3(6.85, 1.52, -66.0) },
  { min: new THREE.Vector3(-6.75, 0, -79.3), max: new THREE.Vector3(-4.05, 1.46, -76.5) },
  { min: new THREE.Vector3(2.45, 0, -91.2), max: new THREE.Vector3(5.25, 1.53, -88.4) },
  { min: new THREE.Vector3(-5.55, 0, -103.0), max: new THREE.Vector3(-2.75, 1.47, -100.2) },
  { min: new THREE.Vector3(-0.95, 0, -114.8), max: new THREE.Vector3(0.95, 1.49, -112.0) },
  { min: new THREE.Vector3(4.45, 0, -126.3), max: new THREE.Vector3(7.15, 1.51, -123.5) },
  { min: new THREE.Vector3(-6.55, 0, -145.0), max: new THREE.Vector3(-3.85, 1.48, -142.2) },
  { min: new THREE.Vector3(0.75, 0, -157.2), max: new THREE.Vector3(3.55, 1.54, -154.4) },
  { min: new THREE.Vector3(-4.25, 0, -169.0), max: new THREE.Vector3(-1.45, 1.47, -166.2) },
  { min: new THREE.Vector3(4.95, 0, -181.0), max: new THREE.Vector3(7.75, 1.52, -178.2) },
  { min: new THREE.Vector3(-1.1, 0, -193.0), max: new THREE.Vector3(1.1, 1.5, -190.2) },
  { min: new THREE.Vector3(-5.85, 0, -205.0), max: new THREE.Vector3(-3.05, 1.48, -202.2) },
];

/** Centro Z del paso de cebra + ampliación peatonal (figuras animadas en `MotoGame`). */
export const PEDESTRIAN_CROSSING_Z = -133;

/** Tramo en Z donde chocar con un peatón suma penalización al tiempo. */
export const PEDESTRIAN_ZONE_Z_MIN = PEDESTRIAN_CROSSING_Z - 10;
export const PEDESTRIAN_ZONE_Z_MAX = PEDESTRIAN_CROSSING_Z + 10;

/** Suma al cronómetro por cada contacto nuevo con vehículo u peatón (zona peatonal). */
export const CONTACT_TIME_PENALTY_MS = 10_000;

export const SPAWN = {
  position: new THREE.Vector3(0, 0.35, 4),
  /** Mirando hacia -Z (hacia la primera parada). */
  rotationY: 0,
};

/** Curva de dificultad / sensación de conducción (Fase 2). */
export const PHYS = {
  maxSpeed: 24.5,
  accel: 31,
  brake: 50,
  drag: 1.52,
  steerLow: 1.15,
  steerHigh: 2.05,
} as const;

/** Vista cenital del minimapa (mundo X-Z). */
export const MINIMAP = {
  xMin: -14,
  xMax: 14,
  zMin: -215,
  zMax: 10,
} as const;

/** Línea de recorrido previsto (salida → paradas) para el mapita. */
export const ROUTE_PREVIEW_XZ: ReadonlyArray<{ x: number; z: number }> = [
  { x: SPAWN.position.x, z: SPAWN.position.z },
  ...CHECKPOINTS.map((c) => ({ x: c.center.x, z: c.center.z })),
];

export const PLAYER_RADIUS = 0.85;
export const WORLD_FLOOR_Y = 0;
