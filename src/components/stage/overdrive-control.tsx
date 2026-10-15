import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Status } from "@/lib/midi-stage/types";
import "./overdrive-control.css";

export function OverdriveControl({ charge, active, status, demo, countIn, onActivate }: {
  charge: number;
  active: boolean;
  status: Status;
  demo: boolean;
  countIn: boolean;
  onActivate: () => void;
}) {
  const charged = charge >= 30;
  const available = charged && !active && status === "playing" && !demo && !countIn;
  const message = demo ? "Autoplay · boost unavailable"
    : active ? status === "paused" ? "Boost paused with your set" : "Double your current multiplier"
    : charged ? status === "paused" ? "Charge saved · resume to activate" : "Ready for a multiplier boost"
    : "Land notes to charge · ready at 30%";

  return (
    <section className="stage-overdrive" data-active={active} data-ready={available} aria-label="Overdrive">
      <div className="stage-overdrive-copy">
        <strong><Zap size={14} aria-hidden="true" /> Overdrive</strong>
        <span role="status">{message}</span>
      </div>
      <div className="stage-overdrive-charge">
        <meter min={0} max={100} value={charge} aria-label="Overdrive charge"
          aria-valuetext={`${Math.round(charge)} percent${charged ? ", charged" : ", ready at 30 percent"}`} />
        <span aria-hidden="true">{Math.round(charge)}%</span>
      </div>
      <Button type="button" variant={available ? "primary" : "secondary"} disabled={!available}
        onClick={onActivate} aria-label="Activate Overdrive" aria-keyshortcuts="Shift+Enter">
        {active ? "Boost active" : "Activate"}
        <kbd aria-hidden="true">⇧ Enter</kbd>
      </Button>
    </section>
  );
}
