import type { Difficulty, Player, Song } from "./types";
import type { PracticeSection } from "./practice";

export const PRACTICE_SPEEDS = Array.from({ length: 16 }, (_, index) => (50 + index * 5) / 100);
export const TEMPO_PLANS_KEY = "midi-stage/tempo-plans";
export const isPracticeSpeed = (value: unknown): value is number => typeof value === "number" && PRACTICE_SPEEDS.includes(value);
export type TempoTake = { id: number; speed: number; mode: "scored" | "manual"; accuracy: number | null; strong: boolean; confirmed: boolean };
export type TempoPlan = {
  version: 1; start: number; target: number; current: number; streak: number;
  bestClean: number | null; complete: boolean; takes: number; updated: number; history: TempoTake[];
};
export type TempoPlans = Record<string, TempoPlan>;
export type TempoResult = { accuracy: number; targets: number; miss: number; extra: number; holdBreaks: number };

/** Include chart content, range, difficulty and assigned parts, never tempo.
 * Changing any target invalidates old progress rather than awarding it to a
 * different arrangement. This content fingerprint is not a security boundary.
 */
export function tempoPlanKey(song: Song, section: PracticeSection, players: readonly Player[], difficulty: Difficulty) {
  const text = JSON.stringify([song.id, song.bpm, song.duration, song.guitarMode, song.parts,
    section.start, section.end, difficulty, players.filter(p => p.enabled).map(p => [p.id, p.source]).sort()]);
  let first = 2166136261, second = 5381;
  for (let i = 0; i < text.length; i++) { first = Math.imul(first ^ text.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ text.charCodeAt(i); }
  return `tempo-v1/${(first >>> 0).toString(16)}/${(second >>> 0).toString(16)}`;
}

export function createTempoPlan(start: number, target: number): TempoPlan {
  if (!isPracticeSpeed(start) || !isPracticeSpeed(target) || target < start) throw new Error("Choose a starting tempo at or below the target.");
  return { version: 1, start, target, current: start, streak: 0, bestClean: null, complete: false, takes: 0, updated: Date.now(), history: [] };
}

function append(plan: TempoPlan, take: Omit<TempoTake, "id">): TempoPlan {
  return { ...plan, takes: plan.takes + 1, updated: Date.now(), history: [...plan.history, { id: plan.takes + 1, ...take }].slice(-12) };
}

export function recordTempoTake(plan: TempoPlan, speed: number, result: TempoResult): TempoPlan {
  if (plan.complete || speed !== plan.current) return plan;
  const valid = [result.accuracy, result.targets, result.miss, result.extra, result.holdBreaks].every(Number.isFinite);
  const strong = valid && result.targets > 0 && result.accuracy >= 95 && result.accuracy <= 100
    && result.miss === 0 && result.extra === 0 && result.holdBreaks === 0;
  const next = append(plan, { speed, mode: "scored", accuracy: valid ? Math.min(100, Math.max(0, result.accuracy)) : 0, strong, confirmed: false });
  next.streak = strong ? plan.streak + 1 : 0;
  if (strong) next.bestClean = Math.max(plan.bestClean ?? 0, speed);
  if (next.streak >= 2) {
    if (speed >= plan.target) next.complete = true;
    else { next.current = Math.min(plan.target, Math.round(speed * 100 + 5) / 100); next.streak = 0; }
  }
  return next;
}

export function recordManualTempoTake(plan: TempoPlan, speed: number): TempoPlan {
  if (plan.complete || speed !== plan.current) return plan;
  return { ...append(plan, { speed, mode: "manual", accuracy: null, strong: false, confirmed: false }), streak: 0 };
}

export function canConfirmTempo(plan: TempoPlan) {
  const last = plan.history.at(-1);
  return !plan.complete && last?.mode === "manual" && !last.confirmed && last.speed === plan.current;
}

export function confirmManualTempo(plan: TempoPlan): TempoPlan {
  if (!canConfirmTempo(plan)) return plan;
  const history = plan.history.map((take, index) => index === plan.history.length - 1 ? { ...take, confirmed: true } : take);
  return { ...plan, history, updated: Date.now(), complete: plan.current >= plan.target,
    current: Math.min(plan.target, Math.round(plan.current * 100 + 5) / 100), streak: 0 };
}

function parsePlan(value: unknown): TempoPlan | null {
  if (!value || typeof value !== "object") return null;
  const p = value as TempoPlan;
  if (p.version !== 1 || !isPracticeSpeed(p.start) || !isPracticeSpeed(p.target) || !isPracticeSpeed(p.current)
    || p.start > p.current || p.current > p.target || ![0, 1, 2].includes(p.streak)
    || (p.bestClean !== null && (!isPracticeSpeed(p.bestClean) || p.bestClean < p.start || p.bestClean > p.current))
    || typeof p.complete !== "boolean" || (p.complete && p.current !== p.target)
    || !Number.isSafeInteger(p.takes) || p.takes < 0 || p.takes > 1000000
    || !Number.isFinite(p.updated) || p.updated < 0 || !Array.isArray(p.history) || p.history.length > 12 || p.history.length > p.takes) return null;
  let id = 0;
  for (const take of p.history) {
    if (!take || !Number.isSafeInteger(take.id) || take.id <= id || take.id > p.takes || !isPracticeSpeed(take.speed)
      || take.speed < p.start || take.speed > p.target || typeof take.strong !== "boolean" || typeof take.confirmed !== "boolean"
      || (take.mode === "manual" ? take.accuracy !== null || take.strong
        : take.mode !== "scored" || typeof take.accuracy !== "number" || !Number.isFinite(take.accuracy) || take.accuracy < 0 || take.accuracy > 100 || take.confirmed)) return null;
    id = take.id;
  }
  return { version: 1, start: p.start, target: p.target, current: p.current, streak: p.streak, bestClean: p.bestClean,
    complete: p.complete, takes: p.takes, updated: p.updated, history: p.history.map(t => ({ id: t.id, speed: t.speed, mode: t.mode, accuracy: t.accuracy, strong: t.strong, confirmed: t.confirmed })) };
}

export function loadTempoPlans(storage?: Pick<Storage, "getItem"> | null): TempoPlans {
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    const value = JSON.parse(source?.getItem(TEMPO_PLANS_KEY) ?? "null");
    if (value?.version !== 1 || !value.plans || typeof value.plans !== "object" || Array.isArray(value.plans)) return {};
    return Object.fromEntries(Object.entries(value.plans).slice(0, 40).flatMap(([key, entry]) => {
      const plan = parsePlan(entry);
      return /^tempo-v1\/[a-f0-9]{1,8}\/[a-f0-9]{1,8}$/.test(key) && plan ? [[key, plan]] : [];
    }));
  } catch { return {}; }
}

export function saveTempoPlans(plans: TempoPlans, storage?: Pick<Storage, "setItem"> | null) {
  try {
    const target = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!target) return false;
    const entries = Object.entries(plans).sort((a, b) => b[1].updated - a[1].updated).slice(0, 40);
    target.setItem(TEMPO_PLANS_KEY, JSON.stringify({ version: 1, plans: Object.fromEntries(entries) }));
    return true;
  } catch { return false; }
}
