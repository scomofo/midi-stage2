import { useRef, useState } from "react";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { noteName } from "@/lib/midi-stage/engine";
import { serializeSharedChart, type SharedChart } from "@/lib/midi-stage/chart-format";
import { applyGuitarReview, guitarReviewRows, type GuitarReviewRow } from "@/lib/midi-stage/guitar-chart-review";
import { confidenceBand, transcriptionConfidenceSummary } from "@/lib/midi-stage/transcription-confidence";
import { duplicateRows, quantizeRows, shiftRows } from "@/lib/midi-stage/authoring-operations";
import "./guitar-import-review.css";

const PAGE_SIZE = 16;

export function GuitarImportReview({ chart, disabled, onApply, onPendingChange }: {
  chart: SharedChart;
  disabled: boolean;
  onApply: (chart: SharedChart) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const original = useRef(chart);
  const nextId = useRef(chart.parts.find((part) => part.type === "guitar")!.notes.length);
  const [rows, setRows] = useState(() => guitarReviewRows(chart));
  const [tempo, setTempo] = useState(String(chart.bpm));
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const confidence = transcriptionConfidenceSummary(chart.parts.find((part) => part.type === "guitar")!.notes);
  const visibleRows = showNeedsReview
    ? rows.filter((row) => row.confidence !== undefined && confidenceBand(row.confidence) !== "high")
    : rows;
  const pages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const first = currentPage * PAGE_SIZE;

  function pending() {
    setDirty(true);
    setError("");
    setNotice("");
    onPendingChange(true);
  }
  function update(id: number, field: keyof GuitarReviewRow, value: string) {
    pending();
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }
  function apply() {
    try {
      const result = applyGuitarReview(chart, rows, tempo);
      onApply(result);
      setRows(guitarReviewRows(result));
      nextId.current = result.parts.find((part) => part.type === "guitar")!.notes.length;
      setTempo(String(result.bpm));
      setDirty(false);
      setError("");
      setNotice("Corrections applied. The reviewed arrangement is ready to add or download.");
      onPendingChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the note values and try again.");
    }
  }
  function restore() {
    const source = original.current;
    onApply(source);
    setRows(guitarReviewRows(source));
    nextId.current = source.parts.find((part) => part.type === "guitar")!.notes.length;
    setTempo(String(source.bpm));
    setPage(0);
    setSelected(new Set());
    setDirty(false);
    setError("");
    setNotice("Original arrangement restored.");
    onPendingChange(false);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([serializeSharedChart(chart)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chart.title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "guitar-arrangement"}.midistage.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="guitar-import-review" aria-labelledby="guitar-review-title">
      <div className="guitar-review-heading">
        <div>
          <h4 id="guitar-review-title">Review the guitar arrangement</h4>
          <p>Six strings, authored frets. String 1 is the highest string; string 6 is the lowest.</p>
        </div>
        <Button type="button" variant="secondary" disabled={disabled || dirty} onClick={download}>
          <Download size={16} aria-hidden="true" /> Download chart
        </Button>
      </div>
      {confidence.scored ? <div className="guitar-review-setup">
        <p><span>Transcription confidence</span><strong>{confidence.needsReview} of {confidence.scored} need review</strong></p>
        <Button type="button" size="sm" variant={showNeedsReview ? "primary" : "secondary"} onClick={() => { setShowNeedsReview((value) => !value); setPage(0); }}>
          {showNeedsReview ? "Show all notes" : "Show needs review"}
        </Button>
      </div> : null}
      <div className="guitar-review-setup">
        <p><span>Tuning · low to high</span><strong>{chart.guitarTuning!.map((pitch) => noteName(pitch)).join(" · ")}</strong></p>
        <label>Chart tempo
          <input aria-label="Chart tempo" type="number" min={20} max={400} step="any" value={tempo} disabled={disabled}
            aria-describedby="guitar-review-help" onChange={(event) => { pending(); setTempo(event.target.value); }} />
          <span>BPM</span>
        </label>
      </div>
      <div className="guitar-review-actions">
        <Button type="button" size="sm" variant="secondary" disabled={disabled || !selected.size} onClick={() => {
          const bpm = Number(tempo); if (!Number.isFinite(bpm) || bpm <= 0) return;
          pending(); setRows(current => quantizeRows(current, selected, 60 / bpm / 4));
        }}>Quantize selected · 1/16</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !selected.size} onClick={() => { pending(); setRows(current => shiftRows(current, selected, -0.01)); }}>−10 ms</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !selected.size} onClick={() => { pending(); setRows(current => shiftRows(current, selected, 0.01)); }}>+10 ms</Button>
        <Button type="button" size="sm" variant="secondary" disabled={disabled || !selected.size} onClick={() => {
          const bpm = Number(tempo); if (!Number.isFinite(bpm) || bpm <= 0) return;
          pending(); const result = duplicateRows(rows, selected, 4 * 60 / bpm, nextId.current); nextId.current = result.nextId; setRows(result.rows as GuitarReviewRow[]); setSelected(new Set());
        }}>Duplicate +1 bar</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setSelected(new Set(visibleRows.map(row => row.id)))}>Select visible</Button>
      </div>
      <p id="guitar-review-help" className="guitar-review-help">
        Times and lengths are seconds. Changing tempo rescales the whole chart when you apply.
        String or fret edits update the sounding note. All difficulty levels keep these notes.
        {chart.chordHighways.guitar.length ? " Changing guitar notes clears imported guitar chord labels; the stage names chords from the reviewed pitches." : ""}
      </p>
      <div className="guitar-review-table-wrap" tabIndex={0} aria-label="Guitar note review table">
        <table>
          <caption className="sr-only">Review note times, lengths, strings and frets before adding this arrangement.</caption>
          <thead><tr><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Note</th><th scope="col">Time (s)</th><th scope="col">Length (s)</th><th scope="col">String</th><th scope="col">Fret</th><th scope="col">Sounds</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{visibleRows.slice(first, first + PAGE_SIZE).map((row, index) => {
            const number = first + index + 1;
            const string = Number(row.string), fret = Number(row.fret);
            const valid = Number.isInteger(string) && string >= 1 && string <= 6 && row.fret.trim() !== ""
              && Number.isInteger(fret) && fret >= 0 && fret <= 24;
            const band = confidenceBand(row.confidence);
            return <tr key={row.id} data-confidence={band}>
              <td><input type="checkbox" aria-label={`Select note ${number}`} checked={selected.has(row.id)} disabled={disabled} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></td>
              <th scope="row">{number}{band !== "unknown" ? <span className="ml-1 text-[10px] text-muted">· {band}</span> : null}</th>
              <td><input aria-label={`Note ${number} time`} type="number" min={0} max={3600} step="any" value={row.time} disabled={disabled} onChange={(e) => update(row.id, "time", e.target.value)} /></td>
              <td><input aria-label={`Note ${number} length`} type="number" min={0.02} max={3600} step="any" value={row.duration} disabled={disabled} onChange={(e) => update(row.id, "duration", e.target.value)} /></td>
              <td><select aria-label={`Note ${number} string`} value={row.string} disabled={disabled} onChange={(e) => update(row.id, "string", e.target.value)}>
                {[6, 5, 4, 3, 2, 1].map((s) => <option value={s} key={s}>{s}{s === 6 ? " · low" : s === 1 ? " · high" : ""}</option>)}
              </select></td>
              <td><input aria-label={`Note ${number} fret`} type="number" min={0} max={24} step={1} value={row.fret} disabled={disabled} onChange={(e) => update(row.id, "fret", e.target.value)} /></td>
              <td className="guitar-review-pitch">{valid ? noteName(chart.guitarTuning![6 - string]! + fret) : "—"}</td>
              <td><Button type="button" size="icon" variant="ghost" aria-label={`Remove note ${number}`} disabled={disabled} onClick={() => { pending(); setRows((rows) => rows.filter((note) => note.id !== row.id)); }}><Trash2 size={16} aria-hidden="true" /></Button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="guitar-review-pagination">
        <span>{visibleRows.length ? `${first + 1}–${Math.min(first + PAGE_SIZE, visibleRows.length)} of ${visibleRows.length} notes` : "No notes in this confidence filter"}</span>
        <div>
          <Button type="button" variant="ghost" disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous notes</Button>
          <Button type="button" variant="ghost" disabled={disabled || currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next notes</Button>
        </div>
      </div>
      {error ? <p role="alert" className="guitar-review-error">{error}</p> : null}
      <div className="guitar-review-actions">
        <Button type="button" disabled={disabled || !dirty} onClick={apply}>Apply corrections</Button>
        <Button type="button" variant="secondary" disabled={disabled || rows.length >= 60000} onClick={() => {
          pending();
          const time = Math.max(0, ...rows.map((row) => Number(row.time) + Number(row.duration)).filter(Number.isFinite));
          setRows((rows) => [...rows, { id: nextId.current++, time: String(time), duration: "0.25", string: "6", fret: "0", velocity: 100 }]);
          setPage(Math.floor(rows.length / PAGE_SIZE));
        }}><Plus size={16} aria-hidden="true" /> Add note</Button>
        <Button type="button" variant="ghost" disabled={disabled} onClick={restore}><RotateCcw size={16} aria-hidden="true" /> Restore original</Button>
      </div>
      <p role="status" className="guitar-review-help">{dirty ? "Apply or restore your corrections before adding or downloading this chart." : notice}</p>
      <p className="guitar-review-help">The guide uses these positions. Guitar MIDI scores pitch; it cannot verify which string you used. Playback uses stage instruments; original audio is not attached.</p>
    </section>
  );
}
