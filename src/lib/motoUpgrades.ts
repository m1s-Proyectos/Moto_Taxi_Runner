import { PHYS, TURBO } from '../track/config';
import { readStoredBikeStyle, writeStoredBikeStyle, type BikeStyle } from '../game/bikeModels';
import { trySpendCoins } from './coinWallet';

/** Identificadores de mejora (persisten en localStorage). */
export type UpgradeId = 'tires' | 'turbo' | 'tail' | 'engine' | 'suspension';

export const UPGRADE_IDS: readonly UpgradeId[] = ['tires', 'turbo', 'tail', 'engine', 'suspension'];

export const UPGRADE_MAX_LEVEL = 5;

const STORAGE_KEY = 'mtr_garage_progress_v1';

export type UpgradeLevels = Record<UpgradeId, number>;

export type GarageProgressV1 = {
  v: 1;
  levels: UpgradeLevels;
  /** Estilo de moto equipado (sincroniza con `readStoredBikeStyle`). */
  bikeStyle: BikeStyle;
};

const DEFAULT_LEVELS: UpgradeLevels = {
  tires: 0,
  turbo: 0,
  tail: 0,
  engine: 0,
  suspension: 0,
};

/**
 * Coste para pasar de nivel L a L+1 (índice 0 = comprar nivel 1).
 * Mínimo 100 en el primer escalón; cada nivel cuesta más que el anterior en la misma línea.
 */
export const UPGRADE_COSTS: Record<UpgradeId, readonly [number, number, number, number, number]> = {
  tires: [100, 175, 265, 380, 520],
  turbo: [125, 210, 315, 450, 620],
  tail: [100, 170, 260, 375, 530],
  engine: [110, 190, 290, 415, 565],
  suspension: [100, 172, 268, 388, 535],
};

export const UPGRADE_LABELS: Record<
  UpgradeId,
  { title: string; short: string; perks: string[] }
> = {
  tires: {
    title: 'Neumáticos',
    short: 'Grip y giro',
    perks: ['Más agarre en curvas', 'Menos frenado al girar', 'Mejor respuesta lateral'],
  },
  turbo: {
    title: 'Turbo',
    short: 'Pico de velocidad',
    perks: ['Mayor techo con turbo activo', 'Más brillo FX al nitro', 'Ligero extra al coger pickup'],
  },
  tail: {
    title: 'Cola / escape',
    short: 'Estilo + empuje',
    perks: ['Humo de escape estilizado', 'Pequeño plus de aceleración', 'Look más arcade'],
  },
  engine: {
    title: 'Motor',
    short: 'Respuesta',
    perks: ['Mejor aceleración', 'Arranque más vivo', 'Mantiene velocidad con menos esfuerzo'],
  },
  suspension: {
    title: 'Suspensión',
    short: 'Estabilidad',
    perks: ['Menos derrape lateral', 'Menos castigo fuera de asfalto', 'Inclinación más controlada'],
  },
};

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(UPGRADE_MAX_LEVEL, Math.floor(n)));
}

function isBikeStyle(v: unknown): v is BikeStyle {
  return v === 'classic' || v === 'urban';
}

/** Lee progreso guardado; migra estilo desde la clave legacy si hace falta. */
export function loadGarageProgress(): GarageProgressV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<GarageProgressV1>;
      if (o && o.v === 1 && o.levels && typeof o.levels === 'object') {
        const levels = { ...DEFAULT_LEVELS };
        for (const id of UPGRADE_IDS) {
          levels[id] = clampLevel(Number((o.levels as UpgradeLevels)[id]));
        }
        const bikeStyle = isBikeStyle(o.bikeStyle) ? o.bikeStyle : readStoredBikeStyle();
        return { v: 1, levels, bikeStyle };
      }
    }
  } catch {
    /* ignore */
  }
  return { v: 1, levels: { ...DEFAULT_LEVELS }, bikeStyle: readStoredBikeStyle() };
}

export function saveGarageProgress(p: GarageProgressV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    writeStoredBikeStyle(p.bikeStyle);
  } catch {
    /* quota */
  }
}

/** Coste de la siguiente mejora, o `null` si ya está al máximo. */
export function getNextUpgradeCost(id: UpgradeId, currentLevel: number): number | null {
  const lv = clampLevel(currentLevel);
  if (lv >= UPGRADE_MAX_LEVEL) return null;
  return UPGRADE_COSTS[id][lv]!;
}

export type PurchaseResult =
  | { ok: true; newLevel: number; coinsRemaining: number }
  | { ok: false; reason: 'max_level' | 'not_enough_coins' };

/**
 * Sube un nivel de mejora si hay monedas; persiste cartera y garaje.
 * @param getCoins lector actual del saldo (p. ej. `getCoinWallet`).
 */
export function purchaseUpgradeLevel(
  id: UpgradeId,
  getCoins: () => number,
): PurchaseResult {
  const prog = loadGarageProgress();
  const cur = clampLevel(prog.levels[id]);
  if (cur >= UPGRADE_MAX_LEVEL) return { ok: false, reason: 'max_level' };
  const cost = UPGRADE_COSTS[id][cur]!;
  const wallet = getCoins();
  if (wallet < cost) return { ok: false, reason: 'not_enough_coins' };
  if (!trySpendCoins(cost)) return { ok: false, reason: 'not_enough_coins' };
  prog.levels[id] = cur + 1;
  saveGarageProgress(prog);
  return { ok: true, newLevel: prog.levels[id], coinsRemaining: getCoins() };
}

