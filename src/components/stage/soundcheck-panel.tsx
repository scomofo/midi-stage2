import { Check, Music2, Plug, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MidiRoute, MidiRoutes } from "@/lib/midi-stage/midi-routing";
import type { Instrument, Player } from "@/lib/midi-stage/types";

type SoundcheckPanelProps = {
  players: Player[];
  inputs: { id: string; name: string; manufacturer: string }[];
  routes: MidiRoutes;
  audioReady: boolean;
  unlocking: boolean;
  canPractice: boolean;
  volume: number;
  lastPlayed: string;
  midiLast: string;
  midiError: string;
  connecting: boolean;
  onEnableSound: () => void;
  onConnect: () => void;
  onRouteChange: (id: Instrument, route: MidiRoute) => void;
  onClose: () => void;
};

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-elevated px-3 text-sm text-fg";

export function SoundcheckPanel({
  players,
  inputs,
  routes,
  audioReady,
  unlocking,
  canPractice,
  volume,
  lastPlayed,
  midiLast,
  midiError,
  connecting,
  onEnableSound,
  onConnect,
  onRouteChange,
  onClose,
}: SoundcheckPanelProps) {
  return (
    <section
      id="soundcheck-panel"
      aria-labelledby="soundcheck-title"
      className="my-4 min-w-0 rounded-2xl border border-border bg-surface p-4 text-fg sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="soundcheck-title" className="font-display text-xl font-semibold tracking-tight">
            Soundcheck
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Find your sound before the lights go up. Warm up without changing your score.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close soundcheck"
          onClick={onClose}
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={audioReady ? "secondary" : "primary"}
          className="shrink-0"
          disabled={audioReady || unlocking || !canPractice}
          aria-busy={unlocking}
          onClick={onEnableSound}
        >
          {audioReady ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Volume2 className="size-4" aria-hidden="true" />
          )}
          {unlocking ? "Enabling sound…" : audioReady ? "Sound enabled" : "Enable sound"}
        </Button>
        <p className="text-sm leading-relaxed text-muted">
          {canPractice
            ? "Try your mapped keys, or tap the pads and piano below."
            : "Use the reset arrow above to return to warmup. Your current take stays unchanged until you reset."}
        </p>
      </div>

      {volume === 0 ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-tungsten">
          <VolumeX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Master volume is muted. Raise the volume below to hear your soundcheck.
        </p>
      ) : null}

      <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-border bg-bg px-3 py-3 text-fg">
        <Music2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <output
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Soundcheck feedback"
          className="min-w-0 break-words text-sm leading-relaxed"
        >
          {lastPlayed || "Play a mapped key, pad, or MIDI note."}
        </output>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">MIDI inputs</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {inputs.length
                ? `${inputs.length} ${inputs.length === 1 ? "device connected" : "devices connected"}. Choose which part each one plays.`
                : "No MIDI devices connected. Keyboard and touch are always available."}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={connecting}
            aria-busy={connecting}
            onClick={onConnect}
          >
            <Plug className="size-4" aria-hidden="true" />
            {connecting ? "Connecting…" : "Connect MIDI"}
          </Button>
        </div>

        {midiError ? (
          <p role="alert" className="mt-3 break-words text-sm leading-relaxed text-tungsten">
            {midiError}
          </p>
        ) : null}
        {midiLast ? (
          <p className="mt-3 break-words font-mono text-xs leading-relaxed text-muted">
            {midiLast}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-4">
          {players
            .filter((player) => player.enabled)
            .map((player) => {
              const route = routes[player.id];
              const deviceMode = route.mode === "device";
              const missingDevice =
                deviceMode && !inputs.some((input) => input.id === route.inputId);
              return (
                <div key={player.id} className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-muted">
                    {player.label} MIDI input
                    <select
                      aria-label={`${player.label} MIDI input`}
                      className={selectClass}
                      value={deviceMode ? `device:${route.inputId}` : route.mode}
                      onChange={(event) => {
                        const value = event.target.value;
                        onRouteChange(
                          player.id,
                          value.startsWith("device:")
                            ? {
                                mode: "device",
                                inputId: value.slice(7),
                                channel: deviceMode ? route.channel : null,
                              }
                            : {
                                mode: value === "off" ? "off" : "auto",
                                inputId: "",
                                channel: null,
                              },
                        );
                      }}
                    >
                      <option value="auto">Automatic</option>
                      <option value="off">Keyboard &amp; touch only</option>
                      {missingDevice ? (
                        <option value={`device:${route.inputId}`}>Disconnected device</option>
                      ) : null}
                      {inputs.map((input) => (
                        <option key={input.id} value={`device:${input.id}`}>
                          {input.name || "MIDI device"}
                          {input.manufacturer ? ` · ${input.manufacturer}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {deviceMode ? (
                    <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-muted">
                      {player.label} MIDI channel
                      <select
                        aria-label={`${player.label} MIDI channel`}
                        className={selectClass}
                        value={route.channel === null ? "all" : String(route.channel)}
                        onChange={(event) =>
                          onRouteChange(player.id, {
                            ...route,
                            channel:
                              event.target.value === "all" ? null : Number(event.target.value),
                          })
                        }
                      >
                        <option value="all">All channels</option>
                        {Array.from({ length: 16 }, (_, index) => (
                          <option key={index + 1} value={String(index + 1)}>
                            Channel {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {missingDevice ? (
                    <p className="text-xs leading-relaxed text-tungsten sm:col-span-2">
                      This part is waiting for its assigned device. Reconnect it or choose another
                      input.
                    </p>
                  ) : null}
                </div>
              );
            })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Automatic sends channel 10 to drums and other channels to the first melodic part. Each
          note plays one part: a matching channel takes priority, then all channels, then automatic.
          If assignments match, the first part in the lineup plays.
        </p>
      </div>
    </section>
  );
}
