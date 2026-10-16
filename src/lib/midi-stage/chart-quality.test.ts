import { describe, expect, it } from "./test-compat.ts";
import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import { scoreChartQuality } from "./chart-quality.ts";

function chart(notes:any[], duration=10) {
 return validateSharedChart({schema:CHART_SCHEMA,version:1,id:"q",title:"Q",bpm:120,duration,firstBeat:0,audioOffset:0,audioName:"",origin:"audio-keys-draft",
 parts:INSTRUMENTS.map(type=>({type,notes:type==="keys"?notes:[]}))});
}
describe("chart quality report",()=>{
 it("scores a clean confident chart highly",()=>{
  const r=scoreChartQuality(chart([
   {time:.1,duration:.3,pitch:60,velocity:100,confidence:.92},
   {time:.5,duration:.3,pitch:62,velocity:100,confidence:.9},
   {time:.9,duration:.3,pitch:64,velocity:100,confidence:.88},
  ]));
  expect(r.score).toBeGreaterThanOrEqual(90); expect(r.grade).toBe("excellent");
 });
 it("flags widespread low-confidence notes",()=>{
  const r=scoreChartQuality(chart(Array.from({length:10},(_,i)=>({time:i*.2,duration:.1,pitch:60+i%3,velocity:90,confidence:.45}))));
  expect(r.issues.some(i=>i.code==="confidence")).toBe(true); expect(r.score).toBeLessThan(90);
 });
 it("flags sparse coverage in a long song",()=>{
  const r=scoreChartQuality(chart([{time:1,duration:.2,pitch:60,velocity:90,confidence:.9},{time:2,duration:.2,pitch:62,velocity:90,confidence:.9}],60));
  expect(r.issues.some(i=>i.code==="coverage")).toBe(true);
 });
});
