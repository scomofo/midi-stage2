import {describe,expect,it} from "./test-compat.ts";
import fixtures from "../../../tests/fixtures/transcription-benchmarks.json";
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
