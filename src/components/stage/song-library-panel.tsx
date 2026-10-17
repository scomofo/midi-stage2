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
import { isReviewableGuitarDraft } from "@/lib/midi-stage/guitar-draft";
import { isReviewableBassDraft } from "@/lib/midi-stage/bass-draft";
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
  const fullBandDraft = candidate?.chart?.origin === "audio-full-band-draft";
  const guitarDraft = isReviewableGuitarDraft(candidate?.chart);
  const bassDraft = isReviewableBassDraft(candidate?.chart);
  const vocalDraft = candidate?.chart?.origin === "audio-vocals-rhythm";
  const estimatedDraft = audioDraft || fullBandDraft || guitarDraft || bassDraft;
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
              "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent",
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
              accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.webm,.mid,.midi,.json,.musicxml,.xml,audio/*"
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
          <p className="mt-2 text-xs leading-relaxed text-muted">
            MIDI (.mid, .midi) and Stage charts (.midistage.json) keep pitch notes and play
            synthesized instruments. Up to 4 MB; tempo changes aren’t supported for these files.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            MusicXML tablature (.musicxml, .xml) and version 4 Stage charts keep authored strings
            and frets. Export one six-string tablature staff with a constant tempo and expanded repeats.
          </p>
          <a className="mt-2 inline-flex min-h-11 items-center text-xs text-accent underline underline-offset-4" href="/examples/open-string-study.musicxml" download>Download an example guitar arrangement</a>
          {reading ? (
            <div className="mt-3 rounded-xl border border-accent/25 bg-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <p role="status" className="flex items-center gap-2 text-sm text-accent">
                  <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {readingLabel}
                </p>
                <Button type="button" variant="ghost" className="shrink-0" onClick={() => {
                  returnToFile.current = true;
                  setFileNotice("");
                  onCancel();
                }}>
                  Cancel import
                </Button>
              </div>
              <progress
                className="song-import-progress mt-3 block h-1.5 w-full"
                aria-label={readingProgress === undefined ? readingLabel : "Song analysis progress"}
                max={1}
                value={readingProgress}
              />
              {readingProgress !== undefined ? (
                <p className="mt-2 text-right font-mono text-xs tabular-nums text-muted" aria-hidden="true">
                  {Math.round(readingProgress * 100)}%
                </p>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="mt-3 break-words rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-relaxed text-tungsten"
            >
              {notice}
            </p>
          ) : null}
        </div>

        {candidate ? (
          <>
          {quality ? <div className="rounded-xl border border-border bg-surface px-3 py-3" data-chart-quality={quality.grade}>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">Chart quality · {quality.score}/100</strong>
              <span className="text-xs capitalize text-muted">{quality.grade}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{quality.issues[0]?.message}</p>
            {quality.needsReview ? <p className="mt-1 text-xs text-muted">{quality.needsReview} detected notes are below high confidence.</p> : null}
          </div> : null}
          <section
            ref={previewRef}
            aria-labelledby="song-preview-title"
            className="min-w-0 rounded-xl border border-accent/30 bg-surface p-4 text-fg"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-widest text-accent">
              {audioDraft ? <FileMusic className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {fullBandDraft ? "FULL-BAND DRAFT · REVIEW PARTS" : keysDraft ? "KEYBOARD DRAFT · REVIEW NOTES" : drumDraft ? "DRUM DRAFT · REVIEW HITS" : guitarDraft ? "GUITAR DRAFT · REVIEW FRETS" : bassDraft ? "BASS DRAFT · ESTIMATED NOTES" : "READY FOR THE SETLIST"}
            </div>
            <h3
              ref={previewTitleRef}
              id="song-preview-title"
              tabIndex={-1}
              className="break-words font-display text-xl font-semibold tracking-tight"
            >
              {candidate.name}
            </h3>
            <p className="mt-1 break-all text-xs leading-relaxed text-muted">
              {candidate.fileName}
            </p>
            {candidate.kind === "audio" ? (
              <p className="mt-2 text-xs leading-relaxed text-accent">
                {fullBandDraft ? "Full-band draft · aligned instrument parts with the original recording" : keysDraft ? "Keyboard draft · estimated pitches, timing and holds" : drumDraft ? "Drum draft · estimated types and timing" : guitarDraft ? "Guitar draft · estimated pitches, strings and frets" : bassDraft ? "Bass draft · estimated pitches and holds" : vocalDraft ? "Vocal phrases · timing only" : "Rhythm chart · detected hits"}
              </p>
            ) : null}
            {audioDraft && candidate.stemName ? <p className="mt-2 break-all text-xs leading-relaxed text-muted">Analysis stem: {candidate.stemName}. The original song supplies backing audio.</p> : null}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 font-mono text-sm tabular-nums">
              <span>
                {Number(candidate.bpm.toFixed(2))}{" "}
                <span className="text-xs text-muted">
                  {estimatedDraft ? "COUNT-IN BPM" : candidate.kind === "audio" ? "EST. BPM" : "BPM"}
                </span>
              </span>
              <span>
                {formatTime(Math.ceil(candidate.duration))}{" "}
                <span className="text-xs text-muted">DURATION</span>
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {INSTRUMENTS.filter((instrument) => candidate.counts[instrument] > 0).map(
                (instrument) => (
                  <div
                    key={instrument}
                    className="flex flex-wrap items-baseline justify-between gap-x-2"
                  >
                    <dt className="text-muted">{LABELS[instrument]}</dt>
                    <dd className="font-mono text-xs tabular-nums">
                      {candidate.counts[instrument].toLocaleString()}{" "}
                      {candidate.chart?.matching === "rhythm" || instrument === "drums" ? "hit" : "note"}
                      {candidate.counts[instrument] === 1 ? "" : "s"}
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {candidate.kind === "audio" && candidate.audioFile ? (
              <AudioSourcePreview file={candidate.audioFile} disabled={busy} />
            ) : null}
            {candidate.chart?.guitarMode === "strings" && onReviewApply && onReviewPending ? (
              <GuitarImportReview key={reviewKey} chart={candidate.chart} disabled={busy} audioAttached={candidate.kind === "audio"}
                onApply={onReviewApply} onPendingChange={onReviewPending} />
            ) : null}
            {audioDraft && candidate.chart && onReviewApply && onReviewPending ? (
              <AudioDraftReview key={reviewKey} chart={candidate.chart} disabled={busy} instrument={keysDraft ? "keys" : "drums"}
                audioAttached={candidate.kind === "audio"} onApply={onReviewApply} onPendingChange={onReviewPending} />
            ) : null}
            {candidate.warnings.length > 0 ? (
              <ul
                aria-label="Import notes"
                className="mt-4 list-disc space-y-2 pl-4 text-xs leading-relaxed text-tungsten"
              >
                {candidate.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`} className="break-words">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={busy || reviewPending}
              aria-busy={saving}
              onClick={onAdd}
            >
              {saving ? "Saving song…" : "Add to setlist"}{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </section>
          </>
        ) : null}

        <section
          aria-labelledby="saved-songs-title"
          className="min-w-0 border-t border-border pt-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="saved-songs-title" className="text-sm font-medium">
              Imported songs
            </h3>
            <span className="font-mono text-xs tabular-nums text-muted">{songs.length}</span>
          </div>
          {libraryWarning ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-relaxed text-tungsten"
            >
              {libraryWarning}
            </p>
          ) : null}
          {songs.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {songs.map((song) => (
                <li
                  key={song.id}
                  className="min-w-0 rounded-xl border border-border bg-surface p-3 text-fg"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <button
                      type="button"
                      aria-label={`Play ${song.name}`}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                      disabled={busy}
                      onClick={() => onSelect(song.id)}
                    >
                      <FileMusic className="size-5 shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <strong className="block break-words text-sm font-medium leading-relaxed">
                          {song.name}
                        </strong>
                        <span className="mt-0.5 block break-all text-xs leading-relaxed text-muted">
                          {song.fileName}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`Remove ${song.name}`}
                      disabled={busy}
                      onClick={() => setRemoving(song.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {removing === song.id ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-xs leading-relaxed text-muted">
                        Remove this song from your setlist? Your original file stays unchanged.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="flex-1"
                          disabled={busy}
                          onClick={() => {
                            onRemove(song.id);
                            setRemoving(null);
                          }}
                        >
                          Remove song
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="flex-1"
                          disabled={busy}
                          onClick={() => setRemoving(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-5 text-fg">
              <Music2 className="mt-0.5 size-5 shrink-0 text-tungsten" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">There’s room for your next song.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Choose a file above to preview its parts before adding it.
                </p>
              </div>
            </div>
          )}
        </section>

        <p role="status" aria-atomic="true" className="sr-only">
          {previewReady ? `${candidateName} is ready. Review the preview and add it to your setlist.` : ""}
        </p>

        <p className="mt-auto border-t border-border pt-4 text-xs leading-relaxed text-muted">
          Your files stay in this browser and are never uploaded. Keep the originals; if browser
          storage is unavailable, imports last for this visit.
        </p>
      </div>
    </div>
  );
}
