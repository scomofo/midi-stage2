import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileMusic,
  LoaderCircle,
  Music2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioSourcePreview } from "./audio-source-preview";
import { GuitarImportReview } from "./guitar-import-review";
import { AudioDraftReview } from "./audio-draft-review";
import { AudioStemImport } from "./audio-stem-import";
import { FullBandStemImport } from "./full-band-stem-import";
import type { FullBandStemFiles } from "@/lib/midi-stage/multi-stem-import";
import type { SharedChart } from "@/lib/midi-stage/chart-format";
import { isReviewableDrumDraft } from "@/lib/midi-stage/drum-chart-review";
import { isReviewableKeyboardDraft } from "@/lib/midi-stage/keyboard-draft";
import type { AudioImportMode } from "@/lib/midi-stage/audio-file-types";
import { importWorkflowState } from "@/lib/midi-stage/import-workflow";
import { scoreChartQuality } from "@/lib/midi-stage/chart-quality";
import { formatTime } from "@/lib/midi-stage/engine";
import { LABELS } from "@/lib/midi-stage/songs";
import { INSTRUMENTS, type Instrument } from "@/lib/midi-stage/types";
import { cn } from "@/lib/utils";

type SongLibraryPanelProps = {
  candidate: {
    kind?: "audio" | "midi" | "chart" | "musicxml";
    chart?: SharedChart;
    audioFile?: File;
    stemName?: string;
    name: string;
    fileName: string;
    bpm: number;
    duration: number;
    counts: Record<Instrument, number>;
    warnings: string[];
  } | null;
  reading: boolean;
  readingLabel?: string;
  readingProgress?: number;
  onCancel: () => void;
  saving?: boolean;
  error: string | null;
  libraryWarning: string | null;
  songs: { id: string; name: string; fileName: string }[];
  onFile: (file: File) => void;
  onAdd: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  reviewKey?: number;
  reviewPending?: boolean;
  onReviewPending?: (pending: boolean) => void;
  onReviewApply?: (chart: SharedChart) => void;
  audioMode?: AudioImportMode;
  onAudioMode?: (mode: AudioImportMode) => void;
  onStemFiles?: (original: File, stem: File) => void;
  onFullBandStems?: (original: File, stems: FullBandStemFiles) => void;
};

