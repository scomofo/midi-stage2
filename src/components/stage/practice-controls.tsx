import { useId } from "react";
import { Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/midi-stage/engine";
import type { PracticeSection } from "@/lib/midi-stage/practice";
import "./practice-controls.css";

export type PracticeControlsProps = {
  sections: PracticeSection[];
  selectedId: string;
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
  loop,
  pass,
  lastTake,
  busy,
  onSelect,
  onLoopChange,
  onExit,
}: PracticeControlsProps) {
  const id = useId();
  const selected = sections.find((section) => section.id === selectedId);

  return (
    <section className="practice-controls" aria-label="Section practice">
      <div className="practice-controls-row">
        <div className="practice-section-field">
          <label htmlFor={`${id}-section`}>
            <Repeat2 size={14} aria-hidden="true" /> Practice section
          </label>
          <select
            id={`${id}-section`}
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            disabled={busy || sections.length === 0}
            aria-describedby={`${id}-help`}
          >
            <option value="">Full song</option>
            {sections.map((section) => (
              <option value={section.id} key={section.id}>
                {section.name} · {formatTime(section.start)}–{formatTime(section.end)}
              </option>
            ))}
          </select>
        </div>
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
            <Button
              type="button"
              variant="ghost"
              className="practice-exit"
              onClick={onExit}
            >
              Full song
            </Button>
          </>
        ) : null}
      </div>
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
          </>
        ) : null}
      </p>
    </section>
  );
}
