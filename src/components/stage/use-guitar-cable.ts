import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioEngine } from "@/lib/midi-stage/audio";
import { noteName } from "@/lib/midi-stage/engine";
// Inlined as text at build time so the worklet needs no separate asset URL.
import processorSource from "../../lib/midi-stage/guitar-cable-processor.js?raw";
import {
  CABLE_PROCESSOR_NAME,
  calibrateLatency,
  loadCableCalibration,
  loadCableDeviceId,
  saveCableCalibration,
  saveCableDeviceId,
  type CableCalibrationRecord,
  type CableMessage,
} from "@/lib/midi-stage/guitar-cable";

export type CableDeviceInfo = { deviceId: string; label: string };
export type CableStatus = "idle" | "requesting" | "ready" | "denied" | "error";
export type CableCallbacks = {
  onOnset: (midi: number, velocity: number, audioTime: number) => void;
  onRelease: (audioTime: number) => void;
  onDisconnect: () => void;
};
export type CalibrationPhase =
  | { phase: "idle" }
  | { phase: "running"; taps: number; total: number }
  | { phase: "done"; offsetMs: number; taps: number }
  | { phase: "failed"; reason: string };

export type GuitarCable = {
  status: CableStatus;
  error: string | null;
  devices: CableDeviceInfo[];
  deviceId: string;
  level: number;
  lastNote: string;
  calibration: CableCalibrationRecord | null;
  calibrationState: CalibrationPhase;
  setDeviceId: (deviceId: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  startCalibration: () => void;
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message === "unsupported") {
    return "Guitar input needs a secure (https) page and a browser with audio worklets. Try a recent Chrome or Edge.";
  }
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it in your browser's site settings and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No audio input found. Plug in your interface and try again.";
  }
  return "Guitar input could not start. Check the cable and interface, then try again.";
}

