import { describe, expect, it } from "./test-compat.ts";
import { highwayReadability, sectionApproach } from "./highway-readability.ts";

function note(time:number):any { return { time, state:0 }; }

describe("highway readability",()=>{
 it("compresses attack faces and hides chord labels only in very dense passages",()=>{
  const dense=Array.from({length:40},(_,i)=>note(i*.06));
  const r=highwayReadability(dense,0,1);
  expect(r.attackScale).toBeLessThan(1); expect(r.showChordLabels).toBe(false);
 });
 it("leaves ordinary passages full size",()=>{
  const r=highwayReadability([note(.5),note(1),note(1.5)],0,1);
  expect(r.attackScale).toBe(1); expect(r.showChordLabels).toBe(true);
 });
 it("announces only upcoming nearby sections",()=>{
  expect(sectionApproach([{time:5,name:"Verse"},{time:20,name:"Solo"}],2,4)).toEqual({name:"Verse",seconds:3});
  expect(sectionApproach([{time:20,name:"Solo"}],2,4)).toBeNull();
 });
});
