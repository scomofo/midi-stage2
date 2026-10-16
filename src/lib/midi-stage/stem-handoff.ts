import type { AudioImportMode } from "./audio-file-types.ts";

export type StemInstrument = Exclude<AudioImportMode, "rhythm"> | "vocals";

const PATTERNS: Array<[StemInstrument, RegExp]> = [
  ["drums", /(?:^|[._\-\s])(drums?|percussion)(?:[._\-\s]|$)/i],
  ["keys", /(?:^|[._\-\s])(piano|keys?|keyboard)(?:[._\-\s]|$)/i],
  ["guitar", /(?:^|[._\-\s])(guitars?|gtr)(?:[._\-\s]|$)/i],
  ["bass", /(?:^|[._\-\s])(bass)(?:[._\-\s]|$)/i],
  ["vocals", /(?:^|[._\-\s])(vocals?|voice|vox)(?:[._\-\s]|$)/i],
];

export function detectStemInstrument(filename: string): StemInstrument | null {
  for (const [instrument, pattern] of PATTERNS) if (pattern.test(filename)) return instrument;
  return null;
}

export function stemCompatibility(filename: string, expected: Exclude<AudioImportMode, "rhythm">) {
  const detected = detectStemInstrument(filename);
  if (!detected) return { detected: null, compatible: true, warning: null };
  if (detected === expected) return { detected, compatible: true, warning: null };
  return {
    detected,
    compatible: false,
    warning: `This looks like a ${detected} stem, but ${expected} analysis is selected.`,
  };
}

export function stemSetIdentity(files: Array<Pick<File, "name" | "size" | "lastModified">>) {
  return [...files]
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map((file)=>`${file.name}:${file.size}:${file.lastModified}`)
    .join("|");
}
