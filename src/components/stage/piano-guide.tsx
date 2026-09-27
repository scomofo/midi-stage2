import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import "./piano-guide.css";

const START = 48;
const END = 72;

function isBlack(pc: number) {
  return ![0, 2, 4, 5, 7, 9, 11].includes(pc);
}

function whiteIndex(midi: number) {
  let n = 0;
  for (let m = START; m < midi; m++) if (!isBlack(m % 12)) n++;
  return n;
}

const WHITE_COUNT = (() => {
  let n = 0;
  for (let m = START; m < END; m++) if (!isBlack(m % 12)) n++;
  return n;
})();

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function Key({
  midi,
  className,
  style,
  interactive,
  tabStop,
  onFocus,
  state,
  onPlay,
  onRelease,
}: {
  midi: number;
  className: string;
  style?: CSSProperties;
  interactive: boolean;
  tabStop: boolean;
  onFocus: () => void;
  state?: "expected" | "sounding" | "wrong" | "soon";
  onPlay?: (midi: number) => void;
  onRelease?: (midi: number) => void;
}) {
  const descriptionId = useId();
  const held = useRef(new Set<string>());
  const releaseCallback = useRef(onRelease);

  useEffect(() => {
    releaseCallback.current = onRelease;
  }, [onRelease]);

  useEffect(() => {
    const inputs = held.current;
    return () => {
      if (inputs.size) releaseCallback.current?.(midi);
      inputs.clear();
    };
  }, [interactive, midi]);

  const press = (token: string) => {
    if (!interactive || held.current.has(token)) return;
    const wasHeld = held.current.size > 0;
    held.current.add(token);
    if (!wasHeld) onPlay?.(midi);
  };

  const release = (token: string) => {
    if (held.current.delete(token) && !held.current.size) onRelease?.(midi);
  };

  const releasePointer = (event: PointerEvent<HTMLButtonElement>) => {
    release(`pointer:${event.pointerId}`);
  };

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    const token = `key:${event.key}`;
    if (!down) release(token);
    else if (!event.repeat) press(token);
  };

  return (
    <button
      type="button"
      disabled={!interactive}
      tabIndex={interactive && tabStop ? 0 : -1}
      data-midi={midi}
      aria-label={`${NAMES[midi % 12]} ${Math.floor(midi / 12) - 1}`}
      aria-describedby={state ? descriptionId : undefined}
      className={className}
      style={style}
      onFocus={onFocus}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (!interactive || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press(`pointer:${e.pointerId}`);
      }}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onLostPointerCapture={releasePointer}
      onKeyDown={(event) => handleKey(event, true)}
      onKeyUp={(event) => handleKey(event, false)}
      onBlur={() => {
        if (held.current.size) onRelease?.(midi);
        held.current.clear();
      }}
      onClick={(event) => {
        // Assistive technology can activate a button without pointer/key events.
        // Key handlers prevent the browser's synthetic keyboard click above.
        if (interactive && event.detail === 0 && !held.current.size) {
          onPlay?.(midi);
          onRelease?.(midi);
        }
      }}
    >
      {midi % 12 === 0 ? (
        <span className="pkey-octave" aria-hidden="true">
          C{Math.floor(midi / 12) - 1}
        </span>
      ) : null}
      {state ? (
        <>
          <span className="pkey-state" aria-hidden="true">
            {state === "wrong"
              ? "×"
              : state === "sounding"
                ? "✓"
                : state === "expected"
                  ? "●"
                  : "○"}
          </span>
          <span className="sr-only" id={descriptionId}>
            {state === "wrong"
              ? "Miss or extra press"
              : state === "sounding"
                ? "Successful hit"
                : state === "expected"
                  ? "Target note"
                  : "Approaching note"}
          </span>
        </>
      ) : null}
    </button>
  );
}

export function PianoGuide({
  expected,
  sounding,
  wrong,
  approaching,
  interactive = false,
  onPlay,
  onRelease,
}: {
  expected: Set<number>;
  sounding: Set<number>;
  wrong: Set<number>;
  approaching?: Set<number>;
  interactive?: boolean;
  onPlay?: (midi: number) => void;
  onRelease?: (midi: number) => void;
}) {
  const [activePitch, setActivePitch] = useState(START);
  const helpId = useId();
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let m = START; m < END; m++) {
    if (isBlack(m % 12)) blacks.push(m);
    else whites.push(m);
  }

  const cls = (midi: number, black: boolean) =>
    cn(
      "pkey",
      black && "black",
      approaching?.has(midi) && "soon",
      expected.has(midi) && "expected",
      sounding.has(midi) && "sounding",
      wrong.has(midi) && "wrong",
      interactive && "live",
    );

  const state = (midi: number) =>
    wrong.has(midi)
      ? "wrong"
      : sounding.has(midi)
        ? "sounding"
        : expected.has(midi)
          ? "expected"
          : approaching?.has(midi)
            ? "soon"
            : undefined;

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-midi]");
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    const current = Number(key.dataset.midi);
    const next =
      event.key === "Home"
        ? START
        : event.key === "End"
          ? END - 1
          : Math.max(START, Math.min(END - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
    // Pitch order includes sharps, independently of the white/black key DOM layers.
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-midi="${next}"]`)?.focus();
  };

  return (
    <div
      className="piano-guide"
      role="group"
      aria-label="Piano keys"
      aria-describedby={helpId}
      aria-hidden={!interactive}
      onKeyDown={navigate}
    >
      <div className="piano w-full">
        {whites.map((midi) => (
          <Key
            key={midi}
            midi={midi}
            className={cls(midi, false)}
            interactive={interactive}
            tabStop={activePitch === midi}
            onFocus={() => setActivePitch(midi)}
            state={state(midi)}
            onPlay={onPlay}
            onRelease={onRelease}
          />
        ))}
        {blacks.map((midi) => {
          const left = (whiteIndex(midi) / WHITE_COUNT) * 100;
          return (
            <Key
              key={midi}
              midi={midi}
              className={cls(midi, true)}
              style={{ left: `${left}%` }}
              interactive={interactive}
              tabStop={activePitch === midi}
              onFocus={() => setActivePitch(midi)}
              state={state(midi)}
              onPlay={onPlay}
              onRelease={onRelease}
            />
          );
        })}
      </div>
      <p className="piano-keyboard-help" id={helpId}>
        ← → move by note · Home / End jump · Hold Enter or Space to play · Tab leaves the piano
      </p>
    </div>
  );
}
