import { useState } from "react";
import { Button } from "@/components/ui/button";
import { canConfirmTempo, PRACTICE_SPEEDS, type TempoPlan } from "@/lib/midi-stage/practice-tempo";
import "./practice-tempo.css";

export function PracticeTempo({ plan, speed, active, busy, warning, onBegin, onResume, onStop, onConfirm }: {
  plan: TempoPlan | null; speed: number; active: boolean; busy: boolean; warning: string | null;
  onBegin: (start: number, target: number) => void; onResume: () => void; onStop: () => void; onConfirm: () => void;
}) {
  const [start, setStart] = useState(Number.isFinite(speed) ? speed : 0.75);
  const [target, setTarget] = useState(Math.max(1, speed));
  return <section className="practice-tempo" aria-labelledby="practice-tempo-heading">
    <div className="practice-tempo-heading">
      <div><h3 id="practice-tempo-heading">BUILD UP TEMPO</h3><p>Learn this passage at your pace. Keep the original pitch.</p></div>
      {plan ? <span className="practice-tempo-badge">{plan.complete ? "Target reached" : active ? "Progression on" : "Saved progress"}</span> : null}
    </div>
    {plan ? <>
      <div className="practice-tempo-summary" role="status" aria-live="polite" aria-atomic="true">
        <span>Next tempo <strong>{Math.round(plan.current * 100)}%</strong></span>
        <span>Target <strong>{Math.round(plan.target * 100)}%</strong></span>
        <span>Best clean take <strong>{plan.bestClean ? `${Math.round(plan.bestClean * 100)}%` : "None yet"}</strong></span>
        <span>{plan.complete ? "Goal complete" : `${plan.streak}/2 strong takes at this tempo`}</span>
      </div>
      <div className="practice-tempo-actions">
        {!active && !plan.complete ? <Button type="button" variant="secondary" disabled={busy} onClick={onResume}>Resume progression at {Math.round(plan.current * 100)}%</Button> : null}
        {active ? <Button type="button" variant="ghost" disabled={busy} onClick={onStop}>Pause progression</Button> : null}
        {active && canConfirmTempo(plan) ? <Button type="button" variant="secondary" disabled={busy} onClick={onConfirm}>{plan.current === plan.target ? "Confirm target tempo" : "Ready for faster"}</Button> : null}
      </div>
      {plan.history.length ? <details className="practice-tempo-history"><summary>Take history · {plan.takes} completed</summary><ol aria-label="Tempo practice takes">
        {[...plan.history].reverse().map(take => <li key={take.id}><span>Take {take.id} · {Math.round(take.speed * 100)}%</span>
          <span>{take.mode === "manual" ? `Play along · ${take.confirmed ? "self-reported ready" : "unscored"}` : `${Math.round(take.accuracy!)}% accuracy · ${take.strong ? "strong take" : "keep practising"}`}</span></li>)}
      </ol><p>Showing the latest 12 takes. Self-reported takes never earn a best clean tempo.</p></details> : null}
    </> : null}
    {!active ? <div className="practice-tempo-config">
      <label>Starting tempo<select aria-label="Starting practice tempo" disabled={busy} value={start} onChange={e => { const value = Number(e.target.value); setStart(value); if (value > target) setTarget(value); }}>
        {PRACTICE_SPEEDS.map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
      <label>Target tempo<select aria-label="Target practice tempo" disabled={busy} value={target} onChange={e => setTarget(Number(e.target.value))}>
        {PRACTICE_SPEEDS.filter(value => value >= start).map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => onBegin(start, target)}>{plan ? "Start a new tempo goal" : "Enable tempo progression"}</Button>
    </div> : null}
    {plan && !active ? <p className="practice-tempo-help">Starting a new goal replaces this goal’s history.</p> : null}
    <p className="practice-tempo-help">Two consecutive takes at 95% accuracy or better, with no misses, extra presses or broken holds, raise the tempo by 5 percentage points. A difficult take keeps the speed and resets the streak. Two strong takes at the target finish the goal.</p>
    <p className="practice-tempo-help">Guitar Play along is unscored: finish a take, then choose Ready for faster yourself. Watching autoplay earns no progress. Progress stays on this device for this chart, passage, difficulty and lineup. Resuming never starts playback.</p>
    {warning ? <p role="status" className="practice-tempo-warning">{warning}</p> : null}
  </section>;
}
