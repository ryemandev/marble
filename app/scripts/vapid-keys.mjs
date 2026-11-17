import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const pairFile = join(app, ".env.vapid");
const envFile = join(app, ".env");

if (existsSync(pairFile) && !process.argv.includes("--force")) {
  console.log("app/.env.vapid already exists: Marble has its keys. (--force makes a new pair; every device then re-subscribes.)");
  process.exit(0);
}

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.of(4), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");

writeFileSync(pairFile, [
  "# Marble's push notification keys (scripts/vapid-keys.mjs). Never commit or share this file.",
  "# Both go into Supabase → Edge Functions → Secrets; the public one is also VITE_VAPID_PUBLIC_KEY in .env.",
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${jwk.d}`,
  "",
].join("\n"), { mode: 0o600 });

const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const line = `VITE_VAPID_PUBLIC_KEY=${publicKey}`;
writeFileSync(envFile, /^VITE_VAPID_PUBLIC_KEY=.*$/m.test(env) ? env.replace(/^VITE_VAPID_PUBLIC_KEY=.*$/m, line) : `${env.replace(/\n?$/, "\n")}${line}\n`);

console.log("Marble's push keys are made.");
console.log(`  public key (in app/.env as VITE_VAPID_PUBLIC_KEY): ${publicKey}`);
console.log("  private key: in app/.env.vapid only (not shown here)");
console.log("\nNext: Supabase → Edge Functions → Secrets → add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY from app/.env.vapid,");
console.log("then rebuild the site so the app carries the public key (npm run build:web).");
