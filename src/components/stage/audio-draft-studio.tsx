import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, Redo2, RotateCcw, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRUMS, noteName } from "@/lib/midi-stage/engine";
import { serializeSharedChart, type SharedChart } from "@/lib/midi-stage/chart-format";
import { restoreAudioPart, type AudioReviewInstrument } from "@/lib/midi-stage/audio-part-review";
import { acceptGuitarCandidate, guitarCandidateRow, audioReviewDraftKey, audioReviewPitch, audioReviewRows, applyAudioReviewDraft, createAudioReviewHistory, needsAudioReview, pushAudioReviewHistory, redoAudioReview, selectedAudioReviewRow, undoAudioReview, type AudioReviewHistory, type AudioReviewRow } from "@/lib/midi-stage/audio-review-session";
import type { GuitarCandidateDecisions, ShortChordCandidate } from "@/lib/midi-stage/guitar-short-chord-audit";
import { AudioSourcePreview } from "./audio-source-preview";
import { AudioPartAudition } from "./audio-part-audition";
import { AudioReviewWaveform } from "./audio-review-waveform";
import { GuitarChordSuggestions } from "./guitar-chord-suggestions";
import "./audio-draft-studio.css";

const QUEUE_SIZE = 40;
export function AudioDraftStudio({ chart, instrument, audioFile, buffer, disabled, onApply, onPendingChange, originalChart, guitarCandidates, guitarReviewDecisions }: {
  chart: SharedChart; instrument: AudioReviewInstrument; audioFile?: File; buffer?: AudioBuffer; disabled: boolean;
  onApply: (chart: SharedChart, decisions?: GuitarCandidateDecisions) => void; onPendingChange: (pending: boolean) => void; originalChart?: SharedChart;
  guitarCandidates?: ShortChordCandidate[]; guitarReviewDecisions?: GuitarCandidateDecisions;
}) {
  const original = useRef(originalChart ?? chart);
  const roll = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState(() => createAudioReviewHistory(chart, instrument, instrument === "guitar" ? guitarReviewDecisions : undefined));
  const baseline = useRef(audioReviewDraftKey(history.present));
  const nextId = useRef(history.present.rows.length);
  const { rows, tempo, selectedId } = history.present;
  const selectedIndex = rows.findIndex((row) => row.id === selectedId), selected = rows[selectedIndex];
  const dirty = audioReviewDraftKey(history.present) !== baseline.current;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onlyReview, setOnlyReview] = useState(false);
  const [queuePage, setQueuePage] = useState(0);
  const [windowSize, setWindowSize] = useState(8);
  const [from, setFrom] = useState(() => Math.max(0, Number(rows[0]?.time ?? 0) - 0.5));
  const [startRequest, setStartRequest] = useState<{ time: number; key: number }>();
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(() => instrument === "guitar"
    ? guitarCandidates?.find((item) => !guitarReviewDecisions?.[item.id])?.id ?? guitarCandidates?.[0]?.id ?? null : null);
  const candidates = instrument === "guitar" ? guitarCandidates ?? [] : [];
  const candidate = candidates.find((item) => item.id === candidateId);
  const decisions = history.present.candidateDecisions ?? {};
  const { proposed, proposalError } = useMemo(() => {
    if (!candidate || history.present.candidateDecisions?.[candidate.id]) return {};
    try { return { proposed: guitarCandidateRow(chart, history.present, candidate, nextId.current) }; }
    catch (reason) { return { proposalError: reason instanceof Error ? reason.message : "Review nearby notes first." }; }
  }, [chart, history.present, candidate]);
  const span = Math.min(windowSize, chart.duration);
  const viewStart = Math.max(0, Math.min(from, chart.duration - span));
  useEffect(() => {
    const viewport = roll.current;
    const gem = viewport?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (viewport && gem && (gem.offsetTop < viewport.scrollTop || gem.offsetTop + 22 > viewport.scrollTop + viewport.clientHeight)) {
      viewport.scrollTop = Math.max(0, gem.offsetTop - viewport.clientHeight / 2 + 11);
    }
  }, [selectedId, viewStart, span]);
  const label = instrument === "drums" ? "Hit" : "Note";
  const name = instrument === "keys" ? "keyboard" : instrument === "drums" ? "drum" : instrument;
  const needsReview = rows.filter(needsAudioReview);
  const queue = onlyReview ? needsReview : rows;
  const page = Math.max(0, Math.min(queuePage, Math.ceil(queue.length / QUEUE_SIZE) - 1));
  const pitch = (row: AudioReviewRow) => audioReviewPitch(row, instrument, chart.guitarTuning);
  const describe = (row: AudioReviewRow) => instrument === "guitar" ? `String ${row.string} · fret ${row.fret}`
    : instrument === "drums" ? DRUMS.find((lane) => lane.pitch === Number(row.pitch))?.name ?? "Drum"
      : Number.isFinite(pitch(row)) ? noteName(pitch(row)) : "Choose pitch";

  function commit(next: AudioReviewHistory) {
    setHistory(next); setError(""); setNotice("");
    onPendingChange(audioReviewDraftKey(next.present) !== baseline.current);
  }
  function select(row: AudioReviewRow, seek = true) {
    setHistory((current) => ({ ...current, present: { ...current.present, selectedId: row.id } }));
    const time = Number(row.time);
    if (Number.isFinite(time)) {
      if (time < viewStart || time >= viewStart + span) setFrom(Math.max(0, time - span / 4));
      if (seek) setStartRequest((last) => ({ time: Math.max(0, time - 0.2), key: (last?.key ?? 0) + 1 }));
    }
    setQueuePage(Math.max(0, Math.floor(queue.findIndex((item) => item.id === row.id) / QUEUE_SIZE)));
  }
  function update(field: keyof AudioReviewRow, value: string) {
    if (!selected) return;
    commit(pushAudioReviewHistory(history, { ...history.present, rows: rows.map((row) => row.id === selectedId ? { ...row, [field]: value } : row) }));
  }
  function selectCandidate(item: ShortChordCandidate) {
    setCandidateId(item.id);
    setFrom(Math.max(0, item.time - Math.min(windowSize, chart.duration) / 4));
    setStartRequest((last) => ({ time: Math.max(0, item.time - 0.2), key: (last?.key ?? 0) + 1 }));
  }
  function acceptCandidate(item: ShortChordCandidate) {
    try {
      const draft = acceptGuitarCandidate(chart, history.present, item, nextId.current);
      nextId.current++;
      commit(pushAudioReviewHistory(history, draft));
      setOnlyReview(false); setQueuePage(Math.floor(draft.rows.findIndex((row) => row.id === draft.selectedId) / QUEUE_SIZE));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This tone could not be accepted."); }
  }
  function decideCandidate(item: ShortChordCandidate, decision?: "dismissed") {
    const next = { ...decisions };
    if (decision) next[item.id] = decision; else delete next[item.id];
    commit(pushAudioReviewHistory(history, { ...history.present, candidateDecisions: next }));
  }
  function accept(result: SharedChart, message: string, resetSelection = false) {
    const nextRows = audioReviewRows(result, instrument);
    const closest = selectedAudioReviewRow(nextRows, selected, instrument);
    const candidateDecisions = instrument === "guitar" ? resetSelection ? {} : history.present.candidateDecisions : undefined;
    const draft = { rows: nextRows, tempo: String(result.bpm), selectedId: (resetSelection ? nextRows[0]?.id : closest?.id) ?? nextRows[0]?.id ?? null, candidateDecisions };
    baseline.current = audioReviewDraftKey(draft);
    setHistory({ past: [], present: draft, future: [] });
    nextId.current = nextRows.length;
    if (resetSelection) { setQueuePage(0); setOnlyReview(false); setFrom(Math.max(0, Number(nextRows[0]?.time ?? 0) - 0.5)); }
    // A fresh applied chart restores the audition's default first-note start.
    setStartRequest(undefined); setPlayhead(null);
    setError(""); setNotice(message); onPendingChange(false); onApply(result, candidateDecisions);
  }
  function apply() {
    try { accept(applyAudioReviewDraft(chart, instrument, history.present), "Corrections applied. Ready to add or download."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Check the note values."); }
  }
  function add() {
    const last = Math.max(0, ...rows.map((row) => Number(row.time)).filter(Number.isFinite));
    const time = Math.min(chart.duration - 0.02, last + 0.25);
    const row: AudioReviewRow = { id: nextId.current++, time: String(time), duration: String(Math.min(0.25, chart.duration - time)),
      pitch: instrument === "drums" ? "36" : instrument === "bass" ? "40" : "60", string: "6", fret: "0", velocity: 100 };
    setOnlyReview(false); setQueuePage(Math.floor(rows.length / QUEUE_SIZE));
    setFrom(Math.max(0, time - span / 2));
    commit(pushAudioReviewHistory(history, { ...history.present, rows: [...rows, row], selectedId: row.id }));
  }
  function zoom(size: number) {
    const time = Number(selected?.time);
    const focus = Number.isFinite(time) && time >= viewStart && time < viewStart + span ? time : viewStart + span / 2;
    setFrom(Math.max(0, focus - Math.min(size, chart.duration) / 2)); setWindowSize(size);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([serializeSharedChart(chart)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${chart.title.replace(/[^a-z0-9_-]+/gi, "-") || "draft"}.midistage.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const lanes = instrument === "guitar" ? [1, 2, 3, 4, 5, 6] : instrument === "drums" ? DRUMS.map((lane) => lane.pitch)
    : [...new Set(rows.map(pitch).filter(Number.isFinite))].sort((a, b) => b - a);
  const laneOf = (row: AudioReviewRow) => instrument === "guitar" ? Number(row.string) : pitch(row);
  const visibleNotes = rows.filter((row) => Number(row.time) < viewStart + span && Number(row.time) + Number(row.duration) > viewStart);
  const audition = { chart, instrument, buffer, pending: dirty, startRequest, selectedTime: Number(selected?.time), selectedPitch: selected ? pitch(selected) : undefined, suggestion: candidate, onPosition: setPlayhead };

  return <section className="audio-draft-studio" aria-label={`${name} review studio`}>
    <header className="studio-heading">
      <div><p className="studio-eyebrow">REVIEW STUDIO</p><h4>Review the {name} draft</h4>
        <p>Listen, select a note, make it yours. Amber notes are a good place to start.</p></div>
      <div className="studio-summary"><strong>{rows.length}</strong> {label.toLowerCase()}s <span>·</span> <strong>{needsReview.length}</strong> need review</div>
    </header>
    <GuitarChordSuggestions candidates={candidates} decisions={decisions} selected={candidate} position={proposed} positionError={proposalError ?? ""}
      disabled={disabled} onSelect={selectCandidate} onAccept={acceptCandidate} onDecision={decideCandidate} />
    <div className="studio-workspace">
      <div className="studio-arrangement">
        <div className="studio-timeline-tools">
          <strong>Recording timeline</strong>
          <div><Button size="icon" variant="ghost" aria-label="Zoom out timeline" disabled={windowSize >= 32} onClick={() => zoom(Math.min(32, windowSize * 2))}><ZoomOut size={16} /></Button>
            <span className="studio-mono">{span.toFixed(1)}s</span>
            <Button size="icon" variant="ghost" aria-label="Zoom in timeline" disabled={windowSize <= 1} onClick={() => zoom(Math.max(1, windowSize / 2))}><ZoomIn size={16} /></Button></div>
        </div>
        <div className="studio-time-ruler" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i}>{(viewStart + span * i / 4).toFixed(2)}s</span>)}</div>
        <button type="button" className="studio-waveform-seek" aria-label="Seek preview on recording waveform" disabled={disabled || dirty}
          onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const fraction = event.detail === 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); setStartRequest((last) => ({ time: Math.max(0, Math.min(chart.duration - 0.02, viewStart + fraction * span)), key: (last?.key ?? 0) + 1 })); }}>
          <AudioReviewWaveform buffer={buffer} from={viewStart} span={span} audioOffset={chart.audioOffset} />
        </button>
        <div ref={roll} className="studio-roll" role="group" tabIndex={0} aria-label="Note timeline. Use left and right arrows to select notes."
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const row = rows[Math.max(0, Math.min(rows.length - 1, selectedIndex + (event.key === "ArrowLeft" ? -1 : 1)))]; if (row) select(row); }
          }}>
          <div className="studio-roll-content" style={{ height: Math.max(1, lanes.length) * 30 }}>
            {lanes.map((lane, i) => <div className="studio-lane" key={lane} style={{ top: i * 30 }}>
              <span>{instrument === "guitar" ? `${lane} · ${noteName(chart.guitarTuning![6 - lane]!)}` : instrument === "drums" ? DRUMS.find((drum) => drum.pitch === lane)!.short : noteName(lane)}</span>
            </div>)}
            <div className="studio-gems">
              {visibleNotes.map((row) => {
                const lane = lanes.indexOf(laneOf(row)), time = Number(row.time), length = Number(row.duration);
                if (lane < 0 || !Number.isFinite(time) || !Number.isFinite(length)) return null;
                const left = Math.max(0, (time - viewStart) / span * 100), right = Math.min(100, (time + length - viewStart) / span * 100);
                return <button type="button" key={row.id} className="studio-gem" aria-label={`Select ${label.toLowerCase()} ${rows.indexOf(row) + 1}: ${describe(row)} at ${time.toFixed(3)} seconds`}
                  aria-pressed={row.id === selectedId} data-review={needsAudioReview(row)} disabled={disabled} onClick={() => select(row)}
                  style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%`, top: lane * 30 + 4 }}>
                  {instrument === "guitar" ? row.fret : instrument === "drums" ? "●" : noteName(pitch(row))}
                </button>;
              })}
              {candidate && proposed && candidate.time < viewStart + span && candidate.time + candidate.estimatedDuration > viewStart ? <div
                className="studio-gem studio-suggestion-gem" aria-hidden="true" title={`Unverified ${noteName(candidate.pitchMidi)} suggestion`}
                style={{ left: `${Math.max(0, (candidate.time - viewStart) / span * 100)}%`,
                  width: `${Math.max(0.5, (Math.min(viewStart + span, candidate.time + candidate.estimatedDuration) - Math.max(viewStart, candidate.time)) / span * 100)}%`,
                  top: lanes.indexOf(Number(proposed.string)) * 30 + 4 }}>?</div> : null}
              {playhead !== null && playhead >= viewStart && playhead <= viewStart + span ? <div className="studio-playhead" style={{ left: `${(playhead - viewStart) / span * 100}%` }} /> : null}
            </div>
          </div>
        </div>
        <label className="studio-pan">Move through recording<input aria-label="Timeline position" type="range" min={0} max={Math.max(0, chart.duration - span)} step="0.05" value={viewStart} onChange={(event) => setFrom(Number(event.target.value))} /><span className="studio-mono">{viewStart.toFixed(2)}s</span></label>
        <div className="studio-listen">{audioFile ? <AudioSourcePreview file={audioFile} disabled={disabled || dirty} review={audition} />
          : <AudioPartAudition {...audition} disabled={disabled || dirty} />}</div>
      </div>
      <aside className="studio-inspector" aria-label="Selected note editor">
        <div className="studio-inspector-title"><div><p className="studio-eyebrow">SELECTED {label.toUpperCase()}</p><h5>{selected ? describe(selected) : "Choose a note"}</h5></div>
          <span className="studio-mono">{selected ? `${selectedIndex + 1} / ${rows.length}` : "—"}</span></div>
        <div className="studio-note-nav"><Button size="icon" variant="secondary" aria-label="Previous note" disabled={disabled || selectedIndex <= 0} onClick={() => select(rows[selectedIndex - 1]!)}><ChevronLeft size={16} /></Button>
          <Button variant="secondary" size="sm" disabled={disabled || !needsReview.length} onClick={() => { const row = needsReview.find((item) => rows.indexOf(item) > selectedIndex) ?? needsReview[0]; if (row) { setOnlyReview(false); select(row); setQueuePage(Math.floor(rows.indexOf(row) / QUEUE_SIZE)); } }}>Next needs review</Button>
          <Button size="icon" variant="secondary" aria-label="Next note" disabled={disabled || selectedIndex >= rows.length - 1} onClick={() => select(rows[selectedIndex + 1]!)}><ChevronRight size={16} /></Button></div>
        {selected ? <>
          <p className="studio-confidence" data-review={needsAudioReview(selected)}>{selected.confidence === undefined ? "Confidence unavailable · check by ear" : needsAudioReview(selected) ? "Lower estimated confidence · check by ear" : "Higher estimated confidence · compare with the recording"}</p>
          <div className="studio-fields">
            <label>Start <span>seconds</span><input aria-label={`${label} ${selectedIndex + 1} time`} type="number" min={0} max={chart.duration} step="any" value={selected.time} disabled={disabled} onChange={(event) => update("time", event.target.value)} /></label>
            <label>Length <span>seconds</span><input aria-label={`${label} ${selectedIndex + 1} length`} type="number" min={0.02} max={chart.duration} step="any" value={selected.duration} disabled={disabled} onChange={(event) => update("duration", event.target.value)} /></label>
            {instrument === "guitar" ? <>
              <label>String<select aria-label={`Note ${selectedIndex + 1} string`} value={selected.string} disabled={disabled} onChange={(event) => update("string", event.target.value)}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} · {noteName(chart.guitarTuning![6 - value]!)}</option>)}</select></label>
              <label>Fret<input aria-label={`Note ${selectedIndex + 1} fret`} type="number" min={0} max={24} value={selected.fret} disabled={disabled} onChange={(event) => update("fret", event.target.value)} /></label>
            </> : <label className="studio-field-wide">{instrument === "drums" ? "Drum" : "Pitch"}<select aria-label={`${label} ${selectedIndex + 1} ${instrument === "drums" ? "drum" : "pitch"}`} value={selected.pitch} disabled={disabled} onChange={(event) => update("pitch", event.target.value)}>
              {instrument === "drums" ? DRUMS.map((lane) => <option key={lane.pitch} value={lane.pitch}>{lane.name}</option>)
                : Array.from({ length: instrument === "bass" ? 40 : 88 }, (_, i) => i + (instrument === "bass" ? 28 : 21)).map((value) => <option key={value} value={value}>{noteName(value)} · {value}</option>)}
            </select></label>}
          </div>
          <Button variant="ghost" className="studio-delete" disabled={disabled} aria-label={`Remove ${label.toLowerCase()} ${selectedIndex + 1}`} onClick={() => {
            const remaining = rows.filter((row) => row.id !== selectedId);
            commit(pushAudioReviewHistory(history, { ...history.present, rows: remaining, selectedId: remaining[Math.min(selectedIndex, remaining.length - 1)]?.id ?? null }));
          }}><Trash2 size={15} /> Remove {label.toLowerCase()}</Button>
        </> : <p className="text-sm text-muted">Add a note or undo the last deletion to continue.</p>}
        <div className="studio-count-in"><label>Count-in tempo<input aria-label={`${instrument === "keys" ? "Keyboard" : instrument === "drums" ? "Drum" : instrument === "bass" ? "Bass" : "Guitar"} count-in tempo`} type="number" min={20} max={400} step="any" value={tempo} disabled={disabled} onChange={(event) => commit(pushAudioReviewHistory(history, { ...history.present, tempo: event.target.value }))} /><span>BPM</span></label>
          <p>Notes stay on the recording clock. Tempo only changes the count-in.</p></div>
      </aside>
    </div>
    <div className="studio-queue-heading"><strong>Note queue</strong><Button size="sm" variant={onlyReview ? "primary" : "secondary"} onClick={() => { setOnlyReview(!onlyReview); setQueuePage(0); }}>{onlyReview ? "Show all notes" : "Show needs review"}</Button>
      <span>Amber = below high confidence or unscored. Confidence is not a pitch accuracy score.</span></div>
    <div className="studio-queue" aria-label="Note queue">{queue.slice(page * QUEUE_SIZE, (page + 1) * QUEUE_SIZE).map((row) => <button type="button" key={row.id} disabled={disabled} aria-label={`Edit ${label.toLowerCase()} ${rows.indexOf(row) + 1}`} aria-pressed={selectedId === row.id} data-review={needsAudioReview(row)} onClick={() => select(row)}>
      <span className="studio-mono">{Number(row.time).toFixed(3)}s</span><strong>{describe(row)}</strong><span>{Number(row.duration).toFixed(3)}s</span></button>)}
      {!queue.length ? <p>No notes in this filter.</p> : null}</div>
    {queue.length > QUEUE_SIZE ? <div className="studio-queue-pagination"><Button size="sm" variant="ghost" disabled={!page} onClick={() => setQueuePage(page - 1)}>Previous notes</Button><span>{page * QUEUE_SIZE + 1}–{Math.min((page + 1) * QUEUE_SIZE, queue.length)} of {queue.length}</span><Button size="sm" variant="ghost" disabled={(page + 1) * QUEUE_SIZE >= queue.length} onClick={() => setQueuePage(page + 1)}>Next notes</Button></div> : null}
    <footer className="studio-actions">
      <div><Button disabled={disabled || !dirty} onClick={apply}>Apply corrections</Button>
        <Button variant="secondary" size="icon" aria-label="Undo note edit" disabled={disabled || !history.past.length} onClick={() => commit(undoAudioReview(history))}><Undo2 size={16} /></Button>
        <Button variant="secondary" size="icon" aria-label="Redo note edit" disabled={disabled || !history.future.length} onClick={() => commit(redoAudioReview(history))}><Redo2 size={16} /></Button>
        <Button variant="secondary" disabled={disabled || rows.length >= 6000} onClick={add}><Plus size={16} /> Add {label.toLowerCase()}</Button></div>
      <div><Button variant="ghost" disabled={disabled} onClick={() => accept(chart.origin === "audio-full-band-draft" ? restoreAudioPart(chart, original.current, instrument) : original.current, `Original ${name} draft restored.`, true)}><RotateCcw size={15} /> Restore original</Button>
        <Button variant="secondary" disabled={disabled || dirty} onClick={download}><Download size={15} /> Download chart</Button></div>
    </footer>
    {error ? <p role="alert" className="studio-message studio-error">{error}</p> : null}
    <p role="status" className="studio-message">{dirty ? "Unapplied corrections · apply or undo before listening, switching parts, adding or downloading." : notice || "Select notes on the timeline or in the queue. Corrections stay local until you add the song."}</p>
  </section>;
}
