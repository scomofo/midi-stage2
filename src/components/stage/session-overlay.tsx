import { useEffect, useRef } from "react";
import { ArrowRight, Eye, Keyboard, Pause, Play, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Difficulty, Instrument } from "@/lib/midi-stage/types";
import { TIMING_CENTER_MS, type TimingSummary } from "@/lib/midi-stage/timing-summary";
import { formatTime } from "@/lib/midi-stage/engine";

export type PracticeContext = { name: string; start: number; end: number; pass: number };

export type SessionResults = {
  score: number;
  accuracy: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  extra: number;
  combo: number;
  stars: number;
  holdBreaks: number;
  holds: number;
  previousBest: number;
  newBest: boolean;
  bestSaved: boolean;
  demo: boolean;
  difficulty: Difficulty;
  speed: number;
  parts: { id: Instrument; label: string; timing: TimingSummary }[];
  practice?: PracticeContext;
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  chill: "Chill",
  standard: "Standard",
  expert: "Expert",
};

const TIMING_COPY: Record<TimingSummary["tendency"], { title: string; tip: string }> = {
  early: { title: "Mostly early", tip: "Let the gem reach the strike line before you press." },
  centered: { title: "Near the centre", tip: "Keep that pulse going on your next take." },
  late: { title: "Mostly late", tip: "Look a little farther up the highway so you can prepare the next press." },
  mixed: { title: "Mixed timing", tip: "Try the click and a slower tempo to find a steadier pulse." },
  insufficient: { title: "Not enough hits yet", tip: "Land a few more hits before reviewing your timing." },
};

