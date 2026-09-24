import { ArrowRight, Eye, Keyboard, Pause, Play, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  demo: boolean;
};

type SessionOverlayProps = {
  mode: "ready" | "paused" | "results";
  songName: string;
  nextSongName: string;
  busy: boolean;
  demo: boolean;
  results?: SessionResults | null;
  controls: { label: string; keys: string[] }[];
  onStart: () => void;
  onDemo: () => void;
  onRestart: () => void;
  onNext: () => void;
  onQuickStart: () => void;
  onBack: () => void;
};

function practiceTip(results: SessionResults) {
  if (results.demo)
    return "Your turn: follow one lane and press its key when a gem reaches the strike line.";
  if (results.holdBreaks > 0)
    return "Follow the whole tail. Keep each long note held until its tail passes the strike line.";
  const hits = results.perfect + results.great + results.good;
  if (results.miss > hits)
    return "Give yourself more time: lower the tempo below the stage and focus on one lane first.";
  if (results.extra > Math.max(3, hits / 4))
    return "Leave space between notes. Press once per gem; extra presses interrupt your streak.";
  if (results.miss > 0)
    return "Keep your eyes just above the strike line. Spot the next gem before the current one arrives.";
  if (results.great + results.good > 0)
    return "Aim for the centre of the strike line. Try the metronome to settle into a steady pulse.";
  return "Every note landed perfectly. Try the next song, or raise the difficulty for a fresh challenge.";
}

function KeyGuide({ controls }: Pick<SessionOverlayProps, "controls">) {
  if (!controls.length) return null;
  return (
    <div className="session-controls" aria-label="Your keyboard controls">
      <div className="session-controls-heading">
        <Keyboard size={14} aria-hidden="true" /> Your keys, left to right
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

  return (
    <div className="session-overlay" data-session-overlay={mode}>
      <section
        className={`session-panel session-panel--${mode}`}
        aria-labelledby="session-heading"
        aria-busy={busy}
      >
        {isResults ? (
          <>
            <div className="session-eyebrow">SET COMPLETE{results.demo ? " · AUTOPLAY" : ""}</div>
            <h2 id="session-heading">
              {results.demo
                ? "Now make it yours."
                : results.newBest
                  ? "Your best set yet."
                  : results.accuracy >= 90
                    ? "You found the pocket."
                    : "One set further."}
            </h2>
            <p className="session-song">{songName}</p>

            <div className="session-score-block">
              <span className="session-score-label">
                {results.demo ? "Autoplay score" : "Your score"}
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
              {results.holds + results.holdBreaks > 0
                ? ` · ${results.holds} holds completed · ${results.holdBreaks} broken`
                : ""}
            </p>
            <div className="session-practice-tip">
              <span>{results.demo ? "STEP INTO THE SPOTLIGHT" : "FOR YOUR NEXT SET"}</span>
              <p>{practiceTip(results)}</p>
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
              Back to house
            </Button>
          </>
        ) : isPaused ? (
          <>
            <div className="session-eyebrow">
              <Pause size={14} aria-hidden="true" /> SET PAUSED{demo ? " · AUTOPLAY" : ""}
            </div>
            <h2 id="session-heading">Take a breath.</h2>
            <p className="session-song">{songName}</p>
            <p className="session-description">
              Your place is saved. Pick up the groove when you’re ready.
            </p>
            <KeyGuide controls={controls} />
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
            <p className="session-footnote">Resume keeps your score. Restart begins a fresh set.</p>
          </>
        ) : (
          <>
            <div className="session-eyebrow">YOUR NEXT SESSION</div>
            <h2 id="session-heading">Take the stage.</h2>
            <p className="session-song">{songName}</p>
            <p className="session-description">
              Hit each gem as it crosses the strike line. Hold long notes to the end. You can use
              keys, MIDI, or tap the lanes.
            </p>
            <KeyGuide controls={controls} />
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
            <p className="session-footnote">Solo by default. Add your band from the green room.</p>
          </>
        )}
      </section>
    </div>
  );
}