export function useGuitarCable(opts: {
  getAudio: () => AudioEngine | null;
  callbacks: CableCallbacks;
}): GuitarCable {
  const getAudioRef = useRef(opts.getAudio);
  const callbacksRef = useRef(opts.callbacks);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const statusRef = useRef<CableStatus>("idle");
  const calibrationRun = useRef<{ clickTimes: number[]; onsetTimes: number[]; timer: number } | null>(null);

  const [status, setStatus] = useState<CableStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<CableDeviceInfo[]>([]);
  const [deviceId, setDeviceIdState] = useState(() => loadCableDeviceId());
  const [level, setLevel] = useState(0);
  const [lastNote, setLastNote] = useState("");
  const [calibration, setCalibration] = useState<CableCalibrationRecord | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationPhase>({ phase: "idle" });

  useEffect(() => {
    getAudioRef.current = opts.getAudio;
    callbacksRef.current = opts.callbacks;
  }, [opts.getAudio, opts.callbacks]);

  const setDeviceId = useCallback((id: string) => {
    setDeviceIdState(id);
    saveCableDeviceId(id);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        list
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` })),
      );
    } catch {
      /* device labels are best-effort */
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  const teardown = useCallback(() => {
    if (calibrationRun.current) {
      window.clearTimeout(calibrationRun.current.timer);
      calibrationRun.current = null;
      setCalibrationState({ phase: "idle" });
    }
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const disconnect = useCallback(() => {
    teardown();
    statusRef.current = "idle";
    setStatus("idle");
    setError(null);
    setLevel(0);
    setLastNote("");
  }, [teardown]);

  const connect = useCallback(async () => {
    const audio = getAudioRef.current();
    if (!audio) {
      setError("Enable sound first, then connect your guitar.");
      return;
    }
    if (statusRef.current === "requesting" || statusRef.current === "ready") return;
    statusRef.current = "requesting";
    setStatus("requesting");
    setError(null);
    try {
      await audio.init();
      const ctx = audio.ctx!;
      if (!navigator.mediaDevices?.getUserMedia || !ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
        throw new Error("unsupported");
      }
      const constraints = (withDevice: boolean): MediaStreamConstraints => ({
        audio: {
          deviceId: withDevice && deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints(true));
      } catch (e) {
        // Saved device IDs rotate or disappear; fall back to the default input once.
        const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
        if (deviceId && (name === "OverconstrainedError" || name === "NotFoundError")) {
          stream = await navigator.mediaDevices.getUserMedia(constraints(false));
        } else {
          throw e;
        }
      }
      // The processor source is bundled as text; a Blob URL keeps
      // audioWorklet.addModule independent of emitted asset paths.
      const blobUrl = URL.createObjectURL(new Blob([processorSource], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, CABLE_PROCESSOR_NAME);
      node.port.onmessage = (event: MessageEvent<CableMessage>) => {
        const message = event.data;
        if (!message || typeof message !== "object") return;
        if (message.type === "cable-level") {
          setLevel(Math.min(1, message.rms * 4));
        } else if (message.type === "cable-onset") {
          const run = calibrationRun.current;
          if (run) {
            // Calibration strums are measured, never scored.
            run.onsetTimes.push(message.audioTime);
            setCalibrationState({ phase: "running", taps: run.onsetTimes.length, total: run.clickTimes.length });
            setLastNote(`${noteName(message.midi)} · cable`);
            return;
          }
          setLastNote(`${noteName(message.midi)} · cable`);
          callbacksRef.current.onOnset(message.midi, message.velocity, message.audioTime);
        } else if (message.type === "cable-release") {
          if (!calibrationRun.current) callbacksRef.current.onRelease(message.audioTime);
        }
      };
      // Deliberately not connected to the destination: the player hears
      // their own guitar acoustically; the app only listens.
      source.connect(node);
      streamRef.current = stream;
      sourceRef.current = source;
      nodeRef.current = node;
      const track = stream.getAudioTracks()[0];
      const label = track?.label || "Guitar input";
      setCalibration(loadCableCalibration(label));
      track?.addEventListener("ended", () => {
        if (statusRef.current === "ready") {
          disconnect();
          setError("Guitar input disconnected. Reconnect it in Soundcheck.");
          callbacksRef.current.onDisconnect();
        }
      });
      await refreshDevices();
      statusRef.current = "ready";
      setStatus("ready");
    } catch (e) {
      teardown();
      statusRef.current = e && typeof e === "object" && "name" in e
        && (e.name === "NotAllowedError" || e.name === "SecurityError")
        ? "denied"
        : "error";
      setStatus(statusRef.current);
      setError(describeError(e));
    }
  }, [deviceId, disconnect, refreshDevices, teardown]);

  const startCalibration = useCallback(() => {
    const audio = getAudioRef.current();
    const ctx = audio?.ctx;
    if (!ctx || statusRef.current !== "ready" || calibrationRun.current) return;
    const node = nodeRef.current;
    if (!node) return;
    const total = 8;
    const interval = 60 / 90; // 90 BPM
    const t0 = ctx.currentTime + 0.6;
    const clickTimes: number[] = [];
    for (let i = 0; i < total; i++) {
      const at = t0 + i * interval;
      clickTimes.push(at);
      audio!.click(at, i === 0);
    }
    setCalibrationState({ phase: "running", taps: 0, total });
    const run = { clickTimes, onsetTimes: [] as number[], timer: 0 };
    run.timer = window.setTimeout(() => {
      calibrationRun.current = null;
      const result = calibrateLatency(run.clickTimes, run.onsetTimes);
      if (!result) {
        setCalibrationState({ phase: "failed", reason: "Too few strums were heard. Strum once per click and try again." });
        return;
      }
      const track = streamRef.current?.getAudioTracks()[0];
      const label = track?.label || "Guitar input";
      const record: CableCalibrationRecord = {
        deviceLabel: label,
        offsetMs: Math.round(result.offsetMs * 10) / 10,
        taps: result.tapsMs.length,
        measuredAt: new Date().toISOString(),
      };
      saveCableCalibration(record);
      setCalibration(record);
      setCalibrationState({ phase: "done", offsetMs: record.offsetMs, taps: record.taps });
    }, (clickTimes[total - 1]! + 1.4 - ctx.currentTime) * 1000);
    calibrationRun.current = run;
  }, []);

  return {
    status,
    error,
    devices,
    deviceId,
    level,
    lastNote,
    calibration,
    calibrationState,
    setDeviceId,
    connect,
    disconnect,
    startCalibration,
  };
}
