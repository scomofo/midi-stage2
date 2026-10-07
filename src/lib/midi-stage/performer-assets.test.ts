import assert from "node:assert/strict";
import test from "node:test";
import { BAND_ATLAS_URL, createPerformerAtlas, PERFORMER_CELLS } from "./performer-assets";

function fixture(decode: () => Promise<void> = async () => {}) {
  const image = {
    naturalWidth: 1264,
    naturalHeight: 1264,
    decode,
    onload: null,
    onerror: null,
    src: "",
    crossOrigin: "",
  } as unknown as HTMLImageElement;
  const atlas = createPerformerAtlas(() => image);
  return { image, atlas, load: () => image.onload?.call(image, new Event("load")) };
}

test("artwork is unavailable until decode completes, then replaces fallback", async () => {
  let decoded!: () => void;
  const { image, atlas, load } = fixture(
    () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      }),
  );
  assert.equal(image.src, BAND_ATLAS_URL);
  assert.equal(image.crossOrigin, "anonymous");
  assert.equal(atlas.image, null);
  load();
  assert.equal(atlas.image, null);
  decoded();
  await atlas.ready;
  assert.equal(atlas.image, image);
});

test("decode failure and malformed dimensions settle safely with fallback", async () => {
  for (const mode of ["decode", "odd", "rectangle", "empty"] as const) {
    const { image, atlas, load } = fixture(async () => {
      if (mode === "decode") throw Error("invalid PNG");
    });
    if (mode === "odd") Object.assign(image, { naturalWidth: 1263, naturalHeight: 1263 });
    if (mode === "rectangle") Object.assign(image, { naturalHeight: 632 });
    if (mode === "empty") Object.assign(image, { naturalWidth: 0, naturalHeight: 0 });
    load();
    await atlas.ready;
    assert.equal(atlas.image, null, mode);
  }
});

test("network error, unavailable browser API and timeout settle without retries", async () => {
  const { image, atlas } = fixture();
  image.onerror?.call(image, new Event("error"));
  await atlas.ready;
  assert.equal(atlas.image, null);
  assert.equal(image.onload, null);
  await createPerformerAtlas(() => {
    throw Error("no Image during SSR");
  }).ready;
  let attempts = 0;
  const slow = createPerformerAtlas(() => {
    attempts++;
    return image;
  }, 1);
  await slow.ready;
  assert.equal(slow.image, null);
  assert.equal(attempts, 1);
});

test("each instrument maps to its own atlas quadrant", () => {
  assert.deepEqual(PERFORMER_CELLS, { keys: [0, 0], drums: [1, 0], guitar: [0, 1], bass: [1, 1] });
});
