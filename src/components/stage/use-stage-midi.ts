import { useCallback, useEffect, useRef, useState } from "react";
import { MidiNotes, type MidiNoteCallbacks } from "./midi-notes";

type MidiCallbacks = MidiNoteCallbacks & { onDisconnect: () => void };
type InputBinding = { input: MIDIInput; listener: (event: MIDIMessageEvent) => void };
type MidiState = { connected: boolean; connecting: boolean; last: string; error: string | null };

function connectionError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "MIDI access was blocked. Allow MIDI in your browser's site settings and try again. Computer keys still work.";
  }
  return "MIDI could not connect. Check your instrument's USB connection and try again. Computer keys still work.";
}

export function useStageMidi(callbacks: MidiCallbacks) {
  const callbacksRef = useRef(callbacks);
  const mounted = useRef(false);
  const generation = useRef(0);
  const access = useRef<MIDIAccess | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const bindings = useRef(new Map<string, InputBinding>());
  const notes = useRef(new MidiNotes());
  const stateListener = useRef<(() => void) | null>(null);
  const [state, setState] = useState<MidiState>({
    connected: false,
    connecting: false,
    last: "Computer keys ready. MIDI is optional.",
    error: null,
  });

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const detachInput = useCallback((id: string, binding: InputBinding) => {
    binding.input.removeEventListener("midimessage", binding.listener);
    bindings.current.delete(id);
    notes.current.releaseInput(id, (token) => callbacksRef.current.onNoteOff(token));
  }, []);

  const syncInputs = useCallback(() => {
    if (!mounted.current || !access.current) return;
    const live = new Map<string, MIDIInput>();
    access.current.inputs.forEach((input) => {
      if (input.state === "connected") live.set(input.id, input);
    });
    let disconnected = false;
    let changed = false;
    for (const [id, binding] of bindings.current) {
      if (live.get(id) !== binding.input) {
        detachInput(id, binding);
        disconnected = true;
        changed = true;
      }
    }
    for (const [id, input] of live) {
      if (bindings.current.has(id)) continue;
      const listener = (event: MIDIMessageEvent) => {
        if (!mounted.current || input.state !== "connected") return;
        const note = notes.current.message(id, event.data, callbacksRef.current);
        if (note) {
          setState((previous) => ({
            ...previous,
            last: `Note ${note.note} · ch ${note.channel} · vel ${note.velocity}`,
          }));
        }
      };
      bindings.current.set(id, { input, listener });
      // Adding the listener implicitly opens a Web MIDI input.
      input.addEventListener("midimessage", listener);
      changed = true;
    }
    const count = bindings.current.size;
    setState((previous) => ({
      ...previous,
      connected: count > 0,
      last: disconnected
        ? `MIDI input disconnected. ${count ? `${count} input${count === 1 ? " remains" : "s remain"} live.` : "Reconnect your instrument or use computer keys."}`
        : changed || !previous.connected
          ? count
            ? `${count} MIDI input${count === 1 ? "" : "s"} live.`
            : "MIDI is ready. Plug in an instrument; computer keys still work."
          : previous.last,
    }));
    // Releasing the lost device's notes precedes the parent's session pause.
    if (disconnected) callbacksRef.current.onDisconnect();
  }, [detachInput]);

  const connect = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    if (pending.current) return pending.current;
    if (access.current) {
      syncInputs();
      return Promise.resolve();
    }
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      const error =
        "This browser cannot connect MIDI instruments. Try Chrome or Edge. Computer keys still work here.";
      setState((previous) => ({ ...previous, connecting: false, error, last: error }));
      return Promise.resolve();
    }

    const currentGeneration = generation.current;
    const current = () => mounted.current && generation.current === currentGeneration;
    setState((previous) => ({
      ...previous,
      connecting: true,
      error: null,
      last: "Waiting for MIDI permission…",
    }));

    const request = (async () => {
      try {
        // Called synchronously from the Connect button's user gesture.
        const granted = await navigator.requestMIDIAccess({ sysex: false });
        if (!current()) return;
        access.current = granted;
        stateListener.current = syncInputs;
        granted.addEventListener("statechange", syncInputs);
        syncInputs();
      } catch (cause) {
        if (!current()) return;
        const error = connectionError(cause);
        setState((previous) => ({ ...previous, error, last: error }));
      } finally {
        if (current()) setState((previous) => ({ ...previous, connecting: false }));
      }
    })();
    pending.current = request;
    void request.finally(() => {
      if (pending.current === request) pending.current = null;
    });
    return request;
  }, [syncInputs]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pending.current = null;
      if (access.current && stateListener.current) {
        access.current.removeEventListener("statechange", stateListener.current);
      }
      stateListener.current = null;
      access.current = null;
      for (const [id, binding] of bindings.current) detachInput(id, binding);
    };
  }, [detachInput]);

  return { ...state, connect };
}
