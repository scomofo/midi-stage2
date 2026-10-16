import {describe,expect,it} from "vitest";
import {groupVocalPhrases,makeVocalPhraseDraft} from "./vocal-phrase-draft.ts";
describe("vocal phrase highway",()=>{
 it("groups nearby sung notes into phrases",()=>{
  const p=groupVocalPhrases([
   {startTimeSeconds:0,durationSeconds:.2,pitchMidi:60,amplitude:.8},
   {startTimeSeconds:.22,durationSeconds:.2,pitchMidi:62,amplitude:.7},
   {startTimeSeconds:1,durationSeconds:.3,pitchMidi:64,amplitude:.8},
  ],2); expect(p).toHaveLength(2); expect(p[0]!.noteCount).toBe(2);
 });
 it("creates a rhythm-matched phrase chart",()=>{
  const r=makeVocalPhraseDraft([{startTimeSeconds:.1,durationSeconds:.5,pitchMidi:60,amplitude:.8}],2,"vocals.wav","abc123");
  expect(r.chart.matching).toBe("rhythm"); expect(r.chart.origin).toBe("audio-vocals-rhythm");
  expect(r.chart.parts.find(p=>p.type==="keys")!.notes).toHaveLength(1);
 });
});
