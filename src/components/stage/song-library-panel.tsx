import { useRef, useState } from "react";
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
import { formatTime } from "@/lib/midi-stage/engine";
import { LABELS } from "@/lib/midi-stage/songs";
import { INSTRUMENTS, type Instrument } from "@/lib/midi-stage/types";
import { cn } from "@/lib/utils";

type SongLibraryPanelProps = {
  candidate: {
    kind?: "audio" | "midi" | "chart";
    name: string;
    fileName: string;
    bpm: number;
    duration: number;
    counts: Record<Instrument, number>;
    warnings: string[];
  } | null;
  reading: boolean;
  saving?: boolean;
  error: string | null;
  libraryWarning: string | null;
  songs: { id: string; name: string; fileName: string }[];
  onFile: (file: File) => void;
  onAdd: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

export function SongLibraryPanel({
  candidate,
  reading,
  saving = false,
  error,
  libraryWarning,
  songs,
  onFile,
  onAdd,
  onClose,
  onSelect,
  onRemove,
}: SongLibraryPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const busy = reading || saving;

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
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-widest text-accent">MAKE THE SET YOURS</div>
          <h2
            id="song-library-title"
            className="mt-1 font-display text-3xl font-semibold tracking-tight"
          >
            Your songs
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Audio, MIDI or a Stage chart. Bring your own track to the stage.
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <div>
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
              type="file"
              accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.webm,.mid,.midi,.json,audio/*"
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
            track. Audio creates a one-lane rhythm chart and plays your original track. Up to 50 MB
            and 6 minutes.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            MIDI (.mid, .midi) and Stage charts (.midistage.json) keep pitch notes and play
            synthesized instruments. Up to 4 MB; tempo changes aren’t supported for these files.
          </p>
          {reading ? (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-accent">
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Reading your song…
            </p>
          ) : null}
          {fileNotice || error ? (
            <p
              role="alert"
              className="mt-3 break-words rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-relaxed text-tungsten"
            >
              {fileNotice || error}
            </p>
          ) : null}
        </div>

        {candidate ? (
          <section
            aria-labelledby="song-preview-title"
            className="min-w-0 rounded-xl border border-accent/30 bg-surface p-4 text-fg"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-widest text-accent">
              <Check className="size-4" aria-hidden="true" /> READY FOR THE SETLIST
            </div>
            <h3
              id="song-preview-title"
              className="break-words font-display text-xl font-semibold tracking-tight"
            >
              {candidate.name}
            </h3>
            <p className="mt-1 break-all text-xs leading-relaxed text-muted">
              {candidate.fileName}
            </p>
            {candidate.kind === "audio" ? (
              <p className="mt-2 text-xs leading-relaxed text-accent">
                Rhythm chart · detected hits
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 font-mono text-sm tabular-nums">
              <span>
                {Number(candidate.bpm.toFixed(2))}{" "}
                <span className="text-xs text-muted">
                  {candidate.kind === "audio" ? "EST. BPM" : "BPM"}
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
                      {candidate.kind === "audio" ? "hit" : "note"}
                      {candidate.counts[instrument] === 1 ? "" : "s"}
                    </dd>
                  </div>
                ),
              )}
            </dl>
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
              disabled={busy}
              aria-busy={saving}
              onClick={onAdd}
            >
              {saving ? "Saving song…" : "Add to setlist"}{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </section>
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
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:text-accent"
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

        <p className="mt-auto border-t border-border pt-4 text-xs leading-relaxed text-muted">
          Your files stay in this browser and are never uploaded. Keep the originals; if browser
          storage is unavailable, imports last for this visit.
        </p>
      </div>
    </div>
  );
}
