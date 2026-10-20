import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultStemMix, type StemMix } from "@/lib/midi-stage/stem-mix";
import type { Instrument } from "@/lib/midi-stage/types";
import "./stem-mixer.css";

const labels: Record<Instrument, string> = { drums: "Drums", keys: "Keys", guitar: "Guitar", bass: "Bass" };

export function StemMixer({ tracks, mix, lineup, busy, starting, onChange }: {
  tracks: Instrument[]; mix: StemMix; lineup: Instrument[]; busy: boolean; starting: boolean; onChange: (mix: StemMix) => void;
}) {
  if (!tracks.length && mix.mode === "original") return null;
  const changeChannel = (kind: Instrument, patch: Partial<StemMix["channels"][Instrument]>) => onChange({
    ...mix, channels: { ...mix.channels, [kind]: { ...mix.channels[kind], ...patch } },
  });
  const leaveRoom = () => {
    const next = { ...mix, mode: "stems" as const, channels: { ...mix.channels } };
    for (const kind of tracks) next.channels[kind] = { ...mix.channels[kind], muted: lineup.includes(kind), solo: false };
    onChange(next);
  };
  return <section className="stem-mixer" aria-labelledby="stem-mixer-title">
    <div className="stem-mixer-heading">
      <div><h3 id="stem-mixer-title"><SlidersHorizontal size={16} aria-hidden="true" /> BAND MIX</h3><p>Listen closely. Then leave room for your part.</p></div>
      <fieldset className="stem-mixer-mode" disabled={busy}>
        <legend className="sr-only">Backing source</legend>
        {([['original', 'Original recording'], ['stems', 'Stem mix']] as const).map(([mode, label]) => <label key={mode}>
          <input type="radio" name="stage-backing-source" value={mode} disabled={mode === "stems" && !tracks.length} checked={mix.mode === mode} onChange={() => onChange({ ...mix, mode })} />{label}
        </label>)}
      </fieldset>
    </div>
    {mix.mode === "stems" ? <>
      <p className="stem-mixer-help">{tracks.length ? `Only these ${tracks.length} supplied stem${tracks.length === 1 ? '' : 's'} play. Vocals and other unsupplied parts are absent. The original mix is off.` : 'Saved stems are unavailable. Choose Original recording or reimport the stem set.'}</p>
      <div className="stem-mixer-tracks">
        {tracks.map(kind => <div key={kind} className="stem-mixer-track" data-muted={mix.channels[kind].muted}>
          <span className="stem-mixer-name">{labels[kind]}</span>
          <label className="stem-mixer-level"><span className="sr-only">{labels[kind]} stem level</span>
            <input type="range" min={0} max={100} value={mix.channels[kind].level} disabled={starting} aria-label={`${labels[kind]} stem level`} aria-valuetext={`${mix.channels[kind].level}%`} onChange={event => changeChannel(kind, { level: Number(event.target.value) })} />
            <output aria-hidden="true">{mix.channels[kind].level}%</output>
          </label>
          <Button type="button" variant="secondary" aria-label={`Mute ${labels[kind]} stem`} aria-pressed={mix.channels[kind].muted} disabled={starting} onClick={() => changeChannel(kind, { muted: !mix.channels[kind].muted })}>Mute</Button>
          <Button type="button" variant="secondary" aria-label={`Solo ${labels[kind]} stem`} aria-pressed={mix.channels[kind].solo} disabled={starting} onClick={() => changeChannel(kind, { solo: !mix.channels[kind].solo })}>Solo</Button>
        </div>)}
      </div>
    </> : <p className="stem-mixer-help">Full original recording. Switch to Stem mix to adjust individual instruments.</p>}
    <div className="stem-mixer-footer">
      <Button type="button" variant="secondary" disabled={busy || !tracks.some(kind => lineup.includes(kind))} onClick={leaveRoom}>Mute my part{lineup.filter(kind => tracks.includes(kind)).length > 1 ? 's' : ''}</Button>
      <Button type="button" variant="ghost" disabled={starting} onClick={() => onChange({ ...defaultStemMix(), mode: mix.mode })}>Reset levels</Button>
      <span>{busy ? "Pause to change backing source. Stem levels, mute and solo stay live." : "Mix settings stay with this song."}</span>
    </div>
  </section>;
}
