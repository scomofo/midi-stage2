import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const fixtures = JSON.parse(fs.readFileSync(new URL("../../../tests/fixtures/transcription-benchmarks.json", import.meta.url), "utf8")) as Record<string, { reference: Array<{time:number;duration:number;pitch:number}>; detected: Array<{time:number;duration:number;pitch:number}> }>;
import {benchmarkPass,scoreTranscription} from "./transcription-benchmark.ts";

// Arithmetic examples only. The browser benchmark measures actual audio imports.
describe("transcription metrics",()=>{
 for(const [name,data] of Object.entries(fixtures)){
  it(`${name} produces stable metrics`,()=>{
   const result=scoreTranscription(data.reference,data.detected);
   assert.ok(result.f1 > 0);
   if(name!=="distortedGuitar") assert.equal(benchmarkPass(result), true);
  });
 }
 it("penalizes false positives through precision",()=>{
  const r=scoreTranscription([{time:0,duration:.2,pitch:60}],[{time:0,duration:.2,pitch:60},{time:.5,duration:.2,pitch:62}]);
  assert.equal(r.precision,.5); assert.equal(r.recall,1);
 });
 it("finds both matches when a greedy nearest choice would steal the later note",()=>{
  const refs=[{time:1,duration:.2,pitch:60},{time:1.06,duration:.2,pitch:60}];
  const detections=[{time:1.03,duration:.2,pitch:60},{time:.95,duration:.2,pitch:60}];
  const result=scoreTranscription(refs,detections);
  assert.equal(result.matched,2); assert.equal(result.f1,1);
  assert.deepEqual(result.matches.map(match=>match.detectedIndex),[1,0]);
  assert.equal(scoreTranscription([...refs].reverse(),[...detections].reverse()).matched,2);
 });
 it("measures wrong holds on pitch/onset matches instead of hiding them",()=>{
  const ref=[{time:1,duration:.1,pitch:60}], detected=[{time:1.02,duration:1.1,pitch:60}];
  const result=scoreTranscription(ref,detected);
  assert.equal(result.f1,1); assert.ok(Math.abs(result.meanDurationErrorMs!-1000)<1e-6);
  assert.ok(Math.abs(result.meanOffsetErrorMs!-1020)<1e-6);
  assert.equal(benchmarkPass(result),false);
  assert.equal(scoreTranscription(ref,detected,{durationToleranceMs:180}).matched,0,"an explicit offset-constrained policy remains available");
 });
 it("counts duplicate detections and diagnoses octaves only after exact matches",()=>{
  const result=scoreTranscription([{time:1,pitch:60},{time:1,pitch:72},{time:2,pitch:42},{time:3,pitch:64}],
   [{time:1,pitch:60},{time:1,pitch:72},{time:1,pitch:72},{time:2,pitch:54},{time:3,pitch:65}]);
  assert.equal(result.matched,2); assert.equal(result.falsePositives,3); assert.equal(result.falseNegatives,2);
  assert.equal(result.octaveErrors,1); assert.equal(result.otherPitchErrors,1);
  const duplicate=scoreTranscription([{time:0,pitch:60}],[{time:0,pitch:72},{time:0,pitch:72}]);
  assert.equal(duplicate.octaveErrors,1); assert.equal(duplicate.falsePositives,2);
 });
 it("leaves unannotated percussion lengths unscored and handles empty controls",()=>{
  const result=scoreTranscription([{time:1,pitch:36}],[{time:1.01,pitch:36,duration:.06}]);
  assert.equal(result.f1,1); assert.equal(result.meanDurationErrorMs,null); assert.equal(result.meanOffsetErrorMs,null);
  assert.equal(scoreTranscription([],[]).f1,1);
  assert.equal(scoreTranscription([],[{time:0,pitch:60}]).f1,0);
  assert.equal(scoreTranscription([{time:0,pitch:60}],[]).f1,0);
 });
 it("rejects invalid labels and tolerances instead of emitting misleading metrics",()=>{
  for(const patch of [{time:NaN},{time:-1},{pitch:128},{pitch:60.2},{duration:Infinity},{duration:-1}]) {
   assert.throws(()=>scoreTranscription([{time:0,pitch:60,...patch}],[]));
  }
  for(const options of [{onsetToleranceMs:-1},{onsetToleranceMs:Infinity},{durationToleranceMs:NaN},{pitchTolerance:-1}]) assert.throws(()=>scoreTranscription([],[],options));
  assert.throws(()=>benchmarkPass(scoreTranscription([],[]),{minF1:2}));
 });
 it("gates misses and extras independently so a tradeoff cannot hide a regression",()=>{
  const result=scoreTranscription([{time:1,pitch:60}],[{time:1,pitch:60},{time:2,pitch:64}]);
  assert.equal(benchmarkPass(result,{minF1:.6}),true);
  assert.equal(benchmarkPass(result,{minF1:.6,minPrecision:.8}),false);
  assert.equal(benchmarkPass(result,{minF1:.6,maxFalsePositives:0}),false);
  const missed=scoreTranscription([{time:1,pitch:60},{time:2,pitch:64}],[{time:1,pitch:60}]);
  assert.equal(benchmarkPass(missed,{minF1:.6,minRecall:.8}),false);
  assert.equal(benchmarkPass(missed,{minF1:.6,maxFalseNegatives:0}),false);
  for (const floor of [{maxFalsePositives:-1},{maxFalseNegatives:.5},{minPrecision:NaN},{minRecall:2}]) assert.throws(()=>benchmarkPass(result,floor));
 });
});
