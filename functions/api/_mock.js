// In-memory, per-isolate demo store for previews / DB-less local dev. Mirrors the wire shapes of
// the real adapters; self-seeds a row so previews aren't empty. Edits evaporate on reload.
// IMPORTANT: when you add an /api/* route, add a branch here too, or it 404s in previews.
const S = { entries: [] };
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
(function seed() {
  const now = new Date().toISOString();
  S.entries.push({ id: "en-demo-1", title: "Demo row - edits here are not saved", note: "Previews run on demo data.", status: "Open", due: null, sort_order: 10, created_at: now });
})();
export async function handleMock(request, env) {
  const url = new URL(request.url), parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  if (parts[0] === "me") return j({ email: "demo@example.com", isSuperAdmin: false, mock: true });
  if (parts[0] === "entries") {
    if (request.method === "GET") return j({ rows: S.entries });
    return j({ ok: true, demo: true });   // accept writes, don't persist
  }
  return j({ ok: true, demo: true });     // unknown route degrades to ok, never 500
}
