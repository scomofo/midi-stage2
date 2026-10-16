import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { makeVocalPhraseDraft } from "./vocal-phrase-draft.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

function cancelled(signal?:AbortSignal){if(signal?.aborted) throw new DOMException("Song import was cancelled.","AbortError");}
export async function transcribeVocalPhrases(buffer:SongAudioSamples,filename:string,fingerprint:string,
 {signal,onProgress}:{signal?:AbortSignal;onProgress?:(p:AudioImportProgress)=>void}={}):Promise<AudioAnalysis>{
 const samples=await keyboardMono(buffer,signal); cancelled(signal);
 const events=await new Promise<KeyboardEvent[]>((resolve,reject)=>{
  const worker=new Worker(new URL("./keyboard-transcription.worker.ts",import.meta.url),{type:"module"}); let settled=false;
  const finish=(err?:Error,value?:KeyboardEvent[])=>{if(settled)return;settled=true;signal?.removeEventListener("abort",abort);worker.terminate();err?reject(err):resolve(value!)};
  const abort=()=>finish(new DOMException("Song import was cancelled.","AbortError")); signal?.addEventListener("abort",abort,{once:true});
  worker.onmessage=({data})=>{if(data.type==="progress") onProgress?.({phase:data.phase,progress:data.progress}); else if(data.type==="complete") finish(undefined,data.events); else if(data.type==="error") finish(new Error("Vocal phrase analysis failed."));};
  worker.onerror=()=>finish(new Error("The vocal phrase analyzer could not start."));
  worker.postMessage({samples,modelUrl:new URL("/models/basic-pitch/model.json",location.href).href},[samples.buffer]);
 });
 cancelled(signal); return makeVocalPhraseDraft(events,buffer.duration,filename,fingerprint);
}
