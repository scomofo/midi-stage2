import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MidiNotes } from "./midi-notes.ts";
import type { MidiSource } from "../../lib/midi-stage/midi-routing.ts";

function setup() {
  const notes = new MidiNotes();
  const held = new Map<string, number>();
  const released: string[] = [];
  const sources: MidiSource[] = [];
  const callbacks = {
    onNoteOn: (note: number, _velocity: number, token: string, source: MidiSource) => {
      held.set(token, note);
      sources.push(source);
    },
    onNoteOff: (token: string) => {
      held.delete(token);
      released.push(token);
    },
  };
  const send = (id: string, ...data: number[]) =>
    notes.message(id, Uint8Array.from(data), callbacks);
  return { notes, held, released, sources, callbacks, send };
}

describe("MIDI held notes", () => {
  it("passes opaque input identity and one-based channels to each strike", () => {
    const { sources, send } = setup();
    send('keys:"usb":1', 0x90, 60, 100);
    send("pads", 0x99, 36, 90);
    send("keys", 0x9f, 67, 80);
    assert.deepEqual(sources, [
      { inputId: 'keys:"usb":1', channel: 1 },
      { inputId: "pads", channel: 10 },
      { inputId: "keys", channel: 16 },
    ]);
  });

  it("keeps matching pitches separate across devices and channels", () => {
    const { held, send } = setup();
    send("keys", 0x90, 60, 100);
    send("keys", 0x91, 60, 90);
    send("pads", 0x90, 60, 80);
    assert.equal(held.size, 3);
    send("keys", 0x80, 60, 64);
    assert.equal(held.size, 2);
    send("keys", 0x91, 60, 0);
    assert.equal(held.size, 1);
    assert.equal([...held.keys()][0], 'midi:"pads":0:60');
  });

  it("releases only the disconnected input and permits a fresh reconnect", () => {
    const { notes, held, released, callbacks, send } = setup();
    send("keys", 0x90, 60, 100);
    send("keys", 0x91, 64, 100);
    send("pads", 0x90, 36, 100);
    notes.releaseInput("keys", callbacks.onNoteOff);
    assert.equal(released.length, 2);
    assert.equal(held.size, 1);
    notes.releaseInput("keys", callbacks.onNoteOff);
    assert.equal(released.length, 2);
    send("keys", 0x90, 60, 100);
    assert.equal(held.size, 2);
  });

  it("releases a previous strike before retriggering the same physical note", () => {
    const { held, released, send } = setup();
    send("pads", 0x99, 36, 110);
    send("pads", 0x99, 36, 95);
    assert.equal(held.size, 1);
    assert.equal(released.length, 1);
    send("pads", 0x89, 36, 0);
    assert.equal(held.size, 0);
  });

  for (const controller of [120, 123]) {
    it(`handles MIDI controller ${controller} without releasing other channels or devices`, () => {
      const { held, released, send } = setup();
      send("keys", 0x90, 60, 100);
      send("keys", 0x90, 64, 100);
      send("keys", 0x91, 67, 100);
      send("pads", 0x90, 36, 100);
      send("keys", 0xb0, controller, 0);
      assert.equal(held.size, 2);
      assert.equal(released.length, 2);
    });
  }

  it("ignores incomplete, malformed, non-note and redundant release messages", () => {
    const { held, released, send } = setup();
    for (const data of [
      [0x90],
      [0x90, 60],
      [0x90, 200, 100],
      [0x90, 60, 200],
      [0xf8],
      [0xb0, 7, 100],
      [0x80, 60, 0],
    ]) {
      assert.equal(send("keys", ...data), null);
    }
    assert.equal(held.size, 0);
    assert.equal(released.length, 0);
  });
});
