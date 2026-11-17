// Off since 4 Nov 2026 while the careers page is reworked. The form's code stays in ../_shared/forms.js.
Deno.serve(() => new Response(JSON.stringify({ error: "Gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
