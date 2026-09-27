import { useCallback, useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, Guitar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANE_COLORS } from "@/lib/midi-stage/engine";
import "./guitar-controller.css";

const FRET_KEYS = ["Z", "X", "C", "V", "B"] as const;

export type GuitarControllerProps = {
  selected: number[];
  held: number[];
  disabled: boolean;
  paused?: boolean;
  onFretDown: (lane: number, token: string) => void;
  onFretUp: (token: string) => void;
  onStrum: (direction: "up" | "down") => void;
};

function buttonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.stopPropagation();
  // Keep native click activation, but never repeat a strum or a fret toggle.
  if (event.repeat) event.preventDefault();
}

function buttonKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

export function GuitarController({
  selected,
  held,
  disabled,
  paused = false,
  onFretDown,
  onFretUp,
  onStrum,
}: GuitarControllerProps) {
  const id = useId();
  const ownedTokens = useRef(new Set<string>());
  const releaseCallback = useRef(onFretUp);

  useEffect(() => { releaseCallback.current = onFretUp; }, [onFretUp]);

  const releaseAll = useCallback(() => {
    const tokens = [...ownedTokens.current];
    ownedTokens.current.clear();
    tokens.forEach((token) => releaseCallback.current(token));
  }, []);

  useEffect(() => {
    if (disabled) releaseAll();
  }, [disabled, releaseAll]);

  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) releaseAll(); };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseAll();
    };
  }, [releaseAll]);

  function press(lane: number, token: string) {
    if (disabled || ownedTokens.current.has(token)) return;
    ownedTokens.current.add(token);
    onFretDown(lane, token);
  }

  function release(token: string) {
    if (ownedTokens.current.delete(token)) onFretUp(token);
  }

  function releasePointer(lane: number, event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    release(`guitar-touch:${lane}:${event.pointerId}`);
  }

  function toggleFret(lane: number) {
    if (disabled) return;
    const token = `guitar-toggle:${lane}`;
    if (ownedTokens.current.has(token) && selected.includes(lane)) release(token);
    else {
      // A parent reset may have cleared the selection since this latch was set.
      ownedTokens.current.delete(token);
      press(lane, token);
    }
  }

  return (
    <section className="guitar-controller" aria-label="Arcade guitar controller" aria-describedby={`${id}-help`}>
      <p className="guitar-controller-heading"><Guitar size={16} aria-hidden="true" /> Arcade guitar · keyboard / touch</p>
      <div className="guitar-controller-frets" role="group" aria-label="Five frets">
        {FRET_KEYS.map((key, lane) => {
          const isSelected = selected.includes(lane);
          const isHeld = held.includes(lane);
          return (
            <Button
              key={key}
              type="button"
              variant="secondary"
              className="guitar-fret"
              style={{ "--fret-color": LANE_COLORS[lane] } as CSSProperties}
              aria-label={`Fret ${lane + 1}`}
              aria-pressed={isSelected}
              aria-describedby={`${id}-fret-help${isHeld ? ` ${id}-held-${lane}` : ""}`}
              data-fret={lane}
              data-held={isHeld}
              disabled={disabled}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                press(lane, `guitar-touch:${lane}:${event.pointerId}`);
              }}
              onPointerUp={(event) => releasePointer(lane, event)}
              onPointerCancel={(event) => releasePointer(lane, event)}
              onLostPointerCapture={(event) => releasePointer(lane, event)}
              onKeyDown={buttonKeyDown}
              onKeyUp={buttonKeyUp}
              onClick={(event) => {
                event.stopPropagation();
                // Pointer holds already released on pointerup. Only keyboard or
                // assistive activation latches a fret for a later strum.
                if (event.detail === 0) toggleFret(lane);
              }}
            >
              <kbd aria-hidden="true">{key}</kbd>
              <span className="guitar-fret-state" aria-hidden="true">{isHeld ? "HOLD" : isSelected ? "SET" : `FRET ${lane + 1}`}</span>
              {isHeld ? <span className="sr-only" id={`${id}-held-${lane}`}>Sustain in progress. Keep holding.</span> : null}
            </Button>
          );
        })}
      </div>
      <div className="guitar-controller-strums" role="group" aria-label="Strum controls">
        {(["down", "up"] as const).map((direction) => {
          const Arrow = direction === "down" ? ArrowDown : ArrowUp;
          return (
            <Button
              key={direction}
              type="button"
              variant="secondary"
              className="guitar-strum"
              aria-label={`Strum ${direction}`}
              disabled={disabled || paused}
              onKeyDown={buttonKeyDown}
              onKeyUp={buttonKeyUp}
              onPointerDown={(event) => {
                if (disabled || paused || event.button !== 0) return;
                // A secondary touch does not synthesize click while frets are
                // held. Strike on contact, and keep native keyboard activation.
                event.preventDefault();
                event.stopPropagation();
                onStrum(direction);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (event.detail === 0 && !disabled && !paused) onStrum(direction);
              }}
            >
              <Arrow size={20} aria-hidden="true" />
              <span className="guitar-strum-copy" aria-hidden="true">
                <span>Strum {direction}</span>
                <kbd>{direction === "down" ? "↓ / Space" : "↑"}</kbd>
              </span>
            </Button>
          );
        })}
      </div>
      <p className="guitar-controller-help" id={`${id}-help`}>
        Hold Z X C V B, then strum with ↓ / ↑ or Space. Match every lit fret; keep holding through tails.
      </p>
      <p className="guitar-controller-focus-help" id={`${id}-fret-help`}>
        Touch: hold the fret buttons, then tap a strum. With keyboard focus, Enter or Space toggles a fret on or off.
      </p>
    </section>
  );
}
