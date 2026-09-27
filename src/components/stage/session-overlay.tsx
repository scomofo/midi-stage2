import { useEffect, useRef } from "react";
import { ArrowRight, Eye, Keyboard, Pause, Play, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Difficulty, Instrument } from "@/lib/midi-stage/types";
import { TIMING_CENTER_MS, type TimingSummary } from "@/lib/midi-stage/timing-summary";
import type { PracticeRecommendation } from "@/lib/midi-stage/practice-recommendation";
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
  recommendation?: PracticeRecommendation | null;
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

const TIMING_BANDS = [
  { key: "early", label: "Early" },
  { key: "centered", label: "Near centre" },
  { key: "late", label: "Late" },
] as const;

function TimingDistribution({ label, timing }: { label: string; timing: TimingSummary }) {
  if (timing.count === 0) return null;
  return (
    <div className="session-timing-distribution" role="group" aria-label={`${label} timing distribution`}>
      {TIMING_BANDS.map((band) => (
        <label className={`session-timing-band session-timing-band--${band.key}`} key={band.key}>
          <span>{band.label}</span>
          <meter
            min={0}
            max={timing.count}
            value={timing[band.key]}
            aria-label={`${label} ${band.label.toLowerCase()} hits`}
            aria-valuetext={`${timing[band.key]} of ${timing.count} recent successful hits`}
          >
            {timing[band.key]} of {timing.count}
          </meter>
        </label>
      ))}
    </div>
  );
}

function RecentTiming({ parts, guitarMode = false, realGuitar = false }: Pick<SessionResults, "parts"> & { guitarMode?: boolean; realGuitar?: boolean }) {
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
            <TimingDistribution label={label} timing={timing} />
            <p className="session-timing-counts">
              {timing.count === 0
                ? "No successful hits to review."
                : `${timing.count} recent ${timing.count === 1 ? "hit" : "hits"} · ${timing.early} early · ${timing.centered} near centre · ${timing.late} late`}
            </p>
            <p className="session-timing-tip">{realGuitar && timing.tendency === "early"
              ? "Let the note reach the strike line before you pick or strum."
              : realGuitar && timing.tendency === "late"
                ? "Read the next string and fret early, then pick as the note reaches the line."
                : guitarMode && timing.tendency === "early"
              ? "Let the gem reach the strike line before you strum."
              : guitarMode && timing.tendency === "late"
                ? "Look farther up the highway and prepare the frets before your next strum."
                : TIMING_COPY[timing.tendency].tip}</p>
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
  guitarMode?: boolean;
  realGuitar?: boolean;
  practice?: PracticeContext;
  results?: SessionResults | null;
  controls: { label: string; keys: string[] }[];
  onStart: () => void;
  onDemo: () => void;
  onRestart: () => void;
  onNext: () => void;
  onQuickStart: () => void;
  onBack: () => void;
  onPractice?: () => void;
  /** Defer the pause handoff while a drawer or dialog owns keyboard focus. */
  allowPauseFocus?: boolean;
};

