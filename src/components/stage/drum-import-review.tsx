import { useRef, useState } from "react";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRUMS } from "@/lib/midi-stage/engine";
import { serializeSharedChart, type SharedChart } from "@/lib/midi-stage/chart-format";
import { applyDrumReview, drumReviewRows } from "@/lib/midi-stage/drum-chart-review";
import "./drum-import-review.css";

const PAGE_SIZE = 16;
export function DrumImportReview({ chart, disabled, audioAttached, onApply, onPendingChange }: {
  chart: SharedChart; disabled: boolean; audioAttached: boolean; onApply: (chart: SharedChart) => void; onPendingChange: (pending: boolean) => void;
}) {
  const original = useRef(chart);
  const nextId = useRef(drumReviewRows(chart).length);
  const [rows, setRows] = useState(() => drumReviewRows(chart));
  const [tempo, setTempo] = useState(String(chart.bpm));
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const first = currentPage * PAGE_SIZE;
  const notes = chart.parts.find((part) => part.type === "drums")!.notes;
  function pending() { setDirty(true); setError(""); setNotice(""); onPendingChange(true); }
  function update(id: number, field: "time" | "pitch", value: string) {
    pending(); setRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }
  function accept(result: SharedChart, message: string) {
    onApply(result); setRows(drumReviewRows(result)); setTempo(String(result.bpm));
    nextId.current = result.parts.find((part) => part.type === "drums")!.notes.length;
    setDirty(false); setError(""); setNotice(message); onPendingChange(false);
  }
  function apply() {
    try { accept(applyDrumReview(chart, rows, tempo), "Corrections applied. Ready to add or download."); }
    catch (error) { setError(error instanceof Error ? error.message : "Check the hit values."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([serializeSharedChart(chart)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `${chart.title.replace(/[^a-z0-9_-]+/gi, "-") || "drum-draft"}.midistage.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="drum-import-review" aria-labelledby="drum-review-title">
    <div className="drum-review-row">
      <div><h4 id="drum-review-title" className="text-base font-medium">Review the drum draft</h4>
        <p className="text-xs leading-relaxed text-muted">Estimated kick, snare and hi-hat. Listen above, then correct misplaced or misidentified hits.</p></div>
      <Button type="button" variant="secondary" disabled={disabled || dirty} onClick={download}><Download size={16} aria-hidden="true" /> Download chart</Button>
    </div>
    <dl className="drum-review-counts" aria-label="Drum hit counts">{DRUMS.map((lane) => <div key={lane.pitch}><dt>{lane.name}</dt><dd>{notes.filter((note) => lane.notes!.includes(note.pitch)).length}</dd></div>)}</dl>
    <label className="drum-review-tempo">Count-in tempo<input aria-label="Drum count-in tempo" type="number" min={20} max={400} step="any" value={tempo} disabled={disabled}
      onChange={(e) => { pending(); setTempo(e.target.value); }} /><span>BPM</span></label>
    <p id="drum-review-help" className="text-xs leading-relaxed text-muted">Times are seconds in the recording. Count-in tempo changes do not move hits or stretch the audio. Toms, crash and ride can be added manually.</p>
    <div className="drum-review-table" tabIndex={0} aria-label="Drum hit review table"><table>
      <caption className="sr-only">Correct hit timing and drum assignment before adding the draft.</caption>
      <thead><tr><th scope="col">Hit</th><th scope="col">Time (s)</th><th scope="col">Drum</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
      <tbody>{rows.slice(first, first + PAGE_SIZE).map((row, i) => {
        const number = first + i + 1;
        return <tr key={row.id}><th scope="row">{number}</th>
          <td><input aria-label={`Hit ${number} time`} type="number" min={0} max={chart.duration - 0.02} step="any" value={row.time} disabled={disabled} onChange={(e) => update(row.id, "time", e.target.value)} /></td>
          <td><select aria-label={`Hit ${number} drum`} value={row.pitch} disabled={disabled} onChange={(e) => update(row.id, "pitch", e.target.value)}>{DRUMS.map((lane) => <option key={lane.pitch} value={lane.pitch}>{lane.name}</option>)}</select></td>
          <td><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Remove hit ${number}`} onClick={() => { pending(); setRows((rows) => rows.filter((r) => r.id !== row.id)); }}><Trash2 size={16} aria-hidden="true" /></Button></td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="drum-review-row text-xs text-muted"><span>{rows.length ? `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)} of ${rows.length} hits` : "No hits"}</span><div className="flex gap-2">
      <Button type="button" variant="ghost" disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous hits</Button>
      <Button type="button" variant="ghost" disabled={disabled || first + PAGE_SIZE >= rows.length} onClick={() => setPage(currentPage + 1)}>Next hits</Button></div></div>
    {error ? <p role="alert" className="text-sm text-tungsten">{error}</p> : null}
    <div className="drum-review-row justify-start">
      <Button type="button" disabled={disabled || !dirty} onClick={apply}>Apply corrections</Button>
      <Button type="button" variant="secondary" disabled={disabled || rows.length >= 6000} onClick={() => {
        const last = Math.max(0, ...rows.map((row) => Number(row.time)).filter(Number.isFinite));
        const time = Math.min(chart.duration - 0.02, last + 0.25);
        pending(); setRows((rows) => [...rows, { id: nextId.current++, time: String(time), pitch: "36", velocity: 100 }]); setPage(Math.floor(rows.length / PAGE_SIZE));
      }}><Plus size={16} aria-hidden="true" /> Add hit</Button>
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => { accept(original.current, "Original drum draft restored."); setPage(0); }}><RotateCcw size={16} aria-hidden="true" /> Restore original</Button>
    </div>
    <p role="status" className="text-xs leading-relaxed text-muted">{dirty ? "Apply or restore corrections before adding or downloading." : notice}</p>
    <p className="text-xs leading-relaxed text-muted">A draft can miss overlapping hits or mistake bass and vocals for drums. {audioAttached ? "The download contains chart data; the recording stays with this browser's saved song." : "No recording is attached to this chart preview; playback uses stage instruments."}</p>
  </section>;
}
