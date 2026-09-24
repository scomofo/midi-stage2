# Windows MIDI 2.0 rollout notes

Microsoft is replacing the legacy Windows MIDI stack (WinMM `midiIn*`/`midiOut*`,
single-client per port) with **Windows MIDI Services**: a new user-mode service
with a WinRT API (`Windows.Devices.Midi2`), Universal MIDI Packets (UMP) as the
internal protocol, MIDI 1.0 devices translated to UMP, multi-client access, a new
USB MIDI 2.0 class driver, BLE/network MIDI, and built-in app-to-app loopback
endpoints. WinMM keeps working through a compatibility layer.

> Verification status: the rollout details below are drawn from Microsoft's
> public Windows MIDI Services materials. Live documentation could not be
> re-checked at the time of writing (network lookup unavailable), so treat
> version/availability specifics as approximate and re-verify before quoting
> them to players.

## What changes for midi-stage2

midi-stage2 is a browser app: it only touches MIDI through the Web MIDI API
(`navigator.requestMIDIAccess({ sysex: false })`). It ships no native code, no
WinMM calls, and no WinRT calls, so the OS change reaches it only through what
the browser reports.

- **Device ids can change.** The browser builds each input's opaque `id` from
  OS device data. When the MIDI backend underneath the browser changes, a saved
  `inputId` may stop matching even though the instrument is identical. The app
  now remembers each assigned device's name and manufacturer and re-links the
  assignment automatically when exactly one live input matches
  (`remapMidiRouteInputIds` in `src/lib/midi-stage/midi-routing.ts`, wired in
  `stage-app.tsx`). Ambiguous cases still show the disconnected-device prompt.
- **Fewer "device busy" failures.** The old stack let one app exclusively hold
  a MIDI 1.0 input; the new stack is multi-client. On updated systems, having
  the keyboard open in a DAW should no longer block the browser from
  connecting to it.
- **Loopback endpoints appear as inputs.** The new built-in app-to-app MIDI
  endpoints enumerate like any other input, so they show up in the soundcheck
  device list with no code changes.

## What does not change

- **Note parsing** (`midi-notes.ts`). Web MIDI delivers MIDI 1.0 byte streams;
  browsers do not expose UMP/MIDI 2.0 messages, so parsing is unaffected.
- **MIDI file import** (`midi-file-import.ts`). Pure file parsing; no OS MIDI
  involvement. The import regression already asserts file import never requests
  hardware MIDI access.
- **SysEx.** The app requests `{ sysex: false }`; permission behavior is
  unchanged.
- **Timing.** The app scores on message arrival and never reads MIDI event
  timestamps, so improved OS timestamping changes nothing here.
- **Regression scripts.** They mock `navigator.requestMIDIAccess` and are
  unaffected.
