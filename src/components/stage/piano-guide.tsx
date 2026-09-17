import type { CSSProperties, PointerEvent } from "react";
import { cn } from "@/lib/utils";

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
  onPlay,
  onRelease,
}: {
  midi: number;
  className: string;
  style?: CSSProperties;
  interactive: boolean;
  onPlay?: (midi: number) => void;
  onRelease?: (midi: number) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={interactive ? 0 : -1}
      aria-label={`${NAMES[midi % 12]} ${Math.floor(midi / 12) - 1}`}
      className={className}
      style={style}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (!interactive) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onPlay?.(midi);
      }}
      onPointerUp={() => interactive && onRelease?.(midi)}
      onPointerCancel={() => interactive && onRelease?.(midi)}
    />
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

  return (
    <div className="piano w-full" aria-hidden={!interactive}>
      {whites.map((midi) => (
        <Key
          key={midi}
          midi={midi}
          className={cls(midi, false)}
          interactive={interactive}
          onPlay={onPlay}
          onRelease={onRelease}
        />
      ))}
      {blacks.map((midi) => {
        const left = ((whiteIndex(midi) + 0.72) / WHITE_COUNT) * 100;
        return (
          <Key
            key={midi}
            midi={midi}
            className={cls(midi, true)}
            style={{ left: `${left}%` }}
            interactive={interactive}
            onPlay={onPlay}
            onRelease={onRelease}
          />
        );
      })}
    </div>
  );
}