export function setGarageBikeStyle(style: BikeStyle): void {
  const prog = loadGarageProgress();
  prog.bikeStyle = style;
  saveGarageProgress(prog);
}

/**
 * Valores efectivos para la simulación (base del juego + mejoras acumuladas).
 * Los multipliers de manejo se aplican sobre el perfil `arcade` en `MotoGame`.
 */
export type RideTuningSnapshot = {
  maxSpeed: number;
  accel: number;
  brake: number;
  drag: number;
  offRoadExtraDrag: number;
  /** Multiplicador del turbo de pickup (sobre `TURBO.maxSpeedMult`). */
  turboMaxSpeedMult: number;
  yawRateMult: number;
  turnDragMult: number;
  softSlipMult: number;
  /** Resta a `HANDLING.highSpeedSteerDamping` (más agarre = menos amortiguación alta). */
  steerDampingSubtract: number;
  leanResetMult: number;
  launchSpeedAdd: number;
  /** 0–5: intensidad humo escape. */
  exhaustTier: number;
  /** 0–5: intensidad resplandor turbo. */
  turboVfxTier: number;
};

/**
 * Construye el tuning a partir de niveles 0–5 por categoría.
 * Bonificaciones acotadas (~12–15% combinado) para no romper balance.
 */
export function buildRideTuningFromLevels(levels: UpgradeLevels): RideTuningSnapshot {
  const te = clampLevel(levels.tires);
  const tu = clampLevel(levels.turbo);
  const ta = clampLevel(levels.tail);
  const en = clampLevel(levels.engine);
  const su = clampLevel(levels.suspension);

  const engineAccel = 1 + en * 0.018 + ta * 0.008;
  const engineLaunch = en * 0.35 + ta * 0.15;

  const tireYaw = 1 + te * 0.014;
  const tireTurn = Math.max(0.72, 1 - te * 0.055);

  const turboMult = TURBO.maxSpeedMult + tu * 0.014;

  const suspSlip = Math.max(0.62, 1 - su * 0.07);
  const suspOff = Math.max(0.78, 1 - su * 0.042);
  const suspLean = 1 + su * 0.09;
  const suspDampSub = su * 0.028;

  const maxSpeed =
    PHYS.maxSpeed + en * 0.38 + tu * 0.42 + ta * 0.12 + te * 0.22 + su * 0.15;

  return {
    maxSpeed,
    accel: PHYS.accel * engineAccel,
    brake: PHYS.brake * (1 + te * 0.04 + su * 0.035),
    drag: PHYS.drag * (1 - en * 0.012 - ta * 0.006),
    offRoadExtraDrag: PHYS.offRoadExtraDrag * suspOff,
    turboMaxSpeedMult: turboMult,
    yawRateMult: tireYaw,
    turnDragMult: tireTurn,
    softSlipMult: suspSlip,
    steerDampingSubtract: suspDampSub,
    leanResetMult: suspLean,
    launchSpeedAdd: engineLaunch,
    exhaustTier: ta,
    turboVfxTier: tu,
  };
}

export function getRideTuningForCurrentGarage(): RideTuningSnapshot {
  return buildRideTuningFromLevels(loadGarageProgress().levels);
}

/** Stats legibles para HUD del taller (antes = sin siguiente nivel / con nivel actual). */
export type StatRow = { key: string; label: string; before: number; after: number; unit: string };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildStatRowsForLevels(levels: UpgradeLevels, previewAfterPurchase: UpgradeId | null): StatRow[] {
  const beforeSnap = buildRideTuningFromLevels(levels);
  let afterLevels = levels;
  if (previewAfterPurchase) {
    const cur = clampLevel(levels[previewAfterPurchase]);
    if (cur < UPGRADE_MAX_LEVEL) {
      afterLevels = {
        ...levels,
        [previewAfterPurchase]: cur + 1,
      };
    }
  }
  const afterSnap = buildRideTuningFromLevels(afterLevels);
  const km = (mps: number) => round1(mps * 3.6);
  return [
    {
      key: 'vmax',
      label: 'V. máx.',
      before: km(beforeSnap.maxSpeed),
      after: km(afterSnap.maxSpeed),
      unit: 'km/h',
    },
    {
      key: 'accel',
      label: 'Aceleración',
      before: round1(beforeSnap.accel),
      after: round1(afterSnap.accel),
      unit: 'u.',
    },
    {
      key: 'brake',
      label: 'Frenado',
      before: round1(beforeSnap.brake),
      after: round1(afterSnap.brake),
      unit: 'u.',
    },
    {
      key: 'turbo',
      label: 'Turbo (×)',
      before: round2(beforeSnap.turboMaxSpeedMult),
      after: round2(afterSnap.turboMaxSpeedMult),
      unit: '×',
    },
    {
      key: 'grip',
      label: 'Giro / grip',
      before: round2(beforeSnap.yawRateMult * beforeSnap.turnDragMult),
      after: round2(afterSnap.yawRateMult * afterSnap.turnDragMult),
      unit: 'idx',
    },
    {
      key: 'stab',
      label: 'Estabilidad',
      before: round2(beforeSnap.softSlipMult * (1.1 - beforeSnap.steerDampingSubtract)),
      after: round2(afterSnap.softSlipMult * (1.1 - afterSnap.steerDampingSubtract)),
      unit: 'idx',
    },
  ];
}
