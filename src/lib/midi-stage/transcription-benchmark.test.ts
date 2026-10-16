import {describe,expect,it} from "./test-compat.ts";
import fs from "node:fs";
const fixtures = JSON.parse(fs.readFileSync(new URL("../../../tests/fixtures/transcription-benchmarks.json", import.meta.url), "utf8")) as Record<string, { reference: Array<{time:number;duration:number;pitch:number}>; detected: Array<{time:number;duration:number;pitch:number}> }>;
import {benchmarkPass,scoreTranscription} from "./transcription-benchmark.ts";

describe("transcription benchmark harness",()=>{
 for(const [name,data] of Object.entries(fixtures)){
  it(`${name} produces stable metrics`,()=>{
   const result=scoreTranscription(data.reference,data.detected);
   expect(result.f1).toBeGreaterThan(0);
   if(name!=="distortedGuitar") expect(benchmarkPass(result)).toBe(true);
  });
 }
 it("penalizes false positives through precision",()=>{
  const r=scoreTranscription([{time:0,duration:.2,pitch:60}],[{time:0,duration:.2,pitch:60},{time:.5,duration:.2,pitch:62}]);
  expect(r.precision).toBe(.5); expect(r.recall).toBe(1);
 });
});
