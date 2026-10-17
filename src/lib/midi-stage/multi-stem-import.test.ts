import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import { combineStemCharts, importFullBandStemSet } from "./multi-stem-import.ts";
import { applyGuitarReview, guitarReviewRows } from "./guitar-chart-review.ts";
import { chartIdentity, songFromSavedChart } from "./song-library.ts";

function chart(type:"drums"|"keys"|"guitar"|"bass", guitar=false){
  return validateSharedChart({
    schema:CHART_SCHEMA,version:guitar?4:1,...(guitar?{guitarMode:"strings",guitarTuning:[40,45,50,55,59,64]}:{}),
    id:`chart-${type}`,title:type,bpm:120,duration:10,firstBeat:.1,audioOffset:0,audioName:"song.wav",origin:`audio-${type}-draft`,
    parts:INSTRUMENTS.map(p=>({type:p,notes:p===type?[{time:.1,duration:.2,pitch:type==="drums"?36:type==="guitar"?40:60,velocity:100,...(type==="guitar"?{guitarPosition:{string:6,fret:0}}:{})}]:[]}))
  });
}
describe("full-band stem import",()=>{
 it("keeps count-in edits and reviewed guitar positions on the backing timeline",()=>{
  const drums = chart("drums"), keys = chart("keys"), guitar = chart("guitar",true);
  guitar.parts.find(part=>part.type==="guitar")!.notes[0]!.time = 1;
  const combined = combineStemCharts({drums,keys,guitar,bass:chart("bass")},"song.wav");
  const original = JSON.stringify(combined), rows = guitarReviewRows(combined);
  rows[0]!.fret = "1";
  const corrected = applyGuitarReview(combined,rows,"90");
  assert.equal(corrected.bpm,90);
  assert.equal(corrected.firstBeat,.1);
  assert.equal(corrected.duration,10);
  assert.equal(corrected.audioOffset,0);
  for(const type of ["drums","keys","bass"] as const) assert.deepEqual(corrected.parts.find(part=>part.type===type),combined.parts.find(part=>part.type===type));
  assert.equal(corrected.parts.find(part=>part.type==="guitar")!.notes[0]!.time,1);
  assert.equal(corrected.parts.find(part=>part.type==="guitar")!.notes[0]!.pitch,41);
  assert.equal(JSON.stringify(combined),original);
  const saved = songFromSavedChart({id:chartIdentity(corrected),chart:corrected,fileName:"song.wav",audio:true,addedAt:0});
  assert.equal(saved.arrangement,"Full-band draft");
  assert.match(saved.arrangementDescription!,/original recording/);
  rows[0]!.time="9.9";
  assert.throws(()=>applyGuitarReview(combined,rows,"90"),/fit inside/);
 });

 it("rejects mismatched or unsupported stems before reading audio",async()=>{
  const original = new File(["original"],"song.wav",{type:"audio/wav"});
  await assert.rejects(importFullBandStemSet(original,{guitar:new File(["drums"],"drums.wav",{type:"audio/wav"})}),/looks like a drums stem/);
  await assert.rejects(importFullBandStemSet(original,{keys:new File(["text"],"piano.txt",{type:"text/plain"})}),/browser-supported keys stem/);
  const controller = new AbortController();controller.abort();
  await assert.rejects(importFullBandStemSet(original,{keys:new File(["piano"],"piano.wav",{type:"audio/wav"})},{signal:controller.signal}),{name:"AbortError"});
 });
 it("combines instrument parts on one backing duration",()=>{
  const combined=combineStemCharts({drums:chart("drums"),keys:chart("keys"),guitar:chart("guitar",true),bass:chart("bass")},"song.wav");
  assert.equal(combined.origin, "audio-full-band-draft");
  assert.equal(combined.version, 4);
  for(const type of ["drums","keys","guitar","bass"] as const) assert.equal((combined.parts.find(p=>p.type===type)!.notes).length, 1);
 });
 it("rejects mismatched backing durations",()=>{
  const keys=chart("keys");
  const raw={...keys,duration:11,parts:keys.parts.map(p=>({...p,notes:p.notes.map(n=>({...n}))}))};
  assert.throws(()=>combineStemCharts({drums:chart("drums"),keys:validateSharedChart(raw)},"song.wav"), /same backing-song duration/);
 });
});
