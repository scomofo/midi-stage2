/**
 * Resolve hook: retry extensionless relative imports with a `.ts` extension.
 *
 * The repo's TS sources use extensionless relative imports (bundler-style),
 * which plain Node ESM cannot resolve. This hook makes `node
 * --experimental-strip-types --test` able to import them (e.g. engine.ts).
 * It only fires after normal resolution fails, so existing extensionful
 * imports are unaffected.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExt = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (err?.code === "ERR_MODULE_NOT_FOUND" && relative && !hasExt) {
      return await next(`${specifier}.ts`, context);
    }
    throw err;
  }
}
