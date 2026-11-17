import { DEFAULT_ORIGINS } from "../_shared/origins.js";
import { handleCspReport } from "../_shared/csp-report.js";
import { clientIp, hmac } from "../_shared/forms.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const deps = {
  origins: (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS),
  secret: Deno.env.get("FORMS_HASH_SALT") || "",
  hmac,
  clientIp,
  save: async (key: string, reports: unknown[]) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/csp_report_save`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_reports: reports }),
    });
    if (!r.ok) { await r.body?.cancel(); throw Object.assign(new Error("csp_report_save"), { status: r.status }); }
    return Number(await r.text()) || 0;
  },
  log: (line: string) => console.error(line),
};

Deno.serve((req) => handleCspReport(req, deps));