function RecentTiming({ parts }: Pick<SessionResults, "parts">) {
  return (
    <section className="session-timing" aria-label="Recent hit timing">
      <h3>Recent hit timing</h3>
      <p className="session-timing-description">
        Up to the last 200 successful hits per part. Near centre means within {TIMING_CENTER_MS} ms of the strike line.
      </p>
      <ul>
        {parts.map(({ id, label, timing }) => (
          <li className="session-timing-part" data-part={id} key={id}>
            <div className="session-timing-heading">
              <h4>{label}</h4>
              <strong>{TIMING_COPY[timing.tendency].title}</strong>
            </div>
            <p className="session-timing-counts">
              {timing.count === 0
                ? "No successful hits to review."
                : `${timing.count} recent ${timing.count === 1 ? "hit" : "hits"} · ${timing.early} early · ${timing.centered} near centre · ${timing.late} late`}
            </p>
            <p className="session-timing-tip">{TIMING_COPY[timing.tendency].tip}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

type SessionOverlayProps = {
  mode: "ready" | "paused" | "results";
  songName: string;
  nextSongName: string;
  busy: boolean;
  demo: boolean;
  rhythm?: boolean;
  practice?: PracticeContext;
  results?: SessionResults | null;
  controls: { label: string; keys: string[] }[];
  onStart: () => void;
  onDemo: () => void;
  onRestart: () => void;
  onNext: () => void;
  onQuickStart: () => void;
  onBack: () => void;
};

function practiceTip(results: SessionResults, rhythm: boolean) {
  if (results.demo)
    return rhythm
      ? "Your turn: tap once as each gem reaches the strike line. Any MIDI note works."
      : "Your turn: follow one lane and press its key when a gem reaches the strike line.";
  if (!rhythm && results.holdBreaks > 0)
    return "Follow the whole tail. Keep each long note held until its tail passes the strike line.";
  const hits = results.perfect + results.great + results.good;
  if (hits === 0)
    return "Start with a slower tempo and aim to land one gem at a time.";
  if (results.miss > hits)
    return "Give yourself more time: lower the tempo below the stage and focus on one lane first.";
  if (results.extra > Math.max(3, hits / 4))
    return "Leave space between notes. Press once per gem; extra presses interrupt your streak.";
  if (results.miss > 0)
    return "Keep your eyes just above the strike line. Spot the next gem before the current one arrives.";
  if (results.great + results.good > 0)
    return "Aim for the centre of the strike line. Try the metronome to settle into a steady pulse.";
  if (results.parts.some((part) => part.timing.tendency !== "centered"))
    return "Every note earned Perfect. Keep this setup and use the timing notes above for your next take.";
  if (results.practice)
    return "Every note landed perfectly. Repeat to make it feel natural, or return to the full song.";
  return "Every note landed perfectly. Try the next song, or raise the difficulty for a fresh challenge.";
}

function PracticeSummary({ practice }: { practice: PracticeContext }) {
  return (
    <p className="session-practice-context">
      {practice.name} · {formatTime(practice.start)}–{formatTime(practice.end)} · Take {practice.pass}
    </p>
  );
}

function KeyGuide({ controls, rhythm }: Pick<SessionOverlayProps, "controls" | "rhythm">) {
  if (!controls.length) return null;
  return (
    <div className="session-controls" aria-label="Your keyboard controls">
      <div className="session-controls-heading">
        <Keyboard size={14} aria-hidden="true" /> {rhythm ? "Your rhythm controls" : "Your keys, left to right"}
      </div>
      {controls.map((control, index) => (
        <div className="session-control-row" key={`${control.label}-${index}`}>
          <span>{control.label}</span>
          <div className="session-keys">
            {control.keys.map((key, keyIndex) => (
              <kbd key={`${key}-${keyIndex}`}>{key}</kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SessionOverlay({
  mode,
  songName,
  nextSongName,
  busy,
  demo,
  rhythm = false,
  practice,
  results,
  controls,
  onStart,
  onDemo,
  onRestart,
  onNext,
  onQuickStart,
  onBack,
}: SessionOverlayProps) {
  const isResults = mode === "results" && results;
  const isPaused = mode === "paused";
  const resultsVisible = Boolean(isResults);
  const runContext = results
    ? `${DIFFICULTY_LABELS[results.difficulty]} · ${Math.round(results.speed * 100)}% tempo · ${results.parts.map((part) => part.label).join(" + ")}`
    : "";
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!resultsVisible) return;
    const heading = resultsHeadingRef.current;
    heading?.focus({ preventScroll: true });
    heading?.closest(".session-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
    // Announce each completed set once. HUD refreshes and navigation within
    // the results must not move the player's focus back to this heading.
  }, [resultsVisible]);

  return (
    <div className="session-overlay" data-session-overlay={mode}>
      <section
        className={`session-panel session-panel--${mode}`}
        aria-labelledby="session-heading"
        aria-busy={busy}
      >
        {isResults ? (
          <>
            <div className="session-eyebrow">
              {results.practice ? "PRACTICE COMPLETE" : "SET COMPLETE"}{results.demo ? " · AUTOPLAY" : ""}
            </div>
            <h2 ref={resultsHeadingRef} id="session-heading" tabIndex={-1} aria-describedby="session-result-summary">
              {results.demo
                ? "Now make it yours."
                : results.practice
                  ? "One passage stronger."
                  : results.newBest && !results.bestSaved
                    ? "Your set is complete."
                    : results.newBest
                      ? "Your best set yet."
                      : results.accuracy >= 90
                        ? "You found the pocket."
                        : "One set further."}
            </h2>
            <p id="session-result-summary" className="sr-only">
              {songName}. {results.demo ? "Autoplay score" : results.practice ? "Practice score" : "Your score"} {results.score.toLocaleString()}.
              {" "}Accuracy {Math.round(results.accuracy)} percent.
              {" "}{runContext}.
              {results.practice ? ` ${results.practice.name}, take ${results.practice.pass}. Practice score not saved.` : ""}
              {!results.practice && results.newBest && !results.bestSaved ? " Could not save your personal best on this device. Your score is still shown here." : ""}
            </p>
            <p className="session-song">{songName}</p>
            <p className="session-run-context">{runContext}</p>
            {results.practice ? <PracticeSummary practice={results.practice} /> : null}

            <div className="session-score-block">
              <span className="session-score-label">
                {results.demo ? "Autoplay score" : results.practice ? "Practice score" : "Your score"}
              </span>
              <strong className="session-score">{results.score.toLocaleString()}</strong>
              <div
                className="session-stars"
                role="img"
                aria-label={`${results.stars} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={18}
                    className={index < results.stars ? "is-earned" : ""}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {results.demo ? (
                <span className="session-save-note">AUTOPLAY · NOT SAVED</span>
              ) : results.practice ? (
                <span className="session-save-note">PRACTICE · NOT SAVED</span>
              ) : results.newBest && !results.bestSaved ? (
                <>
                  <span className="session-save-note">Score not saved</span>
                  <span className="session-save-note">
                    Could not save your personal best on this device. Your score is still shown here.
                  </span>
                </>
              ) : results.newBest ? (
                <span className="session-personal-best">
                  <Trophy size={14} aria-hidden="true" /> New personal best
                  {results.previousBest > 0
                    ? ` · +${(results.score - results.previousBest).toLocaleString()}`
                    : ""}
                </span>
              ) : results.previousBest > 0 ? (
                <span className="session-save-note">
                  Personal best {results.previousBest.toLocaleString()}
                </span>
              ) : null}
            </div>

            <dl className="session-headline-stats">
              <div>
                <dt>Accuracy</dt>
                <dd>
                  {Math.round(results.accuracy)}
                  <small>%</small>
                </dd>
              </div>
              <div>
                <dt>Best streak</dt>
                <dd>
                  {results.combo}
                  <small> notes</small>
                </dd>
              </div>
            </dl>
            <dl className="session-judgements" aria-label="Note breakdown">
              <div>
                <dt>Perfect</dt>
                <dd>{results.perfect}</dd>
              </div>
              <div>
                <dt>Great</dt>
                <dd>{results.great}</dd>
              </div>
              <div>
                <dt>Good</dt>
                <dd>{results.good}</dd>
              </div>
              <div>
                <dt>Missed</dt>
                <dd>{results.miss}</dd>
              </div>
            </dl>
            <p className="session-detail-stats">
              {results.extra} extra {results.extra === 1 ? "press" : "presses"}
              {!rhythm && results.holds + results.holdBreaks > 0
                ? ` · ${results.holds} holds completed · ${results.holdBreaks} broken`
                : ""}
            </p>
            {!results.demo ? <RecentTiming parts={results.parts} /> : null}
            <div className="session-practice-tip">
              <span>{results.demo ? "STEP INTO THE SPOTLIGHT" : results.practice ? "FOR YOUR NEXT TAKE" : "FOR YOUR NEXT SET"}</span>
              <p>{practiceTip(results, rhythm)}</p>
            </div>
            <div className="session-actions">
              <Button type="button" onClick={onRestart} disabled={busy} data-session-primary>
                <RotateCcw size={16} aria-hidden="true" />
                {busy ? "Preparing…" : "Play again"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onNext}
                disabled={busy}
                title={nextSongName ? `Play ${nextSongName}` : undefined}
              >
                Next song
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
            {nextSongName ? <p className="session-next-song">Up next: {nextSongName}</p> : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={busy}
              className="session-back"
            >
              {results.practice ? "Back to full song" : "Back to house"}
            </Button>
          </>
        ) : isPaused ? (
          <>
            <div className="session-eyebrow">
              <Pause size={14} aria-hidden="true" /> {practice ? "PRACTICE PAUSED" : "SET PAUSED"}{demo ? " · AUTOPLAY" : ""}
            </div>
            <h2 id="session-heading">Take a breath.</h2>
            <p className="session-song">{songName}</p>
            {practice ? <PracticeSummary practice={practice} /> : null}
            <p className="session-description">
              Your place is saved. Pick up the groove when you’re ready.
            </p>
            <KeyGuide controls={controls} rhythm={rhythm} />
            <div className="session-actions">
              <Button type="button" onClick={onStart} disabled={busy} data-session-primary>
                <Play size={16} aria-hidden="true" />
                {busy ? "Preparing…" : "Resume set"}
                <kbd aria-hidden="true">ENTER</kbd>
              </Button>
              <Button type="button" variant="secondary" onClick={onRestart} disabled={busy}>
                <RotateCcw size={16} aria-hidden="true" />
                Restart set
              </Button>
            </div>
            <p className="session-footnote">
              {practice
                ? "Resume keeps this take. Restart begins the section again with a count-in and a fresh score. Practice scores aren’t saved."
                : "Resume keeps your score. Restart begins a fresh set."}
            </p>
          </>
        ) : (
          <>
            <div className="session-eyebrow">{practice ? "SECTION PRACTICE" : "YOUR NEXT SESSION"}</div>
            <h2 id="session-heading">Take the stage.</h2>
            <p className="session-song">{songName}</p>
            {practice ? <PracticeSummary practice={practice} /> : null}
            <p className="session-description">
              {rhythm
                ? "Tap once per gem as it crosses the strike line. Use your mapped key, tap the HIT pad, or play any MIDI note. No holds needed."
                : "Hit each gem as it crosses the strike line. Hold long notes to the end. You can use keys, MIDI, or tap the lanes."}
            </p>
            <KeyGuide controls={controls} rhythm={rhythm} />
            <div className="session-actions">
              <Button type="button" onClick={onStart} disabled={busy} data-session-primary>
                <Play size={16} aria-hidden="true" />
                {busy ? "Preparing…" : "Start set"}
                <kbd>ENTER</kbd>
              </Button>
              <Button type="button" variant="secondary" onClick={onDemo} disabled={busy}>
                <Eye size={16} aria-hidden="true" />
                Watch the house
              </Button>
            </div>
            <div className="session-first-time">
              <span>First time on stage?</span>
              <Button type="button" variant="ghost" onClick={onQuickStart} disabled={busy}>
                Try beginner rehearsal
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
            <p className="session-footnote">
              {practice
                ? "Start with a count-in. Repeat section gives you a fresh score on every take. Practice scores aren’t saved."
                : "Solo by default. Add your band from the green room."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
