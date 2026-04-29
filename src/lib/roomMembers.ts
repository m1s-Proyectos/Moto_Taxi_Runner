import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

export type RoomMemberRow = {
  id: string;
  room_code: string;
  player_id: string;
  display_name: string | null;
  joined_at: string;
};

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(): string {
  let out = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 4; i++) out += CODE_CHARS[buf[i]! % CODE_CHARS.length]!;
  } else {
    for (let i = 0; i < 4; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  }
  return out;
}

/** Sin espacios; útil para copiar / unirse. */
export function normalizeRoomCodeInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, 4);
}

/** Presentación con espacios: `X Y Z W`. */
export function formatRoomCodeDisplay(code: string): string {
  const c = normalizeRoomCodeInput(code);
  return c.length === 4 ? `${c[0]} ${c[1]} ${c[2]} ${c[3]}` : code;
}

async function countMembersForCode(roomCode: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) return -1;
  const code = normalizeRoomCodeInput(roomCode);
  const { count, error } = await sb
    .from('room_members')
    .select('id', { count: 'exact', head: true })
    .eq('room_code', code);
  if (error) return -1;
  return count ?? 0;
}

/**
 * Crea una sala nueva: código aleatorio que no exista en la tabla, inserta al jugador.
 */
export async function createRoomAndJoin(params: {
  playerId: string;
  displayName: string;
}): Promise<{ ok: true; roomCode: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase no configurado' };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Cliente Supabase no disponible' };

  for (let attempt = 0; attempt < 24; attempt++) {
    const roomCode = generateRoomCode();
    const n = await countMembersForCode(roomCode);
    if (n < 0) {
      return { ok: false, message: 'No se pudo reservar un código de sala (Supabase).' };
    }
    if (n !== 0) continue;

    const { error } = await sb.from('room_members').insert({
      room_code: roomCode,
      player_id: params.playerId,
      display_name: params.displayName,
    });

    if (!error) return { ok: true, roomCode };

    if (error.code === '23505') continue;
    return { ok: false, message: error.message };
  }

  return { ok: false, message: 'No se pudo generar un código de sala libre.' };
}

/**
 * Unirse a una sala existente por código (otro cliente / segunda pestaña).
 */
export async function joinRoomByCode(params: {
  roomCode: string;
  playerId: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase no configurado' };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Cliente Supabase no disponible' };

  const room_code = normalizeRoomCodeInput(params.roomCode);
  if (room_code.length !== 4) {
    return { ok: false, message: 'El código debe tener 4 caracteres.' };
  }

  const { error } = await sb.from('room_members').insert({
    room_code,
    player_id: params.playerId,
    display_name: params.displayName,
  });

  if (!error) return { ok: true };
  if (error.code === '23505') return { ok: false, message: 'Ya estás en esa sala.' };
  return { ok: false, message: error.message };
}

/** Evento Broadcast (Realtime) para sincronizar el arranque entre clientes. */
export const START_RACE_BROADCAST_EVENT = 'START_EVENT';

/** Evento Broadcast para sincronizar posición de la moto en tiempo real (10 fps). */
export const POSITION_BROADCAST_EVENT = 'POSITION';

/** Datos de posición enviados por broadcast cada 100 ms por cada cliente. */
export type PlayerPositionPayload = {
  /** player_id del emisor (para ignorar la posición propia). */
  pid: string;
  x: number;
  y: number;
  z: number;
  /** bike.rotation.y en radianes. */
  ry: number;
};

/** El anfitrión es el jugador con `joined_at` más antiguo en la sala. */
export function isRoomHost(members: RoomMemberRow[], selfId: string): boolean {
  if (members.length === 0) return false;
  const sorted = [...members].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
  );
  return sorted[0]!.player_id === selfId;
}

export async function fetchRoomMembers(roomCode: string): Promise<RoomMemberRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const code = normalizeRoomCodeInput(roomCode);
  const { data, error } = await sb
    .from('room_members')
    .select('id,room_code,player_id,display_name,joined_at')
    .eq('room_code', code)
    .order('joined_at', { ascending: true });

  if (error || !data) return [];
  return data as RoomMemberRow[];
}

export async function leaveRoomMember(roomCode: string, playerId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const code = normalizeRoomCodeInput(roomCode);
  await sb.from('room_members').delete().eq('room_code', code).eq('player_id', playerId);
}

export type RoomSyncCallbacks = {
  onMembersChange: (members: RoomMemberRow[]) => void;
  /** Todos los clientes en la sala (incl. anfitrión con `broadcast.self`). */
  onStartRaceBroadcast?: () => void;
};

export type RoomSyncHandle = {
  unsubscribe: () => void;
  sendStartRace: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Fire-and-forget: emite la posición local al canal de la sala. */
  sendPosition: (payload: PlayerPositionPayload) => void;
  /**
   * Registra (o elimina) el manejador que recibe las posiciones de otros jugadores.
   * Llamar con `null` desactiva la recepción (ej. al salir de la partida).
   */
  setPositionHandler: (fn: ((payload: PlayerPositionPayload) => void) | null) => void;
};

/**
 * Un solo canal Realtime: cambios en `room_members` + Broadcast `START_EVENT` para arranque sincronizado.
 */
export function subscribeToRoomSync(roomCode: string, callbacks: RoomSyncCallbacks): RoomSyncHandle | null {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured()) return null;

  const code = normalizeRoomCodeInput(roomCode);
  const filter = `room_code=eq.${code}`;

  const refresh = async (): Promise<void> => {
    const members = await fetchRoomMembers(code);
    callbacks.onMembersChange(members);
  };

  let positionHandler: ((payload: PlayerPositionPayload) => void) | null = null;

  const channel: RealtimeChannel = sb
    .channel(`mtr_room:${code}`, {
      config: { broadcast: { self: true } },
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_members', filter },
      () => {
        void refresh();
      },
    )
    .on('broadcast', { event: START_RACE_BROADCAST_EVENT }, () => {
      callbacks.onStartRaceBroadcast?.();
    })
    .on('broadcast', { event: POSITION_BROADCAST_EVENT }, ({ payload }: { payload: unknown }) => {
      if (positionHandler && payload && typeof payload === 'object') {
        positionHandler(payload as PlayerPositionPayload);
      }
    })
    .subscribe();

  void refresh();

  return {
    unsubscribe: () => {
      positionHandler = null;
      void sb.removeChannel(channel);
    },
    sendStartRace: async () => {
      const status = await channel.send({
        type: 'broadcast',
        event: START_RACE_BROADCAST_EVENT,
        payload: { ts: Date.now() },
      });
      if (status === 'error' || status === 'timed out') {
        return { ok: false, message: 'No se pudo enviar la señal de inicio.' };
      }
      return { ok: true };
    },
    sendPosition: (payload: PlayerPositionPayload) => {
      void channel.send({
        type: 'broadcast',
        event: POSITION_BROADCAST_EVENT,
        payload,
      });
    },
    setPositionHandler: (fn) => {
      positionHandler = fn;
    },
  };
}
