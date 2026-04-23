import type { BikeStyle } from '../game/bikeModels';
import { getSupabase, isSupabaseConfigured } from './supabase';

export { isSupabaseConfigured } from './supabase';

const MAX_TIME_MS = 24 * 60 * 60 * 1000;

export type SaveRaceRunResult = { ok: true } | { ok: false; reason: 'not_configured' | 'error'; message?: string };

/**
 * Registra un tiempo de carrera en `race_runs` (Supabase).
 * Campos alineados con `Plan_Trabajo_Mototaxi_Runner.pdf`: total, splits (desempate), sala opcional.
 * Si no hay `VITE_SUPABASE_*` en `.env`, no hace nada (modo 100% local).
 */
export async function saveRaceRunToSupabase(input: {
  timeMs: number;
  bikeStyle: BikeStyle;
  /** Ms acumulados al completar Pupy; null si no aplica. */
  splitPupyMs: number | null;
  /** Ms acumulados al completar Papá. */
  splitPapaMs: number | null;
  /** Fase 3: carrera en sala; null = práctica local. */
  roomId: string | null;
}): Promise<SaveRaceRunResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  const sb = getSupabase();
  if (!sb) {
    return { ok: false, reason: 'not_configured' };
  }
  const time_ms = Math.round(
    Math.min(Math.max(0, input.timeMs), MAX_TIME_MS),
  );
  const sp = input.splitPupyMs;
  const sa = input.splitPapaMs;
  const row: Record<string, unknown> = {
    time_ms,
    bike_style: input.bikeStyle,
  };
  if (input.roomId) row['room_id'] = input.roomId;
  if (sp !== null && sa !== null) {
    row['split_pupy_ms'] = Math.round(Math.min(Math.max(0, sp), MAX_TIME_MS));
    row['split_papa_ms'] = Math.round(Math.min(Math.max(0, sa), MAX_TIME_MS));
  }
  const { error } = await sb.from('race_runs').insert(row);
  if (error) {
    return { ok: false, reason: 'error', message: error.message };
  }
  return { ok: true };
}
