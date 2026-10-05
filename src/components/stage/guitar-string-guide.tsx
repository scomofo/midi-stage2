import { useId, type CSSProperties } from "react";
import { Cable, Check, Guitar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { noteName } from "@/lib/midi-stage/engine";
import { getFretboardWindow } from "@/lib/midi-stage/guitar-preview";
import type { GuitarPitchFeedback } from "@/lib/midi-stage/guitar-pitch-feedback";
import type { GuitarAttackCue } from "@/lib/midi-stage/guitar-attack-cue";
import type { GuitarPosition } from "@/lib/midi-stage/types";
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
  targets: GuitarPosition[];
  hitTargets?: GuitarPosition[];
  feedback?: GuitarPitchFeedback | null;
  attackCue?: GuitarAttackCue | null;
  paused?: boolean;
  scored?: boolean;
  chord?: string;
  followingTargets?: GuitarPosition[];
  followingChord?: string;
  performing?: boolean;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onArcade: () => void;
  disabled?: boolean;
};

export function GuitarStringGuide({
  targets,
  hitTargets = [],
  feedback = null,
  attackCue = null,
  paused = false,
  scored = false,
  chord,
  followingTargets = [],
  followingChord,
  performing = false,
  connected,
  connecting,
  onConnect,
  onArcade,
  disabled = false,
}: GuitarStringGuideProps) {
  const id = useId();
  const fretWindow = getFretboardWindow(targets);
  const columns = fretWindow.frets;
  const omittedBefore = columns[0]! - 1;
  const hasGapBefore = (fret: number) => (fret === columns[0] && omittedBefore > 0)
    || fretWindow.gaps.some((gap) => gap.before === fret);
  const positionLabel = (target: GuitarPosition) => {
    const string = STRINGS.find((candidate) => candidate.string === target.string)!;
    return `${string.label} ${target.fret === 0 ? "open" : `fret ${target.fret}`}`;
  };
  const followingLabel = followingTargets.map(positionLabel).join(" · ");
  const targetHit = (target: GuitarPosition | undefined) => scored && target !== undefined
    && hitTargets.some((hit) => hit.string === target.string && hit.fret === target.fret);
  const matchedCount = targets.filter(targetHit).length;
  const beats = attackCue ? Math.ceil(attackCue.beats * 10) / 10 : 0;
  const timingLabel = attackCue?.kind === "complete" ? "No more attacks"
    : attackCue?.kind === "window" ? "Strike window" : "Prepare shape";
  const timingDetail = attackCue?.kind === "complete" ? "Follow sustain tails"
    : attackCue?.kind === "window" ? "Aim for the strike line"
    : `In ${beats.toFixed(1)} ${beats === 1 ? "beat" : "beats"}`;

  return (
    <section className="guitar-string-guide" data-performing={performing} aria-label="Real guitar guide" aria-describedby={`${id}-window ${id}-help`}>
      <div className="guitar-string-guide-heading">
        <p><Guitar size={16} aria-hidden="true" /> Real guitar</p>
        <span className="guitar-string-guide-status" data-connected={connected}>
          {performing && !scored ? "Play along" : connected ? "Pitch scoring" : "Play along"}
        </span>
      </div>
      <div className="guitar-string-guide-caption">
        <p>High E at top · low E at bottom</p>
        <strong>{chord ? `Next · ${chord}` : targets.length ? "Next notes" : "Listen for the next phrase"}</strong>
      </div>

      {(performing || paused) && attackCue ? <div className="guitar-attack-cue" data-kind={attackCue.kind} data-paused={paused}>
        <p className="guitar-attack-copy"><strong>{paused ? "Paused" : timingLabel}</strong><span>{paused && attackCue.kind === "window" ? "At the strike window" : timingDetail}</span></p>
        <div className="guitar-attack-track" aria-hidden="true"><i style={{ transform: `scaleX(${attackCue.progress})` }} /></div>
      </div> : null}

      <div className="guitar-fretboard" data-shifted={omittedBefore > 0} style={{ "--fret-columns": columns.length } as CSSProperties} aria-hidden="true">
        <div className="guitar-fretboard-row guitar-fretboard-axis">
          <span>STRING</span><span>OPEN</span>
          {columns.map((fret) => <span key={fret} data-gap={hasGapBefore(fret)}>
            {hasGapBefore(fret) ? <i>⋯</i> : null}{fret}
          </span>)}
        </div>
        {[...STRINGS].reverse().map(({ string, name, label }) => {
          const target = targets.find((note) => note.string === string);
          const hit = targetHit(target);
          return <div className="guitar-fretboard-row guitar-fretboard-string" data-string={string} key={string}>
            <span className="guitar-fretboard-string-name" title={label}>{name}<small>{string}</small></span>
            <span className="guitar-fretboard-open" data-active={target?.fret === 0} data-hit={target?.fret === 0 && hit}>
              {target?.fret === 0 ? <b>0{hit ? <span className="guitar-fretboard-check"><Check aria-hidden="true" /></span> : null}</b> : target ? "—" : "×"}
            </span>
            {columns.map((fret) => <span className="guitar-fretboard-cell" key={fret} data-gap={hasGapBefore(fret)} data-target={target?.fret === fret} data-hit={target?.fret === fret && hit}>
              {target?.fret === fret ? <b className="guitar-fretboard-note">{fret}{hit ? <span className="guitar-fretboard-check"><Check aria-hidden="true" /></span> : null}</b> : null}
            </span>)}
          </div>;
        })}
      </div>
      {performing && scored ? <>
        {targets.length ? <p className="guitar-pitch-progress">This shape · <strong>{matchedCount} / {targets.length}</strong> pitches matched</p> : null}
        <div className="guitar-pitch-feedback" data-kind={feedback?.kind ?? "listening"}>
          {!feedback ? <div className="guitar-pitch-placeholder"><strong>Listening for your guitar</strong><span>Play a target at the strike line</span></div> : null}
          <output className="guitar-pitch-announcement" role="status" aria-live="polite" aria-atomic="true">
            {feedback ? <><span className="guitar-pitch-received">Last input · Received <strong>{noteName(feedback.pitch)}</strong></span><span className="guitar-pitch-detail">{feedback.detail}</span></> : null}
          </output>
        </div>
      </> : null}
      <div className="guitar-string-guide-preview">
        <p className="guitar-string-guide-window" id={`${id}-window`}>Frets {columns[0]}–{columns.at(-1)}{omittedBefore > 0 ? ` · ${omittedBefore === 1 ? "fret 1" : `frets 1–${omittedBefore}`} omitted` : ""}{fretWindow.gaps.length ? " · skipped frets collapsed" : ""}</p>
        {followingTargets.length ? <p className="guitar-string-guide-following"><span>THEN</span> {followingChord ? <strong>{followingChord} · </strong> : null}{followingLabel}</p> : <p className="guitar-string-guide-following"><span>THEN</span> {targets.length ? "Final shape" : "No more targets"}</p>}
      </div>

      <ol className="guitar-string-guide-strings sr-only" aria-label="Next frets, low E to high E">
        {STRINGS.map(({ string, name, label }) => {
          const target = targets.find((note) => note.string === string);
          const active = target !== undefined;
          return (
            <li
              key={string}
              className="guitar-string-guide-string"
              data-string={string}
              data-active={active}
              aria-label={`String ${string}, ${label}: ${target ? target.fret === 0 ? "open" : `fret ${target.fret}` : "do not play"}${targetHit(target) ? ", pitch matched" : ""}`}
            >
              <span className="guitar-string-guide-tuning" aria-hidden="true">{name}<small>{string}</small></span>
              <strong className="guitar-string-guide-fret" aria-hidden="true">{target?.fret ?? "—"}</strong>
              <span className="guitar-string-guide-position" aria-hidden="true">{target?.fret === 0 ? "OPEN" : active ? "FRET" : "SKIP"}</span>
            </li>
          );
        })}
      </ol>
      <p className="guitar-string-guide-help" id={`${id}-help`}>
        <span>Standard tuning · E A D G B E. 0 means open; × means skip. </span>
        {connected
          ? "Play the shown strings and frets. MIDI scores the notes you send; it cannot verify which string you played."
          : "Follow the string lanes and fret numbers on your guitar. Choose Play along without scoring, or connect a guitar MIDI device."}
      </p>
      {!performing ? <div className="guitar-string-guide-actions">
        {!connected ? (
          <Button type="button" variant="secondary" onClick={onConnect} disabled={disabled || connecting}>
            <Cable size={16} aria-hidden="true" />
            {connecting ? "Connecting…" : "Connect guitar MIDI"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onArcade} disabled={disabled || connecting}>
          Try arcade controls
        </Button>
      </div> : null}
    </section>
  );
}
