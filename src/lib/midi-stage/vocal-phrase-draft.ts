import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

export type VocalPhrase = { start: number; duration: number; medianPitch: number; confidence: number; noteCount: number };

export function groupVocalPhrases(events: KeyboardEvent[], duration: number): VocalPhrase[] {
  const valid=events.filter(e=>e.amplitude>=0.35&&e.durationSeconds>=0.06&&e.startTimeSeconds<duration)
    .sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds);
  const phrases: KeyboardEvent[][]=[];
  for(const e of valid){
    const last=phrases.at(-1);
    const lastEnd=last?.reduce((m,n)=>Math.max(m,n.startTimeSeconds+n.durationSeconds),0)??0;
    if(!last||e.startTimeSeconds-lastEnd>0.28) phrases.push([e]); else last.push(e);
  }
  return phrases.filter(p=>p.length>=1).map(p=>{
    const start=Math.max(0,p[0]!.startTimeSeconds);
    const end=Math.min(duration,Math.max(...p.map(n=>n.startTimeSeconds+n.durationSeconds)));
    const pitches=[...p].sort((a,b)=>a.pitchMidi-b.pitchMidi);
    return {start,duration:Math.max(.08,end-start),medianPitch:pitches[Math.floor(pitches.length/2)]!.pitchMidi,
      confidence:p.reduce((s,n)=>s+n.amplitude,0)/p.length,noteCount:p.length};
  });
}

export function makeVocalPhraseDraft(events: KeyboardEvent[], duration:number, filename:string, fingerprint:string){
  const phrases=groupVocalPhrases(events,duration);
  if(!phrases.length) throw new Error("No clear vocal phrases were found. Try a cleaner isolated vocal stem.");
  const notes=phrases.map(p=>({time:p.start,duration:p.duration,pitch:60,velocity:Math.max(1,Math.min(127,Math.round(p.confidence*127))),confidence:Math.max(0,Math.min(1,p.confidence))}));
  const chart=validateSharedChart({schema:CHART_SCHEMA,version:2,matching:"rhythm",id:`chart-audio-vocals-${fingerprint}`,
    title:filename.replace(/\.[^.]+$/,"").replace(/_/g," ").trim().slice(0,160)||"Vocal phrase draft",bpm:120,duration,
    firstBeat:notes[0]!.time,audioOffset:0,audioName:filename.slice(0,256),origin:"audio-vocals-rhythm",
    parts:INSTRUMENTS.map(type=>({type,notes:type==="keys"?notes:[]}))});
  return {chart,phrases,warnings:[
    "Vocal phrase mode is an experimental rhythm lane: it follows sung phrase timing, not lyrics or karaoke pitch scoring.",
    "Phrase starts and lengths are estimated from an isolated vocal stem. Breath noise, harmonies and reverb can split or join phrases.",
    "Full lyric alignment and sung-pitch scoring remain separate future work."
  ]};
}
