import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?jsx?$/.test(specifier)) {
      try { return next(`${specifier}.js`, context); } catch {}
    }
    return next(specifier, context);
  },
});
