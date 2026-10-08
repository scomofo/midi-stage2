import { Trophy, Star, MapPin, Award, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  VENUES,
  ACHIEVEMENTS,
  loadCareerData,
  getTotalStars,
  getUnlockedVenues,
  setSelectedVenue,
  type CareerData,
} from "@/lib/midi-stage/career";
import { cn } from "@/lib/utils";

type CareerPanelProps = {
  data: CareerData;
  onClose: () => void;
  onSelectVenue?: (venueId: string) => void;
};

export function CareerPanel({ data, onClose, onSelectVenue }: CareerPanelProps) {
  const careerData = data || loadCareerData();
  const totalStars = getTotalStars(careerData);
  const unlockedVenues = getUnlockedVenues(totalStars);
  const selectedVenueId = careerData.selectedVenueId || "garage";

  return (
    <div className="flex size-full flex-col overflow-hidden bg-bg p-4 sm:p-6 text-fg">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-accent">
            <Trophy className="size-3.5" /> WORLD TOUR CAREER
          </div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight">Hall of Fame & Venues</h2>
        </div>
        <Button size="icon" variant="ghost" aria-label="Close World Tour" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>

      <div className="my-4 flex items-center justify-between rounded-xl bg-elevated p-4 shadow-[0_0_0_1px_rgba(239,232,220,0.1)]">
        <div>
          <div className="text-[10px] font-medium tracking-[0.16em] text-muted">CAREER TOTAL STARS</div>
          <div className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold text-accent">
            <Star className="size-5 fill-accent text-accent" />
            {totalStars} <span className="text-xs text-muted font-normal">/ {VENUES.length * 5} Stars</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium tracking-[0.16em] text-muted">TOTAL CAREER SCORE</div>
          <div className="mt-1 text-xl font-bold font-mono text-fg">{careerData.totalScore.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted">
            <MapPin className="size-3.5 text-accent" /> TOUR VENUES ({unlockedVenues.length}/{VENUES.length} UNLOCKED)
          </h3>
          <div className="grid gap-3">
            {VENUES.map((venue) => {
              const isUnlocked = totalStars >= venue.starsRequired;
              const isSelected = selectedVenueId === venue.id;
              return (
                <div
                  key={venue.id}
                  onClick={() => {
                    if (isUnlocked) {
                      setSelectedVenue(venue.id);
                      onSelectVenue?.(venue.id);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-3.5 shadow-[0_0_0_1px_rgba(239,232,220,0.08)] transition-all cursor-pointer",
                    isUnlocked ? "bg-surface hover:bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.25)]" : "bg-bg/60 opacity-60 cursor-not-allowed",
                    isSelected && "ring-2 ring-accent shadow-[0_0_12px_rgba(143,212,196,0.4)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{venue.badge}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-semibold text-fg">{venue.name}</strong>
                        {isSelected ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold text-bg">ACTIVE STAGE</span>
                        ) : isUnlocked ? (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-medium text-accent">UNLOCKED</span>
                        ) : (
                          <span className="rounded-full bg-tungsten/20 px-2 py-0.5 text-[9px] font-medium text-tungsten">
                            REQ: {venue.starsRequired} ⭐
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{venue.description}</p>
                      <small className="mt-1 block text-[10px] text-subtle">{venue.location} · {venue.capacity}</small>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted">
            <Award className="size-3.5 text-accent" /> ACHIEVEMENTS ({careerData.unlockedAchievements.length}/{ACHIEVEMENTS.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = careerData.unlockedAchievements.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
                    unlocked ? "bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.3)]" : "bg-surface/50 opacity-50",
                  )}
                >
                  <span className="text-2xl">{ach.icon}</span>
                  <div>
                    <strong className="block text-xs font-semibold">{ach.title}</strong>
                    <p className="mt-0.5 text-[11px] text-muted leading-snug">{ach.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