export function SongLibraryPanel({
  candidate,
  reading,
  readingLabel = "Reading your song…",
  readingProgress,
  onCancel,
  saving = false,
  error,
  libraryWarning,
  songs,
  onFile,
  onAdd,
  onClose,
  onSelect,
  onRemove,
  reviewKey,
  reviewPending = false,
  onReviewPending,
  onReviewApply,
  audioMode = "rhythm",
  onAudioMode,
  onStemFiles,
  onFullBandStems,
}: SongLibraryPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const returnToFile = useRef(false);
  const previewRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewTitleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busy = reading || saving;
  const previewReady = candidate !== null && !reading;
  const candidateName = candidate?.name;
  const candidateFileName = candidate?.fileName;
  const notice = fileNotice || error;
  const drumDraft = isReviewableDrumDraft(candidate?.chart);
  const keysDraft = isReviewableKeyboardDraft(candidate?.chart);
  const audioDraft = drumDraft || keysDraft;
  const quality = candidate?.chart ? scoreChartQuality(candidate.chart) : null;
  const reviewRequired = Boolean(candidate?.chart?.guitarMode === "strings" || audioDraft);
  const workflow = importWorkflowState({
    mode: audioMode,
    reading,
    hasCandidate: Boolean(candidate),
    reviewRequired,
    reviewPending,
  });

  useEffect(() => {
    if (!previewReady) return;
    previewTitleRef.current?.focus({ preventScroll: true });
    const viewport = scrollRef.current, preview = previewRef.current;
    if (viewport && preview) viewport.scrollTop += preview.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    // The parent refreshes the HUD throughout the session. Only a newly read
    // preview should move focus, never those unrelated renders.
  }, [previewReady, candidateName, candidateFileName]);

  useEffect(() => {
    if (!notice) return;
    errorRef.current?.focus({ preventScroll: true });
    const viewport = scrollRef.current, error = errorRef.current;
    if (viewport && error) viewport.scrollTop += error.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  }, [notice]);

  useEffect(() => {
    if (!reading && returnToFile.current) {
      returnToFile.current = false;
      fileRef.current?.focus();
    }
  }, [reading]);

  function chooseFile(files: FileList | null) {
    if (busy || !files?.length) return;
    if (files.length > 1) {
      setFileNotice("Choose one song file at a time.");
      return;
    }
    setFileNotice("");
    onFile(files[0]);
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-widest text-accent">MAKE THE SET YOURS</div>
          <h2
            id="song-library-title"
            className="mt-1 font-display text-3xl font-semibold tracking-tight"
          >
            Your songs
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Audio, MIDI, guitar tablature or a Stage chart. Bring your own track to the stage.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close song library"
          onClick={onClose}
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <nav aria-label="Song import progress" className="rounded-xl border border-border bg-surface px-3 py-3">
          <ol className="grid grid-cols-5 gap-2">
            {workflow.steps.map((step, index) => {
              const current = step.id === workflow.current;
              return <li key={step.id} aria-current={current ? "step" : undefined} className={cn(
                "min-w-0 rounded-lg px-2 py-2 text-center text-[11px] font-medium",
                current ? "bg-accent/15 text-accent" : step.done ? "text-fg" : "text-muted",
              )}>
                <span className="block font-mono text-[10px] opacity-70">{index + 1}</span>
                <span className="block truncate">{step.label}</span>
              </li>;
            })}
          </ol>
          <p className="mt-2 text-center text-xs text-muted">
            Song → instrument/stem → local analysis → correction → save and play.
          </p>
        </nav>
        <div>
          {onAudioMode ? <fieldset disabled={busy} className="mb-4 space-y-2">
            <legend className="mb-2 text-sm font-medium">Audio highway</legend>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={audioMode === "rhythm" ? "primary" : "secondary"} aria-pressed={audioMode === "rhythm"} disabled={busy} onClick={() => onAudioMode("rhythm")}>Rhythm</Button>
              <Button type="button" variant={audioMode === "drums" ? "primary" : "secondary"} aria-pressed={audioMode === "drums"} disabled={busy} onClick={() => onAudioMode("drums")}>Drums (draft)</Button>
              <Button type="button" variant={audioMode === "keys" ? "primary" : "secondary"} aria-pressed={audioMode === "keys"} disabled={busy} onClick={() => onAudioMode("keys")}>Keys (draft)</Button>
              <Button type="button" variant={audioMode === "guitar" ? "primary" : "secondary"} aria-pressed={audioMode === "guitar"} disabled={busy} onClick={() => onAudioMode("guitar")}>Guitar (draft)</Button>
              <Button type="button" variant={audioMode === "bass" ? "primary" : "secondary"} aria-pressed={audioMode === "bass"} disabled={busy} onClick={() => onAudioMode("bass")}>Bass (draft)</Button>
              <Button type="button" variant={audioMode === "vocals" ? "primary" : "secondary"} aria-pressed={audioMode === "vocals"} disabled={busy} onClick={() => onAudioMode("vocals")}>Vocals (phrases)</Button>
            </div>
            <p className="text-xs leading-relaxed text-muted">{audioMode === "keys"
              ? "Estimate keyboard pitches, chords and holds locally, then review each note. A clean piano/keyboard stem works best. Longer recordings can take several minutes. Changing mode rebuilds the preview."
              : audioMode === "guitar"
              ? "Estimate guitar pitches and holds locally, suggest playable strings/frets, then correct the six-string draft. A clean isolated guitar stem works best; inferred fingering is only a starting point."
              : audioMode === "bass"
              ? "Estimate bass pitches and holds locally from an isolated bass stem. Full MIDI pitches are preserved; physical bass fingering is not inferred."
              : audioMode === "vocals"
              ? "Experimental phrase lane from an isolated vocal stem. It follows sung phrase timing only—no lyric alignment or karaoke pitch scoring yet."
              : audioMode === "drums"
              ? "Estimate kick, snare and hi-hat from a recording, then review each hit. A drum-only track works best. Changing mode rebuilds the audio preview."
              : "One rhythm lane from detected attacks, with your original recording. This choice applies to audio files only."}</p>
          </fieldset> : null}
          {onFullBandStems ? <div className="mb-4"><FullBandStemImport disabled={busy} onImport={onFullBandStems} /></div> : null}
          {audioMode !== "rhythm" && onStemFiles ? <div className="mb-4"><AudioStemImport key={audioMode} instrument={audioMode} disabled={busy} onImport={onStemFiles} /></div> : null}
          <label
            className={cn(
              "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2",
              dragging
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-strong bg-surface text-fg hover:border-accent",
              busy && "cursor-wait opacity-60",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              if (!busy) setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? "none" : "copy";
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              chooseFile(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={AUDIO_IMPORT_ACCEPT}
              aria-label="Choose song file"
              aria-describedby="song-file-help"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                chooseFile(event.target.files);
                event.target.value = "";
              }}
            />
            <Upload className="mb-1 size-6 text-accent" aria-hidden="true" />
            <span className="text-sm font-medium">
              {dragging ? "Drop your song here" : "Choose a song file"}
            </span>
            <span className="text-xs leading-relaxed text-muted">or drop one here</span>
          </label>
          <p id="song-file-help" className="mt-3 text-xs leading-relaxed text-muted">
            MP3, WAV, FLAC and other browser-supported audio. Rhythm hits are detected from your
            track. Choose Rhythm, a drum, keyboard, guitar, bass draft or vocal phrase lane; all play your original track. Up to 50 MB
            and 6 minutes.
          </p>
