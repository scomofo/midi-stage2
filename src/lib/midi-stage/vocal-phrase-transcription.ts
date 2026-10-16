import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { makeVocalPhraseDraft } from "./vocal-phrase-draft.ts";
import { transcribePitchedEvents } from "./pitched-transcription.ts";

function cancelled(signal?:AbortSignal){if(signal?.aborted) throw new DOMException("Song import was cancelled.","AbortError");}
export async function transcribeVocalPhrases(buffer:SongAudioSamples,filename:string,fingerprint:string,
 {signal,onProgress}:{signal?:AbortSignal;onProgress?:(p:AudioImportProgress)=>void}={}):Promise<AudioAnalysis>{
 const samples=await keyboardMono(buffer,signal); cancelled(signal);
 const events=await transcribePitchedEvents(samples,{signal,onProgress,failureLabel:"Vocal phrase analysis"});
 cancelled(signal);
 return makeVocalPhraseDraft(events,buffer.duration,filename,fingerprint);
}
