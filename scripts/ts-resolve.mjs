/** Registered via `--import` so `node --test` resolves extensionless TS imports. */
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
