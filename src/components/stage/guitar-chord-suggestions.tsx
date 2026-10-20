import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { noteName } from "@/lib/midi-stage/engine";
import type { GuitarCandidateDecisions, ShortChordCandidate } from "@/lib/midi-stage/guitar-short-chord-audit";
import type { AudioReviewRow } from "@/lib/midi-stage/audio-review-session";

const PAGE_SIZE = 6;
export function GuitarChordSuggestions({ candidates, decisions, selected, position, positionError, disabled, onSelect, onAccept, onDecision }: {
  candidates: ShortChordCandidate[]; decisions: GuitarCandidateDecisions; selected?: ShortChordCandidate;
  position?: AudioReviewRow; positionError: string; disabled: boolean;
  onSelect: (candidate: ShortChordCandidate) => void; onAccept: (candidate: ShortChordCandidate) => void;
  onDecision: (candidate: ShortChordCandidate, decision?: "dismissed") => void;
}) {
  const [showReviewed, setShowReviewed] = useState(false), [page, setPage] = useState(0);
  const pending = candidates.filter((candidate) => !decisions[candidate.id]);
  const visible = showReviewed ? candidates : pending;
  const current = Math.max(0, Math.min(page, Math.ceil(visible.length / PAGE_SIZE) - 1));
  const decision = selected ? decisions[selected.id] : undefined;
  if (!candidates.length) return null;
  return <section className="studio-suggestions" aria-label="Chord suggestions">
    <header className="studio-suggestions-heading"><div><h5>Chord suggestions <span>{pending.length} to review</span></h5>
      <p>Possible short tones the draft left out. Listen before accepting. Suggested fingerings are editable.</p></div>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { setShowReviewed(!showReviewed); setPage(0); }}>{showReviewed ? "Show unreviewed" : "Show reviewed"}</Button></header>
    <div className="studio-suggestions-body">
      <div>
        <div className="studio-suggestion-queue" aria-label="Chord suggestion queue">
          {visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((candidate) => <button type="button" key={candidate.id}
            aria-label={`Review suggestion ${noteName(candidate.pitchMidi)} at ${candidate.time.toFixed(3)} seconds`} aria-pressed={candidate.id === selected?.id}
            disabled={disabled} onClick={() => onSelect(candidate)}>
            <span className="studio-mono">{candidate.time.toFixed(3)}s</span><strong>{noteName(candidate.pitchMidi)}</strong>
            <span>{decisions[candidate.id] ?? "Unverified"}</span>
          </button>)}
        </div>
        {!visible.length ? <p className="studio-suggestion-empty">All suggestions reviewed. Apply corrections to keep these decisions.</p> : null}
        {visible.length > PAGE_SIZE ? <div className="studio-suggestion-pages">
          <Button variant="ghost" size="icon" aria-label="Previous chord suggestions" disabled={disabled || !current} onClick={() => setPage(current - 1)}><ChevronLeft size={15} /></Button>
          <span>{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, visible.length)} of {visible.length}</span>
          <Button variant="ghost" size="icon" aria-label="Next chord suggestions" disabled={disabled || (current + 1) * PAGE_SIZE >= visible.length} onClick={() => setPage(current + 1)}><ChevronRight size={15} /></Button>
        </div> : null}
      </div>
      {selected ? <div className="studio-suggestion-detail" aria-label="Selected chord suggestion">
        <div><strong>Possible {noteName(selected.pitchMidi)}</strong><span>{decision ?? "Unverified"}</span></div>
        <p className="studio-mono">{selected.time.toFixed(3)}s · {selected.estimatedDuration.toFixed(3)}s long · MIDI {selected.pitchMidi}</p>
        {!decision && position ? <p>Proposed string {position.string} · fret {position.fret}</p> : null}
        {!decision && positionError ? <p className="studio-error">{positionError}</p> : null}
        <p>Use the suggestion listening controls below the waveform to compare this tone with the recording.</p>
        <div className="studio-suggestion-actions">
          {!decision ? <><Button size="sm" disabled={disabled || !position} onClick={() => onAccept(selected)}><Check size={14} /> Accept tone</Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onDecision(selected, "dismissed")}><X size={14} /> Dismiss</Button></>
            : <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onDecision(selected)}><RotateCcw size={14} /> Reopen suggestion</Button>}
          {pending.some((candidate) => candidate.id !== selected.id) ? <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onSelect(pending.find((candidate) => candidate.time > selected.time && candidate.id !== selected.id) ?? pending.find((candidate) => candidate.id !== selected.id)!)}>Next suggestion</Button> : null}
        </div>
      </div> : null}
    </div>
  </section>;
}
