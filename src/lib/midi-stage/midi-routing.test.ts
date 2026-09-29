import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultMidiRoutes, loadMidiRoutes, MIDI_ROUTES_KEY, remapMidiRouteInputIds, resolveMidiPlayer, saveMidiRoutes,
  type MidiRoute,
} from "./midi-routing.ts";
import { INSTRUMENTS, type Player } from "./types.ts";

function players(...enabled: Player["id"][]): Player[] {
  return INSTRUMENTS.map((type) => ({ id: type, type, label: type, source: type, enabled: enabled.includes(type) }));
}

const device = (inputId: string, channel: number | null = null): MidiRoute => ({ mode: "device", inputId, channel });

describe("MIDI player routing", () => {
  it("routes automatic channel 10 to drums and melodic channels to the first melodic player", () => {
    const lineup = players("drums", "keys", "guitar", "bass");
    const routes = defaultMidiRoutes();
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 10 })?.id, "drums");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 1 })?.id, "keys");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 16 })?.id, "keys");
  });

  it("falls back to the solo automatic player regardless of channel", () => {
    const routes = defaultMidiRoutes();
    assert.equal(resolveMidiPlayer(players("keys"), routes, { inputId: "controller", channel: 10 })?.id, "keys");
    assert.equal(resolveMidiPlayer(players("drums"), routes, { inputId: "controller", channel: 1 })?.id, "drums");
  });

  it("gives exact device-channel assignments priority over wildcard assignments and automatic defaults", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device("controller");
    routes.guitar = device("controller", 10);
    const lineup = players("drums", "keys", "guitar");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 10 })?.id, "guitar");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 3 })?.id, "keys");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "different-controller", channel: 10 })?.id, "drums");
  });

  it("uses one deterministic player when device assignments overlap", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device("controller", 2);
    routes.guitar = device("controller", 2);
    const lineup = players("keys", "guitar");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: "controller", channel: 2 }), lineup[1]);
    assert.equal(resolveMidiPlayer([...lineup].reverse(), routes, { inputId: "controller", channel: 2 }), lineup[2]);
  });

  it("ignores disabled players and players with MIDI turned off", () => {
    const routes = defaultMidiRoutes();
    routes.drums = device("controller", 10);
    routes.keys = { mode: "off", inputId: "", channel: null };
    assert.equal(resolveMidiPlayer(players("keys", "guitar"), routes, { inputId: "controller", channel: 10 })?.id, "guitar");
    assert.equal(resolveMidiPlayer(players("keys"), routes, { inputId: "controller", channel: 1 }), undefined);
    assert.equal(resolveMidiPlayer(players(), routes, { inputId: "controller", channel: 1 }), undefined);
  });

  it("matches opaque device IDs exactly and never replaces a saved device with another", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device('keys:"usb":1', 2);
    const lineup = players("keys");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: 'keys:"usb":1', channel: 2 })?.id, "keys");
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: 'keys:"usb":2', channel: 2 }), undefined);
    assert.equal(resolveMidiPlayer(lineup, routes, { inputId: 'keys:"usb":1', channel: 3 }), undefined);
  });

  it("rejects channels outside the MIDI range", () => {
    for (const channel of [0, 17, -1, 1.5, NaN, Infinity]) {
      assert.equal(resolveMidiPlayer(players("keys"), defaultMidiRoutes(), { inputId: "controller", channel }), undefined);
    }
  });
});

describe("saved MIDI routing", () => {
  it("round trips device and channel assignments without requiring connected devices", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device('saved:"device":id', 16);
    routes.drums = device("drum-kit");
    routes.guitar = { mode: "off", inputId: "", channel: null };
    let value = "";
    const stored = saveMidiRoutes(routes, { setItem(key, saved) { assert.equal(key, MIDI_ROUTES_KEY); value = saved; } });
    assert.equal(stored, true);
    assert.deepEqual(loadMidiRoutes({ getItem(key) { assert.equal(key, MIDI_ROUTES_KEY); return value; } }), routes);
  });

  it("recovers invalid entries independently while retaining valid assignments", () => {
    const invalid: unknown[] = [
      null, [], "auto", {}, { mode: "unknown", inputId: "keys", channel: 1 },
      device(""), device("  "), device("keys", 0), device("keys", 17), device("keys", 1.5),
      { mode: "device", inputId: 4, channel: 1 },
      { mode: "device", inputId: "keys", channel: "1" },
      { mode: "device", inputId: "keys" },
    ];
    for (const keys of invalid) {
      const loaded = loadMidiRoutes({ getItem: () => JSON.stringify({ version: 1, routes: { keys, drums: device("kit", 10) } }) });
      assert.deepEqual(loaded.keys, defaultMidiRoutes().keys);
      assert.deepEqual(loaded.drums, device("kit", 10));
    }
  });

  it("returns fresh defaults for missing, malformed, or unsupported saves", () => {
    for (const value of [null, "{", "null", "[]", "4", JSON.stringify({ version: 2, routes: { keys: device("keys") } })]) {
      assert.deepEqual(loadMidiRoutes({ getItem: () => value }), defaultMidiRoutes());
    }
    const first = defaultMidiRoutes();
    first.keys.mode = "off";
    assert.equal(first.drums.mode, "auto");
    assert.equal(defaultMidiRoutes().keys.mode, "auto");
  });

  it("keeps storage failures from interrupting play", () => {
    assert.deepEqual(loadMidiRoutes({ getItem() { throw new Error("blocked"); } }), defaultMidiRoutes());
    assert.equal(saveMidiRoutes(defaultMidiRoutes(), { setItem() { throw new Error("quota"); } }), false);
  });
});

