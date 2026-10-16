import {describe,expect,it} from "./test-compat.ts";
import {CHART_SCHEMA,validateSharedChart} from "./chart-format.ts";
import {INSTRUMENTS} from "./types.ts";
import {makeSongPackage,serializeSongPackage,validateSongPackage} from "./song-package.ts";

const chart=validateSharedChart({schema:CHART_SCHEMA,version:1,id:"c1",title:"Song",bpm:120,duration:2,firstBeat:0,audioOffset:0,audioName:"song.wav",origin:"audio-keys-draft",
 parts:INSTRUMENTS.map(type=>({type,notes:type==="keys"?[{time:.1,duration:.2,pitch:60,velocity:100}]:[]}))});
describe("song package",()=>{
 it("packages master audio stems charts and provenance without local paths",()=>{
  const pkg=makeSongPackage(chart,{masterAudioName:"song.wav",stems:[{role:"stem",name:"guitar.wav",instrument:"guitar"}],artworkName:"cover.jpg"});
  expect(pkg.masterAudio?.name).toBe("song.wav"); expect(pkg.stems[0]?.instrument).toBe("guitar");
  expect(serializeSongPackage(pkg)).not.toContain("C:\\\\");
 });
 it("round-trips a validated manifest",()=>{const pkg=makeSongPackage(chart,{createdAt:"2026-10-16T00:00:00Z"}); expect(validateSongPackage(JSON.parse(serializeSongPackage(pkg)))).toEqual(pkg);});
 it("rejects packages without a chart",()=>{const raw=makeSongPackage(chart) as any; raw.charts={}; expect(()=>validateSongPackage(raw)).toThrow(/at least one chart/);});
});
