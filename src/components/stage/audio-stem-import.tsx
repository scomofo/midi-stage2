import { useId, useState } from "react";
import { FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIO_IMPORT_ACCEPT } from "@/lib/midi-stage/audio-file-types";

/** The same local audio files used by SparkSuite's Stem Lab; no cross-app session or upload. */
export function AudioStemImport({ disabled, onImport, instrument = "drums" }: {
  disabled: boolean; onImport: (original: File, stem: File) => void; instrument?: "drums" | "keys";
}) {
  const part = instrument === "keys" ? "keyboard" : "drum";
  const helpId = useId();
  const [original, setOriginal] = useState<File | null>(null);
  const [stem, setStem] = useState<File | null>(null);
  return <details className="rounded-xl border border-border bg-surface p-3 text-fg">
    <summary className="min-h-11 cursor-pointer text-sm font-medium">Use a separated {part} stem</summary>
    <p id={helpId} className="mb-3 text-xs leading-relaxed text-muted">
      Use the same {part} file you load into SparkSuite Stem Lab, such as Demucs {instrument === "keys" ? "piano.wav" : "drums.wav"}. Keep
      leading silence. A shorter stem ends early; the original song keeps playing. Each file: 50 MB,
      1 second to 6 minutes. Separation happens before import.
    </p>
    <div className="space-y-3">
      <label className="block text-sm">Original song · backing audio
        <input type="file" accept={AUDIO_IMPORT_ACCEPT} aria-label={`Original song for ${part} stem`} aria-describedby={helpId}
          disabled={disabled} className="mt-2 block min-h-11 w-full min-w-0 text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-3 file:text-fg"
          onChange={(event) => setOriginal(event.target.files?.[0] ?? null)} />
      </label>
      <label className="block text-sm">{instrument === "keys" ? "Keyboard" : "Drum"} stem · highway analysis
        <input type="file" accept={AUDIO_IMPORT_ACCEPT} aria-label={`${instrument === "keys" ? "Keyboard" : "Drum"} stem for highway`} aria-describedby={helpId}
          disabled={disabled} className="mt-2 block min-h-11 w-full min-w-0 text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-3 file:text-fg"
          onChange={(event) => setStem(event.target.files?.[0] ?? null)} />
      </label>
      <Button type="button" variant="secondary" disabled={disabled || !original || !stem} onClick={() => { if (original && stem) onImport(original, stem); }}>
        <FileAudio size={16} aria-hidden="true" /> Build from {part} stem
      </Button>
    </div>
  </details>;
}
