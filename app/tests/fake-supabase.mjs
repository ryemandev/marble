// Lets a test run the app's live modules under Node: anything in src/ that imports the Supabase client gets
// globalThis.fakeSupabase instead, and import.meta.env exists. Register it, set the fake, then import with await import().
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/(^|\/)supabase$/.test(specifier) && /\/src\//.test(context.parentURL || "")) {
      return { url: "data:text/javascript,export const supabase = globalThis.fakeSupabase;", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const out = next(url, context);
    if (!/\/src\/live\/pwa\.js$/.test(url)) return out;
    return { ...out, source: `import.meta.env = {};\n${out.source}` };
  },
});
