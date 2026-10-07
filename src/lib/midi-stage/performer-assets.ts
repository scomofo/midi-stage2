import type { Instrument } from "./types";

export const BAND_ATLAS_URL = "/art/band/club-band.png";
export const PERFORMER_CELLS: Record<Instrument, readonly [number, number]> = {
  keys: [0, 0],
  drums: [1, 0],
  guitar: [0, 1],
  bass: [1, 1],
};

export type PerformerAtlas = {
  image: HTMLImageElement | null;
  ready: Promise<void>;
};

// Start once outside the frame loop. A slow or failed image never holds up a set.
// Keep image null until decode completes, so drawImage cannot see partial data.
export function createPerformerAtlas(
  makeImage: () => HTMLImageElement = () => new Image(),
  timeoutMs = 15000,
): PerformerAtlas {
  const atlas: PerformerAtlas = { image: null, ready: Promise.resolve() };
  atlas.ready = new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let image: HTMLImageElement;
    const finish = (usable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (image) {
        image.onload = null;
        image.onerror = null;
        if (usable) atlas.image = image;
      }
      resolve();
    };
    try {
      image = makeImage();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        void (async () => {
          try {
            await image.decode();
            finish(
              image.naturalWidth >= 512 &&
                image.naturalWidth === image.naturalHeight &&
                image.naturalWidth % 2 === 0,
            );
          } catch {
            finish(false);
          }
        })();
      };
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), timeoutMs);
      image.src = BAND_ATLAS_URL;
    } catch {
      finish(false);
    }
  });
  return atlas;
}

let sharedAtlas: PerformerAtlas | undefined;

// No browser globals at module evaluation: the renderer module is also SSR imported.
export function getPerformerAtlas(): PerformerAtlas {
  return (sharedAtlas ??= createPerformerAtlas());
}