function practiceTip(results: SessionResults, rhythm: boolean, guitarMode: boolean, realGuitar: boolean) {
  if (realGuitar) {
    if (results.demo) return "Try the riff on your guitar. The lanes show strings; each number is a fret. Connect guitar MIDI when you want pitch scoring.";
    if (results.holdBreaks > 0) return "Let the sustained notes ring. MIDI note-off ends a hold, so check your device’s sustain tracking if tails cut short.";
    const hits = results.perfect + results.great + results.good;
    if (hits === 0 || results.miss > hits) return "Check your guitar MIDI connection, then slow the tempo. Prepare each string and fret before the note arrives.";
    if (results.extra > Math.max(3, hits / 4)) return "Mute the strings you are not playing and pick once per note. MIDI scores pitch; the string and fret labels guide your fingering.";
    if (results.miss > 0) return "Read the next fret number early and keep your picking hand on the pulse.";
    if (results.great + results.good > 0) return "Aim your pick or strum at the centre of the strike line. Try the click for a steady pulse.";
  }
  if (guitarMode) {
    if (results.demo) return "Your turn: hold every fret shown, then strum once as the gem reaches the strike line.";
    if (results.holdBreaks > 0) return "Keep the matching frets held until the full tail passes the strike line. A tail does not need another strum.";
    const hits = results.perfect + results.great + results.good;
    if (hits === 0 || results.miss > hits) return "Slow the tempo. Set all the lit frets before you strum; fret presses alone do not score.";
    if (results.extra > Math.max(3, hits / 4)) return "Strum once per gem. Set the frets first and leave space between strums.";
    if (results.miss > 0) return "Read the next fret shape early. Hold every lit fret, with no extras, before you strum.";
    if (results.great + results.good > 0) return "Keep the frets ready and aim your strum at the centre of the strike line. Try the click for a steady pulse.";
  }
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

function RecommendedPractice({
  recommendation,
  busy,
  onPractice,
}: {
  recommendation: PracticeRecommendation;
  busy: boolean;
  onPractice: () => void;
}) {
  const { section, notes, misses, brokenHolds } = recommendation;
  return (
    <section className="session-recommendation" aria-labelledby="session-recommendation-heading">
      <h3 id="session-recommendation-heading">A passage to work on</h3>
      <p className="session-recommendation-passage">
        <strong>{section.name}</strong>
        <span>{formatTime(section.start)}–{formatTime(section.end)}</span>
      </p>
      <p className="session-recommendation-counts">
        {misses} missed {misses === 1 ? "note" : "notes"} · {brokenHolds} broken {brokenHolds === 1 ? "hold" : "holds"} · {notes} {notes === 1 ? "note" : "notes"}
      </p>
      <p className="session-recommendation-description">
        Highest share of missed notes or broken holds among passages with enough notes.
      </p>
      <Button type="button" variant="secondary" onClick={onPractice} disabled={busy}>
        Practice this passage
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
      <p className="session-recommendation-description">Opens practice with your current setup.</p>
    </section>
  );
}

function KeyGuide({ controls, rhythm, guitarMode, realGuitar }: Pick<SessionOverlayProps, "controls" | "rhythm" | "guitarMode" | "realGuitar">) {
  if (realGuitar) return null;
  if (guitarMode) return (
    <div className="session-controls" aria-label="Your guitar controls">
      <div className="session-controls-heading"><Keyboard size={14} aria-hidden="true" /> Frets, then strum</div>
      <div className="session-control-row">
        <span>Hold frets</span>
        <div className="session-keys">{["Z", "X", "C", "V", "B"].map((key) => <kbd key={key}>{key}</kbd>)}</div>
      </div>
      <div className="session-control-row">
        <span>Strum</span>
        <div className="session-keys"><kbd>↓</kbd><kbd>↑</kbd><kbd>Space</kbd></div>
      </div>
      <p className="session-footnote">On touch, hold the fret buttons and tap a strum below.</p>
    </div>
  );
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
  guitarMode = false,
  realGuitar = false,
  practice,
  results,
  controls,
  onStart,
  onDemo,
  onRestart,
  onNext,
  onQuickStart,
  onBack,
  onPractice,
  allowPauseFocus = true,
}: SessionOverlayProps) {
  const isResults = mode === "results" && results;
  const isPaused = mode === "paused";
  const resultsVisible = Boolean(isResults);
  const runContext = results
    ? `${DIFFICULTY_LABELS[results.difficulty]} · ${Math.round(results.speed * 100)}% tempo · ${results.parts.map((part) => part.label).join(" + ")}`
    : "";
  const sessionHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef(mode);
  const pauseFocusHandled = useRef(false);

  useEffect(() => {
    const leavingResults = previousMode.current === "results" && mode === "ready";
    previousMode.current = mode;
    if (!resultsVisible && !leavingResults) return;
    const heading = sessionHeadingRef.current;
    heading?.focus({ preventScroll: true });
    heading?.closest(".session-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
    // Announce completed sets and the ready screen after leaving results.
    // HUD refreshes must not move focus away from the player's next action.
  }, [resultsVisible, mode]);

  useEffect(() => {
    if (mode !== "paused") {
      pauseFocusHandled.current = false;
      return;
    }
    if (!allowPauseFocus || pauseFocusHandled.current) return;
    const heading = sessionHeadingRef.current;
    if (!heading) return;
    pauseFocusHandled.current = true;
    heading.focus({ preventScroll: true });
    heading.closest(".session-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
    // Handle a pause once, including after a drawer closes. HUD refreshes and
    // later drawer visits must leave the player's chosen control focused.
  }, [mode, allowPauseFocus]);

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
            <h2 ref={sessionHeadingRef} id="session-heading" tabIndex={-1} aria-describedby="session-result-summary">
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
              {results.extra} extra {realGuitar ? results.extra === 1 ? "note" : "notes" : guitarMode ? results.extra === 1 ? "strum" : "strums" : results.extra === 1 ? "press" : "presses"}
              {!rhythm && results.holds + results.holdBreaks > 0
                ? ` · ${results.holds} holds completed · ${results.holdBreaks} broken`
                : ""}
            </p>
            {!results.demo ? <RecentTiming parts={results.parts} guitarMode={guitarMode} realGuitar={realGuitar} /> : null}
            <div className="session-practice-tip">
              <span>{results.demo ? "STEP INTO THE SPOTLIGHT" : results.practice ? "FOR YOUR NEXT TAKE" : "FOR YOUR NEXT SET"}</span>
              <p>{practiceTip(results, rhythm, guitarMode, realGuitar)}</p>
            </div>
            {!results.demo && !results.practice && results.recommendation && onPractice ? (
              <RecommendedPractice recommendation={results.recommendation} busy={busy} onPractice={onPractice} />
            ) : null}
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
            <div className="session-eyebrow" id="session-pause-status">
              <Pause size={14} aria-hidden="true" /> {practice ? "PRACTICE PAUSED" : "SET PAUSED"}{demo ? " · AUTOPLAY" : ""}
            </div>
            <h2 ref={sessionHeadingRef} id="session-heading" tabIndex={-1} aria-describedby="session-pause-status session-pause-description">Take a breath.</h2>
            <p className="session-song">{songName}</p>
            {practice ? <PracticeSummary practice={practice} /> : null}
            <p className="session-description" id="session-pause-description">
              {realGuitar
                ? "Your place is saved. Read the next string and fret before you resume. MIDI note-off ends a sustained hold."
                : guitarMode
                ? "Your place is saved. Resume when you’re ready, with the matching frets held before your next strum."
                : "Your place is saved. Pick up the groove when you’re ready."}
            </p>
            <KeyGuide controls={controls} rhythm={rhythm} guitarMode={guitarMode} realGuitar={realGuitar} />
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
            <h2 ref={sessionHeadingRef} id="session-heading" tabIndex={-1}>Take the stage.</h2>
            <p className="session-song">{songName}</p>
            {practice ? <PracticeSummary practice={practice} /> : null}
            <p className="session-description">
              {realGuitar
                ? "Six lanes, six strings. Play the fret number as it crosses the strike line; 0 means an open string. Let long notes ring."
                : guitarMode
                ? "Hold every fret in the gem, then strum as it crosses the strike line. Frets choose the shape; only a strum scores. Keep holding through long tails."
                : rhythm
                ? "Tap once per gem as it crosses the strike line. Use your mapped key, tap the HIT pad, or play any MIDI note. No holds needed."
                : "Hit each gem as it crosses the strike line. Hold long notes to the end. You can use keys, MIDI, or tap the lanes."}
            </p>
            <KeyGuide controls={controls} rhythm={rhythm} guitarMode={guitarMode} realGuitar={realGuitar} />
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
              <span>{guitarMode || realGuitar ? "Warm up on keys instead?" : "First time on stage?"}</span>
              <Button type="button" variant="ghost" onClick={onQuickStart} disabled={busy}>
                Try beginner rehearsal
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
            <p className="session-footnote">
              {realGuitar
                ? "Standard tuning · E A D G B E. Connect guitar MIDI for pitch scoring, or use Watch the house to play along without scoring. MIDI cannot verify string choice."
                : practice
                ? "Start with a count-in. Repeat section gives you a fresh score on every take. Practice scores aren’t saved."
                : guitarMode
                  ? "Arcade guitar · keyboard / touch. Choose another song to play MIDI."
                  : "Solo by default. Add your band from the green room."}
              {practice && guitarMode ? " Arcade guitar uses keyboard or touch. Choose another song to play MIDI." : null}
              {practice && realGuitar ? " Each repeat starts a fresh take. Practice scores aren’t saved." : null}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
