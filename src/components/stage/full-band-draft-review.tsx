import { useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import type { SharedChart } from "@/lib/midi-stage/chart-format";
import type { AudioReviewInstrument } from "@/lib/midi-stage/audio-part-review";
import { LABELS } from "@/lib/midi-stage/songs";
import { AudioDraftStudio } from "./audio-draft-studio";
import { isReviewableDrumDraft } from "@/lib/midi-stage/drum-chart-review";
import { isReviewableKeyboardDraft } from "@/lib/midi-stage/keyboard-draft";
import { isReviewableBassDraft } from "@/lib/midi-stage/bass-draft";

const INSTRUMENTS = ["drums", "keys", "guitar", "bass"] as const;

export function FullBandDraftReview({ chart, audioFile, buffer, disabled, onApply, onPendingChange }: {
  chart: SharedChart; audioFile?: File; buffer?: AudioBuffer; disabled: boolean;
  onApply: (chart: SharedChart) => void; onPendingChange: (pending: boolean) => void;
}) {
  const original = useRef(chart);
  const count = (instrument: AudioReviewInstrument) => chart.parts.find((part) => part.type === instrument)!.notes.length;
  const available = INSTRUMENTS.filter((part) => part === "drums" ? isReviewableDrumDraft(chart)
    : part === "keys" ? isReviewableKeyboardDraft(chart) : part === "bass" ? isReviewableBassDraft(chart)
      : chart.matching !== "rhythm" && chart.guitarMode === "strings" && count(part));
  const [instrument, setInstrument] = useState<AudioReviewInstrument>(() => available.includes("guitar") ? "guitar" : available[0] ?? "drums");
  const [pending, setPending] = useState(false);
  const changePending = (value: boolean) => { setPending(value); onPendingChange(value); };

  if (!available.length) return <p className="mt-4 text-xs text-muted">These parts do not match the audio review ranges. Import aligned instrument stems to create an editable full-band draft.</p>;

  return <section className="mt-4 space-y-4 border-t border-border pt-4" aria-label="Full-band part review">
    <div>
      <h4 className="text-base font-medium">Review each instrument</h4>
      <p className="text-xs leading-relaxed text-muted">Corrections and restore affect the selected part. Count-in tempo is shared; notes and the original recording keep their timing. Download includes every part.</p>
    </div>
    <Tabs.Root value={instrument} onValueChange={(value) => { if (!pending) setInstrument(value as AudioReviewInstrument); }}>
      <Tabs.List aria-label="Review instrument" className="flex gap-2 border-b border-border pb-3">
        {INSTRUMENTS.map((part) => <Tabs.Trigger key={part} value={part} asChild>
          <Button type="button" variant={part === instrument ? "primary" : "secondary"} aria-label={LABELS[part]}
            disabled={disabled || !available.includes(part) || (pending && part !== instrument)}>
            {LABELS[part]} <span aria-hidden="true" className="font-mono text-xs opacity-70">{count(part)}</span>
          </Button>
        </Tabs.Trigger>)}
      </Tabs.List>
      {pending ? <p role="status" className="mt-3 text-xs text-tungsten">Apply or restore corrections before switching instruments.</p> : null}
      <Tabs.Content key={instrument} value={instrument} className="mt-4 space-y-4">
        <AudioDraftStudio chart={chart} instrument={instrument} originalChart={original.current}
          audioFile={audioFile} buffer={buffer} disabled={disabled} onApply={onApply} onPendingChange={changePending} />
      </Tabs.Content>
    </Tabs.Root>
  </section>;
}
