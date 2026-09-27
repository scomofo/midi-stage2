import { useId, useRef } from "react";
import { Check, CornerUpLeft } from "lucide-react";
import { formatTime } from "@/lib/midi-stage/engine";
import type { PracticeSection } from "@/lib/midi-stage/practice";
import "./song-map.css";

export type SongMapProps = {
  sections: PracticeSection[];
  selectedId: string;
  duration: number;
  busy: boolean;
  onSelect: (id: string) => void;
  onExit: () => void;
};

export function SongMap({ sections, selectedId, duration, busy, onSelect, onExit }: SongMapProps) {
  const id = useId();
  const firstPassage = useRef<HTMLButtonElement>(null);
  const selected = sections.find((section) => section.id === selectedId);
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const percent = (seconds: number) => total ? Math.min(100, Math.max(0, seconds / total * 100)) : 0;

  return (
    <section className="song-map" aria-labelledby={`${id}-title`}>
      <div className="song-map-heading">
        <div>
          <p className="song-map-eyebrow">Song map</p>
          <h3 id={`${id}-title`}>Choose your passage</h3>
          <p className="song-map-meta">
            {sections.length} {sections.length === 1 ? "passage" : "passages"}
            <span aria-hidden="true"> · </span>{formatTime(total)}
          </p>
        </div>
        {selected ? (
          <button type="button" className="song-map-full" disabled={busy} onClick={() => {
            // This action disappears in full-song mode; leave focus on a
            // stable control instead of dropping keyboard users into the page.
            firstPassage.current?.focus({ preventScroll: true });
            onExit();
          }}>
            <CornerUpLeft size={15} aria-hidden="true" /> Full song
          </button>
        ) : null}
      </div>

      {sections.length ? (
        <>
          <div className="song-map-overview" aria-hidden="true">
            <div className="song-map-ribbon">
              {sections.map((section, index) => {
                const left = percent(section.start);
                const width = Math.max(0, percent(section.end) - left);
                return (
                  <span
                    key={section.id}
                    className="song-map-segment"
                    data-selected={section.id === selectedId || undefined}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {width >= 7 ? String(index + 1).padStart(2, "0") : null}
                  </span>
                );
              })}
            </div>
            <div className="song-map-axis"><span>00:00</span><span>Full song</span><span>{formatTime(total)}</span></div>
          </div>

          <div className="song-map-scroll" role="region" aria-label="Song passages">
            <ol className="song-map-passages">
              {sections.map((section, index) => {
                const active = section.id === selectedId;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      ref={index === 0 ? firstPassage : undefined}
                      className="song-map-passage"
                      aria-pressed={active}
                      aria-label={`Practise ${section.name}, section ${index + 1} of ${sections.length}, ${formatTime(section.start)} to ${formatTime(section.end)}`}
                      disabled={busy}
                      onClick={() => onSelect(section.id)}
                    >
                      <span className="song-map-passage-top">
                        <span className="song-map-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        {active ? <span className="song-map-selected"><Check size={12} aria-hidden="true" /> Selected</span> : null}
                      </span>
                      <span className="song-map-name">{section.name}</span>
                      <span className="song-map-time">{formatTime(section.start)} <span aria-hidden="true">–</span> {formatTime(section.end)}</span>
                      <span className="song-map-duration" aria-hidden="true">
                        <span style={{ width: `${percent(section.end - section.start)}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {busy ? <p className="song-map-help">Preparing the stage. Passage selection will be available shortly.</p> : null}
        </>
      ) : <p className="song-map-help">No playable passages for this song.</p>}
    </section>
  );
}