describe("MIDI device id remapping", () => {
  const live = (id: string, name: string, manufacturer = "") => ({ id, name, manufacturer });
  const namedDevice = (inputId: string, inputName: string, inputManufacturer = ""): MidiRoute => ({
    mode: "device", inputId, channel: null, inputName, ...(inputManufacturer ? { inputManufacturer } : {}),
  });

  it("remembers the device identity while the stored id is still live", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device("new-id");
    const result = remapMidiRouteInputIds(routes, [live("new-id", "KeyLab 49", "Arturia")]);
    assert.equal(result.changed, true);
    assert.deepEqual(result.remapped, []);
    assert.equal(result.routes.keys.inputId, "new-id");
    assert.equal(result.routes.keys.inputName, "KeyLab 49");
    assert.equal(result.routes.keys.inputManufacturer, "Arturia");
  });

  it("re-links a saved assignment when exactly one live input matches the remembered identity", () => {
    const routes = defaultMidiRoutes();
    routes.keys = namedDevice("old-id", "KeyLab 49", "Arturia");
    const result = remapMidiRouteInputIds(routes, [live("fresh-id", "KeyLab 49", "Arturia")]);
    assert.equal(result.changed, true);
    assert.equal(result.routes.keys.inputId, "fresh-id");
    assert.deepEqual(result.remapped, [{ instrument: "keys", name: "KeyLab 49" }]);
  });

  it("leaves the assignment alone when no live input matches the remembered identity", () => {
    const routes = defaultMidiRoutes();
    routes.keys = namedDevice("old-id", "KeyLab 49", "Arturia");
    const result = remapMidiRouteInputIds(routes, [live("other-id", "Launchpad", "Novation")]);
    assert.equal(result.changed, false);
    assert.equal(result.routes.keys.inputId, "old-id");
    assert.deepEqual(result.remapped, []);
  });

  it("leaves the assignment alone when several live inputs match the remembered identity", () => {
    const routes = defaultMidiRoutes();
    routes.keys = namedDevice("old-id", "USB MIDI", "");
    const result = remapMidiRouteInputIds(routes, [
      live("a", "USB MIDI", ""),
      live("b", "USB MIDI", ""),
    ]);
    assert.equal(result.changed, false);
    assert.equal(result.routes.keys.inputId, "old-id");
  });

  it("never re-links a device assignment that has no remembered identity", () => {
    const routes = defaultMidiRoutes();
    routes.keys = device("old-id");
    const result = remapMidiRouteInputIds(routes, [live("fresh-id", "KeyLab 49", "Arturia")]);
    assert.equal(result.changed, false);
    assert.equal(result.routes.keys.inputId, "old-id");
  });

  it("round-trips the remembered identity through save and load", () => {
    const routes = defaultMidiRoutes();
    routes.keys = namedDevice("id-1", "KeyLab 49", "Arturia");
    let saved = "";
    assert.equal(saveMidiRoutes(routes, { setItem: (_key, value) => { saved = value; } }), true);
    const loaded = loadMidiRoutes({ getItem: () => saved });
    assert.equal(loaded.keys.inputName, "KeyLab 49");
    assert.equal(loaded.keys.inputManufacturer, "Arturia");
    assert.equal(loaded.keys.inputId, "id-1");
  });

  it("ignores automatic and off assignments", () => {
    const routes = defaultMidiRoutes();
    const result = remapMidiRouteInputIds(routes, [live("x", "KeyLab 49", "Arturia")]);
    assert.equal(result.changed, false);
    assert.deepEqual(result.remapped, []);
  });
});
