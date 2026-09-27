import { useId } from "react";
import { ArrowRight, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/midi-stage/engine";
import "./rehearsal-bookmark-card.css";

export type RehearsalBookmarkCardProps = {
  songName: string;
  sectionName: string;
  start: number;
  end: number;
  setupLabel: string;
  warning?: string | null;
  disabled?: boolean;
  onContinue: () => void;
  onDismiss: () => void;
};

export function RehearsalBookmarkCard({
  songName,
  sectionName,
  start,
  end,
  setupLabel,
  warning,
  disabled = false,
  onContinue,
  onDismiss,
}: RehearsalBookmarkCardProps) {
  const id = useId();
  const hasWarning = Boolean(warning?.trim());

  return (
    <section className="rehearsal-bookmark-card" aria-label="Saved rehearsal">
      <div className="rehearsal-bookmark-copy">
        <p className="rehearsal-bookmark-label">
          <History size={16} aria-hidden="true" /> Your last rehearsal
        </p>
        <h2 className="rehearsal-bookmark-title">
          <span className="rehearsal-bookmark-song">{songName}</span>{" "}
          <span className="rehearsal-bookmark-section">{sectionName}</span>
        </h2>
        <p className="rehearsal-bookmark-context">
          <span className="rehearsal-bookmark-range">{formatTime(start)}–{formatTime(end)}</span>{" "}
          <span>{setupLabel}</span>
        </p>
      </div>

      <div className="rehearsal-bookmark-actions">
        <Button
          type="button"
          className="rehearsal-bookmark-continue"
          aria-label={`Continue rehearsal: ${sectionName}`}
          aria-describedby={`${id}-help${hasWarning ? ` ${id}-warning` : ""}`}
          disabled={disabled}
          onClick={onContinue}
        >
          Continue rehearsal <ArrowRight size={16} aria-hidden="true" />
        </Button>
        <p className="rehearsal-bookmark-help" id={`${id}-help`}>Opens ready. Start when you’re ready.</p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rehearsal-bookmark-dismiss"
        aria-label="Forget saved rehearsal"
        title="Forget saved rehearsal"
        disabled={disabled}
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </Button>

      {hasWarning ? (
        <p className="rehearsal-bookmark-warning" id={`${id}-warning`} role="status">{warning}</p>
      ) : null}
    </section>
  );
}
