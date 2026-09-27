import { useEffect, useState } from "react";
import "./stage-count-in.css";

export type StageCountInProps = {
  /** Beats remaining, derived from the audio clock by the parent. */
  count: 1 | 2 | 3 | 4;
  demo: boolean;
};

export function StageCountIn({ count, demo }: StageCountInProps) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Announce this phase once after the live region mounts. Updating the
    // visible beat must not queue four spoken numbers over the audible click.
    setAnnouncement(demo ? "Autoplay count-in." : "Count-in. Get ready to play.");
  }, [demo]);

  return (
    <div className="stage-count-in" data-count={count}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div className="stage-count-in-card" aria-hidden="true">
        <span className="stage-count-in-label">{demo ? "AUTOPLAY · COUNT IN" : "COUNT IN"}</span>
        <strong className="stage-count-in-number" key={count}>{count}</strong>
        <div className="stage-count-in-beats">
          {[4, 3, 2, 1].map((beat) => (
            <span key={beat} className="stage-count-in-beat" data-state={beat === count ? "current" : beat > count ? "done" : "upcoming"} />
          ))}
        </div>
      </div>
    </div>
  );
}
