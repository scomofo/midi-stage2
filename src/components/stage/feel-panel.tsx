import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  FEEL_COPY,
  matchFeelPreset,
  type Feel,
  type FeelPreset,
  withPreset,
} from "@/lib/midi-stage/feel";
import { cn } from "@/lib/utils";

const PRESETS: FeelPreset[] = ["calm", "house", "arena"];

function SliderRow({
  label,
  value,
  onChange,
  onPreview,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  onPreview?: () => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between text-[10px] font-semibold tracking-[0.16em] text-muted">
        {label}
        <span className="font-mono tabular-nums text-fg">{Math.round(value * 100)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        aria-label={label}
        className="feel-range"
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onPreview}
        onKeyUp={onPreview}
        suppressHydrationWarning
      />
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "flex min-h-11 items-center justify-between rounded-lg px-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.1)]",
        on ? "bg-elevated" : "bg-surface",
      )}
    >
      <span>
        <strong className="block text-[13px] font-medium">{label}</strong>
        <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>
      </span>
      <span className="text-[10px] tracking-[0.14em] text-accent">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function LiveMeter({ label, value, tone }: { label: string; value: number; tone: "accent" | "tungsten" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[10px] font-semibold tracking-[0.16em] text-muted">
        {label}
        <span className="font-mono tabular-nums text-fg">{pct}</span>
      </span>
      <div className="feel-meter" aria-hidden="true">
        <i className={tone === "tungsten" ? "tungsten" : undefined} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-semibold tracking-[0.16em] text-subtle">{title}</div>
      {children}
    </div>
  );
}

export function FeelPanel({
  feel,
  reduced,
  tapping,
  live,
  onChange,
  onPreview,
  onToggleTap,
  onClose,
}: {
  feel: Feel;
  reduced: boolean;
  tapping: boolean;
  live: { bloom: number; trauma: number };
  onChange: (feel: Feel) => void;
  onPreview: (kind: "perfect" | "miss") => void;
  onToggleTap: () => void;
  onClose: () => void;
}) {
  function patch(partial: Partial<Omit<Feel, "preset">>) {
    const next = { ...feel, ...partial };
    onChange({ ...next, preset: matchFeelPreset(next) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.2em] text-accent">THE ROOM</div>
          <h2 id="room-title" className="font-display mt-1 text-[1.7rem] font-semibold tracking-[-0.04em]">
            How the house answers.
          </h2>
          <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted text-pretty">
            Drag a fader and watch the stage. Hits keep tapping so you can hear the room without playing.
          </p>
        </div>
        <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Close the room" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((name) => {
            const active = feel.preset === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(withPreset(name));
                  onPreview("perfect");
                }}
                className={cn(
                  "rounded-xl px-2 py-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.1)] transition-[background,box-shadow] duration-150",
                  active ? "bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.45)]" : "bg-surface hover:bg-elevated",
                )}
              >
                <strong className="block text-[13px] font-medium">{FEEL_COPY[name].label}</strong>
                <span className="mt-1 block text-[10px] leading-snug text-muted">{FEEL_COPY[name].line}</span>
              </button>
            );
          })}
        </div>

        {feel.preset === "custom" ? (
          <div className="text-[10px] tracking-[0.16em] text-tungsten">CUSTOM MIX</div>
        ) : null}

        {reduced ? (
          <p className="rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-muted shadow-[0_0_0_1px_rgba(239,232,220,0.08)]">
            Your system asked for less motion. Sparks and shake stay off.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface px-3 py-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]">
          <LiveMeter label="LIVE BLOOM" value={live.bloom} tone="accent" />
          <LiveMeter label="LIVE SHAKE" value={live.trauma} tone="tungsten" />
        </div>

        <ToggleRow
          label="Keep tapping"
          hint="The stage hits itself on the beat so you can watch."
          on={tapping}
          onToggle={onToggleTap}
        />

        <Section title="THE HOUSE">
          <div className="grid grid-cols-1 gap-3">
            <SliderRow label="LIGHTS" value={feel.lights} onChange={(lights) => patch({ lights })} />
            <SliderRow label="CROWD" value={feel.crowd} onChange={(crowd) => patch({ crowd })} />
            <SliderRow label="TRAILS" value={feel.trails} onChange={(trails) => patch({ trails })} />
          </div>
        </Section>

        <Section title="THE HIT">
          <div className="grid grid-cols-1 gap-3">
            <SliderRow
              label="SPARKS"
              value={feel.juice}
              onChange={(juice) => patch({ juice })}
              onPreview={() => onPreview("perfect")}
            />
            <SliderRow
              label="BLOOM"
              value={feel.bloom}
              onChange={(bloom) => patch({ bloom })}
              onPreview={() => onPreview("perfect")}
            />
            <SliderRow
              label="PUNCH"
              value={feel.punch}
              onChange={(punch) => patch({ punch })}
              onPreview={() => onPreview("perfect")}
            />
            <SliderRow
              label="SHAKE"
              value={feel.shake}
              onChange={(shake) => patch({ shake })}
              onPreview={() => onPreview(feel.hitsShake ? "perfect" : "miss")}
            />
          </div>
        </Section>

        <Section title="THE HUD">
          <div className="flex flex-col gap-2">
            <ToggleRow
              label="Pocket hits shake"
              hint="Off keeps perfects planted. On is the arena jolt."
              on={feel.hitsShake}
              onToggle={() => {
                patch({ hitsShake: !feel.hitsShake });
                onPreview(!feel.hitsShake ? "perfect" : "miss");
              }}
            />
            <ToggleRow
              label="Score floaters"
              hint="The +n that lifts off the strike line."
              on={feel.floaters}
              onToggle={() => {
                patch({ floaters: !feel.floaters });
                onPreview("perfect");
              }}
            />
            <ToggleRow
              label="Grade callouts"
              hint="PERFECT / GREAT sitting over the highway."
              on={feel.callouts}
              onToggle={() => {
                patch({ callouts: !feel.callouts });
                onPreview("perfect");
              }}
            />
          </div>
        </Section>
      </div>

      <div className="flex gap-2 border-t border-border bg-bg px-5 py-4">
        <Button className="flex-1" onClick={() => onPreview("perfect")}>
          Try a perfect
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => onPreview("miss")}>
          Try a miss
        </Button>
      </div>
    </div>
  );
}
