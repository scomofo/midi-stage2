import { describe, expect, it } from "vitest";
import { cleanGuitarEvents } from "./guitar-event-cleanup.ts";

describe("guitar transcription cleanup", () => {
  it("joins same-pitch flicker common in distorted sustained notes", () => {
    const cleaned = cleanGuitarEvents([
      { startTimeSeconds: 0, durationSeconds: 0.2, pitchMidi: 52, amplitude: 0.8 },
      { startTimeSeconds: 0.23, durationSeconds: 0.3, pitchMidi: 52, amplitude: 0.7 },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.durationSeconds).toBeCloseTo(0.53, 6);
  });

  it("removes a weak short octave ghost near a stronger attack", () => {
    const cleaned = cleanGuitarEvents([
      { startTimeSeconds: 0.1, durationSeconds: 0.35, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.105, durationSeconds: 0.08, pitchMidi: 52, amplitude: 0.35 },
    ]);
    expect(cleaned.map((event) => event.pitchMidi)).toEqual([40]);
  });

  it("keeps sustained octave chord tones", () => {
    const cleaned = cleanGuitarEvents([
      { startTimeSeconds: 0.1, durationSeconds: 0.5, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.1, durationSeconds: 0.45, pitchMidi: 52, amplitude: 0.7 },
    ]);
    expect(cleaned.map((event) => event.pitchMidi)).toEqual([40, 52]);
  });

  it("keeps short palm-muted fundamentals", () => {
    const cleaned = cleanGuitarEvents([
      { startTimeSeconds: 0.1, durationSeconds: 0.09, pitchMidi: 40, amplitude: 0.85 },
      { startTimeSeconds: 0.3, durationSeconds: 0.08, pitchMidi: 43, amplitude: 0.8 },
    ]);
    expect(cleaned).toHaveLength(2);
  });

  it("does not thin dense non-octave chord attacks", () => {
    const cleaned = cleanGuitarEvents([
      { startTimeSeconds: 0.2, durationSeconds: 0.4, pitchMidi: 40, amplitude: 0.8 },
      { startTimeSeconds: 0.2, durationSeconds: 0.4, pitchMidi: 47, amplitude: 0.7 },
      { startTimeSeconds: 0.2, durationSeconds: 0.4, pitchMidi: 55, amplitude: 0.7 },
    ]);
    expect(cleaned).toHaveLength(3);
  });
});
