import { useState } from "react";
import { FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIO_IMPORT_ACCEPT } from "@/lib/midi-stage/audio-file-types";
import type { FullBandStemFiles } from "@/lib/midi-stage/multi-stem-import";

export function FullBandStemImport({ disabled, onImport }: {
  disabled: boolean;
  onImport: (original: File, stems: FullBandStemFiles) => void;
}) {
  const [original,setOriginal]=useState<File|null>(null);
  const [stems,setStems]=useState<FullBandStemFiles>({});
  const set=(kind:keyof FullBandStemFiles,file:File|null)=>setStems(current=>({...current,[kind]:file??undefined}));
  const count=Object.values(stems).filter(Boolean).length;
  return <details className="rounded-xl border border-border bg-surface p-3 text-fg">
    <summary className="min-h-11 cursor-pointer text-sm font-medium">Build a full-band song from stems</summary>
    <p className="mb-3 text-xs leading-relaxed text-muted">Choose the original song plus any aligned drum, keyboard, guitar and bass stems. All stems must start at song time 0; the original remains the backing track.</p>
    <label className="block text-sm">Original song
      <input type="file" accept={AUDIO_IMPORT_ACCEPT} disabled={disabled} className="mt-1 block w-full text-xs" onChange={e=>setOriginal(e.target.files?.[0]??null)}/>
    </label>
    <div className="mt-3 grid grid-cols-2 gap-3">
      {(["drums","keys","guitar","bass"] as const).map(kind=><label key={kind} className="block text-sm capitalize">{kind} stem
        <input type="file" accept={AUDIO_IMPORT_ACCEPT} disabled={disabled} className="mt-1 block w-full text-xs" onChange={e=>set(kind,e.target.files?.[0]??null)}/>
      </label>)}
    </div>
    <Button type="button" variant="secondary" className="mt-3" disabled={disabled||!original||!count} onClick={()=>{if(original&&count)onImport(original,stems);}}>
      <FileAudio size={16} aria-hidden="true"/> Analyze {count || ""} stem{count===1?"":"s"} as one song
    </Button>
  </details>;
}
