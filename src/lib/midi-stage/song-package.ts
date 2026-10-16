import { validateSharedChart, type SharedChart } from "./chart-format.ts";
import type { AudioImportMode } from "./audio-file-types.ts";

export const SONG_PACKAGE_SCHEMA = "midi-stage-song-package" as const;
export const SONG_PACKAGE_VERSION = 1 as const;

export type SongPackageAsset = {
  role: "master" | "stem" | "artwork";
  name: string;
  mediaType?: string;
  bytes?: number;
  instrument?: Exclude<AudioImportMode, "rhythm">;
  fingerprint?: string;
};

export type SongPackage = {
  schema: typeof SONG_PACKAGE_SCHEMA;
  version: typeof SONG_PACKAGE_VERSION;
  id: string;
  title: string;
  createdAt: string;
  masterAudio?: SongPackageAsset;
  stems: SongPackageAsset[];
  charts: Partial<Record<"chill" | "standard" | "expert", SharedChart>>;
  artwork?: SongPackageAsset;
  provenance: {
    source: "authored" | "audio-analysis" | "mixed";
    generator?: string;
    notes?: string[];
  };
};

function asset(raw: unknown, expectedRole: SongPackageAsset["role"]): SongPackageAsset {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(\`Package \${expectedRole} asset must be an object.\`);
  const value=raw as Record<string,unknown>;
  if(value.role!==expectedRole) throw new Error(\`Package asset role must be \${expectedRole}.\`);
  if(typeof value.name!=="string"||!value.name.trim()) throw new Error("Package asset needs a name.");
  if("bytes" in value && (!Number.isInteger(value.bytes)||Number(value.bytes)<0)) throw new Error("Package asset byte size is invalid.");
  return {...value,name:value.name.trim()} as SongPackageAsset;
}

export function validateSongPackage(raw: unknown): SongPackage {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("Song package must be an object.");
  const value=raw as Record<string,unknown>;
  if(value.schema!==SONG_PACKAGE_SCHEMA||value.version!==SONG_PACKAGE_VERSION) throw new Error("Unsupported song package format.");
  if(typeof value.id!=="string"||!value.id.trim()) throw new Error("Song package needs an id.");
  if(typeof value.title!=="string"||!value.title.trim()) throw new Error("Song package needs a title.");
  if(typeof value.createdAt!=="string"||!Number.isFinite(Date.parse(value.createdAt))) throw new Error("Song package createdAt is invalid.");
  const stems=Array.isArray(value.stems)?value.stems.map(v=>asset(v,"stem")):[];
  const chartsRaw=value.charts;
  if(!chartsRaw||typeof chartsRaw!=="object"||Array.isArray(chartsRaw)) throw new Error("Song package needs charts.");
  const charts:SongPackage["charts"]={};
  for(const level of ["chill","standard","expert"] as const){
    const chart=(chartsRaw as Record<string,unknown>)[level];
    if(chart!==undefined) charts[level]=validateSharedChart(chart);
  }
  if(!Object.keys(charts).length) throw new Error("Song package needs at least one chart.");
  const provenance=value.provenance;
  if(!provenance||typeof provenance!=="object"||Array.isArray(provenance)) throw new Error("Song package needs provenance.");
  const source=(provenance as Record<string,unknown>).source;
  if(!["authored","audio-analysis","mixed"].includes(String(source))) throw new Error("Song package provenance source is invalid.");
  return {
    schema:SONG_PACKAGE_SCHEMA,version:SONG_PACKAGE_VERSION,id:value.id.trim(),title:value.title.trim(),
    createdAt:new Date(value.createdAt).toISOString(),
    ...(value.masterAudio?{masterAudio:asset(value.masterAudio,"master")}:{ }),
    stems,
    charts,
    ...(value.artwork?{artwork:asset(value.artwork,"artwork")}:{ }),
    provenance:{...(provenance as SongPackage["provenance"]),source:source as SongPackage["provenance"]["source"]},
  };
}

export function serializeSongPackage(pkg: SongPackage): string {
  return JSON.stringify(validateSongPackage(pkg), null, 2);
}

export function makeSongPackage(chart: SharedChart, options: {
  difficulties?: SongPackage["charts"];
  masterAudioName?: string;
  stems?: SongPackageAsset[];
  artworkName?: string;
  provenance?: SongPackage["provenance"];
  createdAt?: string;
} = {}): SongPackage {
  return validateSongPackage({
    schema:SONG_PACKAGE_SCHEMA,version:SONG_PACKAGE_VERSION,id:\`package-\${chart.id}\`,title:chart.title,
    createdAt:options.createdAt??new Date().toISOString(),
    ...(options.masterAudioName?{masterAudio:{role:"master",name:options.masterAudioName}}:{}),
    stems:options.stems??[],
    charts:options.difficulties??{expert:chart},
    ...(options.artworkName?{artwork:{role:"artwork",name:options.artworkName}}:{}),
    provenance:options.provenance??{source:chart.origin.startsWith("audio-")?"audio-analysis":"authored",generator:"midi-stage2"},
  });
}
