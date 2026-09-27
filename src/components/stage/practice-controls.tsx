import { useId, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Map, Repeat2 } from "lucide-react";
import { SongMap } from "@/components/stage/song-map";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/midi-stage/engine";
import type { PracticeSection } from "@/lib/midi-stage/practice";
import "./practice-controls.css";

export type PracticeControlsProps = {
  sections: PracticeSection[];
  selectedId: string;
  duration: number;
  mapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
  loop: boolean;
  pass: number;
  lastTake: { accuracy: number; score: number } | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onLoopChange: (value: boolean) => void;
  onExit: () => void;
};

export function PracticeControls({
  sections,
  selectedId,
  duration,
  mapOpen,
  onMapOpenChange,
  loop,
  pass,
  lastTake,
  busy,
  onSelect,
  onLoopChange,
  onExit,
}: PracticeControlsProps) {
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectedIndex = sections.findIndex((section) => section.id === selectedId);
  const selected = sections[selectedIndex];
  const previous = selected ? sections[selectedIndex - 1] : undefined;
  const next = selected ? sections[selectedIndex + 1] : undefined;

  function stepTo(section: PracticeSection | undefined, atEnd: boolean) {
    if (busy || !section) return;
    onSelect(section.id);
    // The chosen arrow becomes disabled at the boundary. Keep keyboard focus
    // on the selector instead of leaving it on a newly disabled control.
    if (atEnd) selectRef.current?.focus({ preventScroll: true });
  }

  return (
    <section className="practice-controls" aria-label="Section practice">
      <div className="practice-controls-row">
        <div className="practice-section-field">
          <div className="practice-section-label">
            <label htmlFor={`${id}-section`}>
              <Repeat2 size={14} aria-hidden="true" /> Practice section
            </label>
            {selected ? <span className="practice-position" id={`${id}-position`}>Section {selectedIndex + 1} of {sections.length}</span> : null}
          </div>
          <div className="practice-section-picker">
            {selected ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="practice-step"
                aria-label="Previous practice section"
                title={previous ? `Previous: ${previous.name}` : "First practice section"}
                disabled={busy || !previous}
                onClick={() => stepTo(previous, selectedIndex === 1)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </Button>
            ) : null}
            <select
              ref={selectRef}
              id={`${id}-section`}
              value={selectedId}
              onChange={(event) => onSelect(event.target.value)}
              disabled={busy || sections.length === 0}
              aria-describedby={`${id}-help${selected ? ` ${id}-position` : ""}`}
              title={selected ? `${selected.name} · ${formatTime(selected.start)}–${formatTime(selected.end)}` : undefined}
            >
              <option value="">Full song</option>
              {sections.map((section) => (
                <option value={section.id} key={section.id}>
                  {section.name} · {formatTime(section.start)}–{formatTime(section.end)}
                </option>
              ))}
            </select>
            {selected ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="practice-step"
                aria-label="Next practice section"
                title={next ? `Next: ${next.name}` : "Last practice section"}
                disabled={busy || !next}
                onClick={() => stepTo(next, selectedIndex === sections.length - 2)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="ghost" className="practice-explore" aria-expanded={mapOpen} aria-controls={`${id}-map`} onClick={() => onMapOpenChange(!mapOpen)} disabled={!sections.length}>
          <Map size={16} aria-hidden="true" /> Explore song <ChevronDown size={14} className={mapOpen ? "is-open" : ""} aria-hidden="true" />
        </Button>
        {selected ? (
          <>
            <label className="practice-repeat">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => onLoopChange(event.target.checked)}
                disabled={busy}
              />
              Repeat section
            </label>
            {!mapOpen ? <Button
              type="button"
              variant="ghost"
              className="practice-exit"
              onClick={onExit}
            >
              Full song
            </Button> : null}
          </>
        ) : null}
      </div>
      {mapOpen ? <div id={`${id}-map`}><SongMap sections={sections} selectedId={selectedId} duration={duration} busy={busy} onSelect={onSelect} onExit={onExit} /></div> : null}
      <p className="practice-help" id={`${id}-help`}>
        {selected
          ? "Each take starts with a count-in and a fresh score. Turn off Repeat section to finish the current take. Practice scores aren’t saved."
          : sections.length
            ? "Pick a passage to slow down and practise. Changing sections starts a fresh take."
            : "No playable sections for this setup."}
      </p>
      <p className="practice-status" role="status" aria-live="polite" aria-atomic="true">
        {selected ? (
          <>
            <span>Take {Math.max(1, pass)}</span>
            {lastTake ? (
              <span>
                Last take: {Math.round(lastTake.accuracy)}% accuracy · {lastTake.score.toLocaleString()} points
              </span>
            ) : null}
            <span className="sr-only">
              Section {selectedIndex + 1} of {sections.length}: {selected.name}, {formatTime(selected.start)} to {formatTime(selected.end)}.
            </span>
          </>
        ) : null}
      </p>
    </section>
  );
}
