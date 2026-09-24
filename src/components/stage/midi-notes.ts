import type { MidiSource } from "@/lib/midi-stage/midi-routing";

export type MidiNoteCallbacks = {
  onNoteOn: (note: number, velocity: number, token: string, source: MidiSource) => void;
  onNoteOff: (token: string) => void;
};

/** Keep each physical key independent across instruments and MIDI channels. */
export class MidiNotes {
  private held = new Map<string, Map<string, number>>();

  message(inputId: string, data: Uint8Array | null, callbacks: MidiNoteCallbacks) {
    if (!data || data.length < 3) return null;
    const [status, note, velocity] = data;
    if (status < 0x80 || status >= 0xf0 || note > 127 || velocity > 127) return null;
    const type = status & 0xf0;
    const channel = status & 0x0f;
    const token = `midi:${JSON.stringify(inputId)}:${channel}:${note}`;
    let held = this.held.get(inputId);

    if (type === 0x90 && velocity > 0) {
      if (!held) {
        held = new Map();
        this.held.set(inputId, held);
      }
      // A second strike can arrive without a release from drum controllers.
      if (held.has(token)) callbacks.onNoteOff(token);
      held.set(token, channel);
      callbacks.onNoteOn(note, velocity, token, { inputId, channel: channel + 1 });
      return { note, channel: channel + 1, velocity };
    }

    if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      if (held?.delete(token)) callbacks.onNoteOff(token);
    } else if (type === 0xb0 && (note === 120 || note === 123)) {
      // MIDI panic messages release only this device's requested channel.
      for (const [heldToken, heldChannel] of held ?? []) {
        if (heldChannel === channel) {
          held!.delete(heldToken);
          callbacks.onNoteOff(heldToken);
        }
      }
    }
    if (held?.size === 0) this.held.delete(inputId);
    return null;
  }

  releaseInput(inputId: string, onNoteOff: MidiNoteCallbacks["onNoteOff"]) {
    const held = this.held.get(inputId);
    this.held.delete(inputId);
    for (const token of held?.keys() ?? []) onNoteOff(token);
  }
}
