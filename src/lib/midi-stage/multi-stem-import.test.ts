import { describe, expect, it } from "./test-compat.ts";
import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import { combineStemCharts } from "./multi-stem-import.ts";

function chart(type:"drums"|"keys"|"guitar"|"bass", guitar=false){
  return validateSharedChart({
    schema:CHART_SCHEMA,version:guitar?4:1,...(guitar?{guitarMode:"strings",guitarTuning:[40,45,50,55,59,64]}:{}),
    id:`chart-${type}`,title:type,bpm:120,duration:10,firstBeat:.1,audioOffset:0,audioName:"song.wav",origin:`audio-${type}-draft`,
    parts:INSTRUMENTS.map(p=>({type:p,notes:p===type?[{time:.1,duration:.2,pitch:type==="drums"?36:type==="guitar"?40:60,velocity:100,...(type==="guitar"?{guitarPosition:{string:6,fret:0}}:{})}]:[]}))
  });
}
describe("full-band stem import",()=>{
 it("combines instrument parts on one backing duration",()=>{
  const combined=combineStemCharts({drums:chart("drums"),keys:chart("keys"),guitar:chart("guitar",true),bass:chart("bass")},"song.wav");
  expect(combined.origin).toBe("audio-full-band-draft");
  expect(combined.version).toBe(4);
  for(const type of ["drums","keys","guitar","bass"] as const) expect(combined.parts.find(p=>p.type===type)!.notes).toHaveLength(1);
 });
 it("rejects mismatched backing durations",()=>{
  const keys=chart("keys");
  const raw={...keys,duration:11,parts:keys.parts.map(p=>({...p,notes:p.notes.map(n=>({...n}))}))};
  expect(()=>combineStemCharts({drums:chart("drums"),keys:validateSharedChart(raw)},"song.wav")).toThrow(/same backing-song duration/);
 });
});
