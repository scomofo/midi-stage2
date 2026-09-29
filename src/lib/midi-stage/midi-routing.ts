import { INSTRUMENTS, type Instrument, type Player } from "./types";

export type MidiSource = { inputId: string; channel: number };
export type MidiRoute = {
  mode: "auto" | "off" | "device";
  inputId: string;
  /** MIDI channels are numbered 1–16. Null accepts every channel. */
  channel: number | null;
  /**
   * Remembered device identity for a "device" assignment. The browser's opaque
   * input id can change when the OS MIDI backend underneath it changes (for
   * example across the Windows MIDI Services rollout), while the human-readable
   * name and manufacturer stay stable. Stored only to re-link the assignment.
   */
  inputName?: string;
  inputManufacturer?: string;
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
    const remembered: Pick<MidiRoute, "inputName" | "inputManufacturer"> = {};
    if (typeof route.inputName === "string" && route.inputName.trim()) {
      remembered.inputName = route.inputName.trim();
    }
    if (typeof route.inputManufacturer === "string" && route.inputManufacturer.trim()) {
      remembered.inputManufacturer = route.inputManufacturer.trim();
    }
    return { mode: "device", inputId: route.inputId, channel: route.channel as number | null, ...remembered };
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

/** A live input as reported by the browser's MIDI enumeration. */
export type MidiLiveInput = { id: string; name: string; manufacturer: string };
export type MidiRemap = { instrument: Instrument; name: string };

function identityMatches(route: MidiRoute, input: MidiLiveInput): boolean {
  const remembered = route.inputName?.trim();
  if (!remembered) return false;
  return input.name.trim() === remembered
    && input.manufacturer.trim() === (route.inputManufacturer ?? "").trim();
}

/**
 * Re-link saved per-device assignments after the browser's opaque device ids
 * change. When a stored input id is still live, the remembered name and
 * manufacturer are refreshed. When it is gone but exactly one live input
 * matches the remembered identity, the assignment follows it. Zero or several
 * matches leave the route untouched so the existing "disconnected device" UI
 * keeps asking the player to choose.
 */
export function remapMidiRouteInputIds(
  routes: MidiRoutes,
  liveInputs: readonly MidiLiveInput[],
): { routes: MidiRoutes; changed: boolean; remapped: MidiRemap[] } {
  const next: MidiRoutes = { ...routes };
  let changed = false;
  const remapped: MidiRemap[] = [];
  for (const instrument of INSTRUMENTS) {
    const route = next[instrument];
    if (route.mode !== "device") continue;
    const live = liveInputs.find((input) => input.id === route.inputId);
    if (live) {
      const name = live.name.trim();
      const manufacturer = live.manufacturer.trim();
      if (route.inputName !== name || (route.inputManufacturer ?? "") !== manufacturer) {
        next[instrument] = {
          ...route,
          inputName: name,
          ...(manufacturer ? { inputManufacturer: manufacturer } : {}),
        };
        changed = true;
      }
      continue;
    }
    const candidates = liveInputs.filter((input) => identityMatches(route, input));
    if (candidates.length !== 1) continue;
    const match = candidates[0];
    next[instrument] = { ...route, inputId: match.id };
    remapped.push({ instrument, name: match.name.trim() || "MIDI device" });
    changed = true;
  }
  return { routes: next, changed, remapped };
}
