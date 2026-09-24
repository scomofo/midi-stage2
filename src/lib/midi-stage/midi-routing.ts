import { INSTRUMENTS, type Instrument, type Player } from "./types";

export type MidiSource = { inputId: string; channel: number };
export type MidiRoute = {
  mode: "auto" | "off" | "device";
  inputId: string;
  /** MIDI channels are numbered 1–16. Null accepts every channel. */
  channel: number | null;
};
export type MidiRoutes = Record<Instrument, MidiRoute>;

export const MIDI_ROUTES_KEY = "midi-stage-midi-routes/v1";

export function defaultMidiRoutes(): MidiRoutes {
  return Object.fromEntries(
    INSTRUMENTS.map((instrument) => [instrument, { mode: "auto", inputId: "", channel: null }]),
  ) as MidiRoutes;
}

/** A physical strike belongs to one player, even when several parts are enabled. */
export function resolveMidiPlayer(
  players: readonly Player[],
  routes: MidiRoutes,
  source: MidiSource,
): Player | undefined {
  if (!Number.isInteger(source.channel) || source.channel < 1 || source.channel > 16) return;
  const enabled = players.filter((player) => player.enabled);
  const assigned = enabled.filter((player) => {
    const route = routes[player.id];
    return route.mode === "device" && route.inputId === source.inputId;
  });
  const exact = assigned.find((player) => routes[player.id].channel === source.channel);
  if (exact) return exact;
  const anyChannel = assigned.find((player) => routes[player.id].channel === null);
  if (anyChannel) return anyChannel;

  const automatic = enabled.filter((player) => routes[player.id].mode === "auto");
  return automatic.find((player) => source.channel === 10 ? player.type === "drums" : player.type !== "drums")
    ?? automatic[0];
}

function parseRoute(value: unknown): MidiRoute | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const route = value as Record<string, unknown>;
  if (route.mode !== "auto" && route.mode !== "off" && route.mode !== "device") return;
  if (route.channel !== null && (
    typeof route.channel !== "number" || !Number.isInteger(route.channel)
    || route.channel < 1 || route.channel > 16
  )) return;
  if (typeof route.inputId !== "string") return;
  if (route.mode === "device") {
    if (!route.inputId.trim()) return;
    // Preserve the browser's opaque device ID exactly, including punctuation.
    return { mode: "device", inputId: route.inputId, channel: route.channel as number | null };
  }
  return { mode: route.mode, inputId: "", channel: null };
}

export function loadMidiRoutes(storage?: Pick<Storage, "getItem">): MidiRoutes {
  const defaults = defaultMidiRoutes();
  try {
    const source = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!source) return defaults;
    const raw: unknown = JSON.parse(source.getItem(MIDI_ROUTES_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
    const data = raw as Record<string, unknown>;
    if (data.version !== 1 || !data.routes || typeof data.routes !== "object" || Array.isArray(data.routes)) return defaults;
    const saved = data.routes as Record<string, unknown>;
    for (const instrument of INSTRUMENTS) {
      defaults[instrument] = parseRoute(saved[instrument]) ?? defaults[instrument];
    }
  } catch {
    // Private browsing and malformed saves must not prevent playing.
  }
  return defaults;
}

export function saveMidiRoutes(routes: MidiRoutes, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return false;
    const normalized = defaultMidiRoutes();
    for (const instrument of INSTRUMENTS) {
      normalized[instrument] = parseRoute(routes[instrument]) ?? normalized[instrument];
    }
    target.setItem(MIDI_ROUTES_KEY, JSON.stringify({ version: 1, routes: normalized }));
    return true;
  } catch {
    return false;
  }
}
