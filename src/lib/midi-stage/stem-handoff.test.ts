import { describe, expect, it } from "vitest";
import { detectStemInstrument, stemCompatibility, stemSetIdentity } from "./stem-handoff.ts";

describe("Stem Lab handoff",()=>{
 it("recognizes common Demucs/Stem Lab names",()=>{
  expect(detectStemInstrument("drums.wav")).toBe("drums");
  expect(detectStemInstrument("song_piano.wav")).toBe("keys");
  expect(detectStemInstrument("mix-guitar.flac")).toBe("guitar");
  expect(detectStemInstrument("track.bass.wav")).toBe("bass");
  expect(detectStemInstrument("vocals.wav")).toBe("vocals");
 });
 it("warns when a recognizable stem does not match selected analysis",()=>{
  expect(stemCompatibility("drums.wav","guitar")).toMatchObject({compatible:false,detected:"drums"});
  expect(stemCompatibility("mystery.wav","guitar")).toMatchObject({compatible:true,detected:null});
 });
 it("creates a stable identity independent of file selection order",()=>{
  const a={name:"song.wav",size:100,lastModified:1}, b={name:"guitar.wav",size:20,lastModified:2};
  expect(stemSetIdentity([a,b] as any)).toBe(stemSetIdentity([b,a] as any));
 });
});
