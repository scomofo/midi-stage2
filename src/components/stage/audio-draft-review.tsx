import { useRef, useState } from "react";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRUMS, noteName } from "@/lib/midi-stage/engine";
import { serializeSharedChart, type SharedChart } from "@/lib/midi-stage/chart-format";
import { applyDrumReview, drumReviewRows } from "@/lib/midi-stage/drum-chart-review";
import { applyKeyboardReview, keyboardReviewRows } from "@/lib/midi-stage/keyboard-chart-review";
import { confidenceBand, transcriptionConfidenceSummary } from "@/lib/midi-stage/transcription-confidence";
import "./drum-import-review.css";

const PAGE_SIZE = 16;
export function AudioDraftReview({ chart, disabled, audioAttached, onApply, onPendingChange, instrument = "drums" }: {
  chart: SharedChart; disabled: boolean; audioAttached: boolean; onApply: (chart: SharedChart) => void; onPendingChange: (pending: boolean) => void; instrument?: "drums" | "keys";
}) {
  const keyboard = instrument === "keys";
  const label = keyboard ? "Note" : "Hit";
  const titleId = keyboard ? "keyboard-review-title" : "drum-review-title";
  const reviewRows = (chart: SharedChart) => keyboard ? keyboardReviewRows(chart) : drumReviewRows(chart);
  const original = useRef(chart);
  const nextId = useRef(reviewRows(chart).length);
  const [rows, setRows] = useState<(ReturnType<typeof drumReviewRows>[number] & { duration?: string; confidence?: number })[]>(() => reviewRows(chart));
  const [tempo, setTempo] = useState(String(chart.bpm));
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const notes = chart.parts.find((part) => part.type === instrument)!.notes;
  const confidence = transcriptionConfidenceSummary(notes);
  const visibleRows = keyboard && showNeedsReview
    ? rows.filter((row) => row.confidence !== undefined && confidenceBand(row.confidence) !== "high")
    : rows;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visibleRows.length / PAGE_SIZE) - 1));
  const first = currentPage * PAGE_SIZE;
  function pending() { setDirty(true); setError(""); setNotice(""); onPendingChange(true); }
  function update(id: number, field: "time" | "pitch" | "duration", value: string) {
    pending(); setRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }
  function accept(result: SharedChart, message: string) {
    onApply(result); setRows(reviewRows(result)); setTempo(String(result.bpm));
    nextId.current = result.parts.find((part) => part.type === instrument)!.notes.length;
    setDirty(false); setError(""); setNotice(message); onPendingChange(false);
  }
  function apply() {
    try { accept(keyboard ? applyKeyboardReview(chart, rows.map((r) => ({ ...r, duration: r.duration ?? "" })), tempo) : applyDrumReview(chart, rows, tempo), "Corrections applied. Ready to add or download."); }
    catch (error) { setError(error instanceof Error ? error.message : "Check the hit values."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([serializeSharedChart(chart)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `${chart.title.replace(/[^a-z0-9_-]+/gi, "-") || "drum-draft"}.midistage.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="drum-import-review" aria-labelledby={titleId}>
    <div className="drum-review-row">
      <div><h4 id={titleId} className="text-base font-medium">Review the {keyboard ? "keyboard" : "drum"} draft</h4>
        <p className="text-xs leading-relaxed text-muted">{keyboard ? "Estimated pitches, chords and holds. Listen above, then correct notes and lengths." : "Estimated kick, snare and hi-hat. Listen above, then correct misplaced or misidentified hits."}</p></div>
      <Button type="button" variant="secondary" disabled={disabled || dirty} onClick={download}><Download size={16} aria-hidden="true" /> Download chart</Button>
    </div>
    {keyboard ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-xs text-muted">{notes.length} notes · {noteName(Math.min(...notes.map((n) => n.pitch)))}–{noteName(Math.max(...notes.map((n) => n.pitch)))} · {confidence.needsReview} need review</p>
      {confidence.scored ? <Button type="button" size="sm" variant={showNeedsReview ? "primary" : "secondary"} onClick={() => { setShowNeedsReview((value) => !value); setPage(0); }}>
        {showNeedsReview ? "Show all notes" : "Show needs review"}
      </Button> : null}
    </div>
      : <dl className="drum-review-counts" aria-label="Drum hit counts">{DRUMS.map((lane) => <div key={lane.pitch}><dt>{lane.name}</dt><dd>{notes.filter((note) => lane.notes!.includes(note.pitch)).length}</dd></div>)}</dl>}
    <label className="drum-review-tempo">Count-in tempo<input aria-label={`${keyboard ? "Keyboard" : "Drum"} count-in tempo`} type="number" min={20} max={400} step="any" value={tempo} disabled={disabled}
      onChange={(e) => { pending(); setTempo(e.target.value); }} /><span>BPM</span></label>
    <p className="text-xs leading-relaxed text-muted">{keyboard ? "Times and lengths are recording seconds. Pitches include octaves from A0 to C8. Chord notes can share a start time. Count-in changes do not move notes or stretch the audio." : "Times are seconds in the recording. Count-in tempo changes do not move hits or stretch the audio. Toms, crash and ride can be added manually."}</p>
    <div className="drum-review-table" tabIndex={0} aria-label={`${keyboard ? "Keyboard note" : "Drum hit"} review table`}><table>
      <caption className="sr-only">Correct {keyboard ? "note timing, length and pitch" : "hit timing and drum assignment"} before adding the draft.</caption>
      <thead><tr><th scope="col">{label}</th><th scope="col">Time (s)</th>{keyboard ? <th scope="col">Length (s)</th> : null}<th scope="col">{keyboard ? "Pitch" : "Drum"}</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
      <tbody>{visibleRows.slice(first, first + PAGE_SIZE).map((row, i) => {
        const number = first + i + 1;
        const band = confidenceBand(row.confidence);
        return <tr key={row.id} data-confidence={band}><th scope="row">{number}{keyboard && band !== "unknown" ? <span className="ml-1 text-[10px] text-muted">· {band}</span> : null}</th>
          <td><input aria-label={`${label} ${number} time`} type="number" min={0} max={chart.duration - 0.02} step="any" value={row.time} disabled={disabled} onChange={(e) => update(row.id, "time", e.target.value)} /></td>
          {keyboard ? <td><input aria-label={`Note ${number} length`} type="number" min={0.02} max={chart.duration} step="any" value={row.duration ?? ""} disabled={disabled} onChange={(e) => update(row.id, "duration", e.target.value)} /></td> : null}
          <td><select aria-label={`${label} ${number} ${keyboard ? "pitch" : "drum"}`} value={row.pitch} disabled={disabled} onChange={(e) => update(row.id, "pitch", e.target.value)}>{keyboard
            ? Array.from({ length: 88 }, (_, i) => i + 21).map((pitch) => <option key={pitch} value={pitch}>{noteName(pitch)} · {pitch}</option>)
            : DRUMS.map((lane) => <option key={lane.pitch} value={lane.pitch}>{lane.name}</option>)}</select></td>
          <td><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Remove ${label.toLowerCase()} ${number}`} onClick={() => { pending(); setRows((rows) => rows.filter((r) => r.id !== row.id)); }}><Trash2 size={16} aria-hidden="true" /></Button></td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="drum-review-row text-xs text-muted"><span>{visibleRows.length ? `${first + 1}–${Math.min(first + PAGE_SIZE, visibleRows.length)} of ${visibleRows.length} ${keyboard ? "notes" : "hits"}` : keyboard ? "No notes in this confidence filter" : "No hits"}</span><div className="flex gap-2">
      <Button type="button" variant="ghost" disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous {keyboard ? "notes" : "hits"}</Button>
      <Button type="button" variant="ghost" disabled={disabled || first + PAGE_SIZE >= visibleRows.length} onClick={() => setPage(currentPage + 1)}>Next {keyboard ? "notes" : "hits"}</Button></div></div>
    {error ? <p role="alert" className="text-sm text-tungsten">{error}</p> : null}
    <div className="drum-review-row justify-start">
      <Button type="button" disabled={disabled || !dirty} onClick={apply}>Apply corrections</Button>
      <Button type="button" variant="secondary" disabled={disabled || rows.length >= 6000} onClick={() => {
        const last = Math.max(0, ...rows.map((row) => Number(row.time)).filter(Number.isFinite));
        const time = Math.min(chart.duration - 0.02, last + 0.25);
        pending(); setRows((rows) => [...rows, { id: nextId.current++, time: String(time), pitch: keyboard ? "60" : "36", velocity: 100, ...(keyboard ? { duration: String(Math.min(0.4, chart.duration - time)) } : {}) }]); setPage(Math.floor(rows.length / PAGE_SIZE));
      }}><Plus size={16} aria-hidden="true" /> Add {label.toLowerCase()}</Button>
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => { accept(original.current, `Original ${keyboard ? "keyboard" : "drum"} draft restored.`); setPage(0); }}><RotateCcw size={16} aria-hidden="true" /> Restore original</Button>
    </div>
    <p role="status" className="text-xs leading-relaxed text-muted">{dirty ? "Apply or restore corrections before adding or downloading." : notice}</p>
    <p className="text-xs leading-relaxed text-muted">{keyboard ? "Transcription can miss soft notes or add harmonics. Review chord voicings and pedal-length holds." : "A draft can miss overlapping hits or mistake bass and vocals for drums."} {audioAttached ? "The download contains chart data; the recording stays with this browser's saved song." : "No recording is attached to this chart preview; playback uses stage instruments."}</p>
  </section>;
}
