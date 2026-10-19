import * as tf from "@tensorflow/tfjs";
import { setThreadsCount, setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import wasmUrl from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url";
import simdUrl from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url";
import threadedUrl from "@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url";

/** Each import owns one disposable worker, including its WASM memory. */
export async function preparePitchBackend(baseUrl: string): Promise<void> {
  // One thread works without cross-origin isolation and leaves the UI responsive.
  tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
  setThreadsCount(1);
  const paths = {
    "tfjs-backend-wasm.wasm": new URL(wasmUrl, baseUrl).href,
    "tfjs-backend-wasm-simd.wasm": new URL(simdUrl, baseUrl).href,
    "tfjs-backend-wasm-threaded-simd.wasm": new URL(threadedUrl, baseUrl).href,
  };
  let objectUrl: string | undefined;
  try {
    const name = await tf.env().getAsync("WASM_HAS_SIMD_SUPPORT") ? "tfjs-backend-wasm-simd.wasm" : "tfjs-backend-wasm.wasm";
    // Keep asset fetch/compile failures outside the legacy Emscripten loader.
    // They select CPU before initialization; WASM receives validated local bytes.
    const response = await fetch(paths[name], { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("The local inference runtime could not load.");
    const bytes = await response.arrayBuffer();
    await WebAssembly.compile(bytes);
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/wasm" }));
    setWasmPaths({ ...paths, [name]: objectUrl });
    if (!await tf.setBackend("wasm")) throw new Error("WASM initialization failed.");
    await tf.ready();
  } catch {
    await tf.setBackend("cpu");
    await tf.ready();
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
