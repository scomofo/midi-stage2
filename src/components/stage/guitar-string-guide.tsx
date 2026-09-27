import { useId } from "react";
import { Cable, Guitar } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./guitar-string-guide.css";

const STRINGS = [
  { string: 6, name: "E", label: "Low E" },
  { string: 5, name: "A", label: "A" },
  { string: 4, name: "D", label: "D" },
  { string: 3, name: "G", label: "G" },
  { string: 2, name: "B", label: "B" },
  { string: 1, name: "E", label: "High E" },
] as const;

export type GuitarStringGuideProps = {
  targets: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number }[];
  chord?: string;
  connected: boolean;
  /** When true, the connected input is a guitar cable, not MIDI. */
  cableConnected?: boolean;
  connecting: boolean;
  onConnect: () => void;
  onArcade: () => void;
  disabled?: boolean;
};

export function GuitarStringGuide({
  targets,
  chord,
  connected,
  cableConnected = false,
  connecting,
  onConnect,
  onArcade,
  disabled = false,
}: GuitarStringGuideProps) {
  const id = useId();

  return (
    <section className="guitar-string-guide" aria-label="Real guitar guide" aria-describedby={`${id}-help`}>
      <div className="guitar-string-guide-heading">
        <p><Guitar size={16} aria-hidden="true" /> Real guitar</p>
        <span className="guitar-string-guide-status" data-connected={connected}>
          {connected ? "Pitch scoring" : "Play along"}
        </span>
      </div>
      <div className="guitar-string-guide-caption">
        <p>Standard tuning · E A D G B E</p>
        <strong>{chord ? `Next · ${chord}` : targets.length ? "Next notes" : "Listen for the next phrase"}</strong>
      </div>
      <ol className="guitar-string-guide-strings" aria-label="Next frets, low E to high E">
        {STRINGS.map(({ string, name, label }) => {
          const target = targets.find((note) => note.string === string);
          const active = target !== undefined;
          return (
            <li
              key={string}
              className="guitar-string-guide-string"
              data-string={string}
              data-active={active}
              aria-label={`String ${string}, ${label}: ${target ? target.fret === 0 ? "open" : `fret ${target.fret}` : "do not play"}`}
            >
              <span className="guitar-string-guide-tuning" aria-hidden="true">{name}<small>{string}</small></span>
              <strong className="guitar-string-guide-fret" aria-hidden="true">{target?.fret ?? "—"}</strong>
              <span className="guitar-string-guide-position" aria-hidden="true">{target?.fret === 0 ? "OPEN" : active ? "FRET" : "SKIP"}</span>
            </li>
          );
        })}
      </ol>
      <p className="guitar-string-guide-help" id={`${id}-help`}>
        {connected
          ? cableConnected
            ? "Play the shown strings and frets. Cable input scores the pitches you play; it cannot verify which string you played."
            : "Play the shown strings and frets. MIDI scores the notes you send; it cannot verify which string you played."
          : "Follow the string lanes and fret numbers on your guitar. Use Watch the house to play along without scoring, or connect a guitar MIDI device or guitar cable in Soundcheck."}
      </p>
      <div className="guitar-string-guide-actions">
        {!connected ? (
          <Button type="button" variant="secondary" onClick={onConnect} disabled={disabled || connecting}>
            <Cable size={16} aria-hidden="true" />
            {connecting ? "Connecting…" : "Connect guitar MIDI"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onArcade} disabled={disabled || connecting}>
          Try arcade controls
        </Button>
      </div>
    </section>
  );
}
