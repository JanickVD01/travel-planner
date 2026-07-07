# AI-First Project Initialisation

**A reusable, $0, AI‑first web‑application pattern on Cloudflare — and the runbook to stand a new one up.**

> Drop this single file into a **new, empty project folder**, open a Claude Code session there, and say:
> *"Read `ai-first_project_initialisation.md` and initialize this project."*
> Claude will scaffold the code and walk you, click‑by‑click, through the Cloudflare + GitHub setup.

This blueprint generalizes a production "Command Center" application (a no‑build static dashboard with a
Cloudflare D1 backend, a shared domain core, a remote MCP server, and a hardened GitHub workflow) into a
**stack‑and‑patterns recipe** you can reuse to stand up *any* new web application — a shared list, a
planning board, an inventory, a tracker, an internal tool — and **maintain primarily by talking to Claude
through the app's MCP server**.

Design goals, in priority order:

1. **Stay on the Cloudflare free tier at all costs.** Every choice below has a $0 reason. No payment method
   is ever attached, so the platform *errors instead of billing* — there is no runaway‑bill path.
2. **AI‑first maintenance.** The MCP server is the recommended primary way you enter and edit data
   ("add milk and eggs to the groceries list", "mark the bins chore done"). The browser UI is the
   read/secondary‑edit surface; both share one codebase so they can never disagree.
3. **Safe parallel building.** A hardened GitHub flow (branch → PR → gated preview → deterministic merge)
   lets you run **several Claude sessions at once** on the same repo without ever clobbering the live site.

---

## 0. Reading guide for the AI assistant (read this first)

You (the assistant) are bootstrapping a new app from this document. Operate like this:

- **Start in plan mode.** Read this whole file, then present a short plan and the per‑project values you
  need (see [§11](#11-per-project-values--fill-these-in-first)) before touching anything outward‑facing.
- **Split every step into `[Claude]` (you, in the repo) and `[You]` (the human, clicking in the Cloudflare /
  GitHub dashboards).** Do the `[Claude]` parts; for each `[You]` part give exact, click‑by‑click
  instructions and then **PAUSE** for confirmation.
- **Never put a secret in the chat or commit one.** The only real secret is a Cloudflare API token, and it
  lives **only** in GitHub repo secrets (set by the human in the GitHub UI). Identity values
  (`TEAM_DOMAIN`, `POLICY_AUD`, account id, D1 id) are **not** secrets.
- **Verify current docs before building the moving parts.** The Cloudflare Agents SDK (`McpAgent`), the
  "Secure MCP servers with Cloudflare Access" pattern, Wrangler flags, and D1/Access dashboard layouts
  **change over time**. Before you write the MCP worker or run Wrangler commands, do a quick check of the
  current official Cloudflare docs and the installed package versions; prefer them over anything hard‑coded
  here. Treat the code in this file as a faithful *starting shape*, not gospel API.
- **Pause before anything outward‑facing:** the first `git push`, creating/altering a Cloudflare Access
  policy, deploying a Worker, or applying schema to a remote D1.
- **Confirm, don't assume.** If a per‑project value is missing or ambiguous, ask. Don't invent emails,
  account ids, or app names.

---

## 1. What you're building

Two lightweight Cloudflare deployables that **share one SQLite database (D1)** and **one domain‑logic module**,
fronted by **Cloudflare Access** for sign‑in, shipped through **GitHub + Actions + Wrangler**.

```
                        ┌─────────────────────────────────────────────┐
   authorized user's    │            Cloudflare Access                │   email + one‑time PIN
   browser  ───────────▶│   (Zero Trust, free ≤50 users) email gate   │   (no passwords, no cost)
                        └───────────────┬─────────────────────────────┘
                                        │ injects identity headers (signed)
                  ┌─────────────────────┴───────────────────────┐
                  ▼                                              ▼
        ┌───────────────────────┐                  ┌───────────────────────────┐
        │  Pages project        │                  │  MCP Worker  (OPTIONAL,    │
        │  (static SPA +        │                   │  recommended primary       │
        │   /api/* Functions)   │                  │  interface)                │
        │                       │                  │  • McpAgent on a SQLite‑    │
        │  public/   functions/ │                  │    backed Durable Object    │
        └───────────┬───────────┘                  │  • verifies Access JWT      │
                    │                               └─────────────┬─────────────┘
                    │  import                                     │ import
                    ▼                                             ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                shared/core.js  (framework‑agnostic domain logic)   │
        │   (env, args, actor) → plain data | throw ServiceError             │
        └───────────────────────────────┬───────────────────────────────────┘
                                         ▼
                          ┌──────────────────────────────┐
                          │  Cloudflare D1 (SQLite)       │  binding "DB"
                          │  one DB, bound to BOTH above  │  free: 5 GB, plenty of ops
                          └──────────────────────────────┘
```

**Identity flow (both surfaces):**

- **Browser → Pages:** Cloudflare Access authenticates the user and adds the
  `Cf-Access-Authenticated-User-Email` header (stripped/forged‑proof at the edge). A root middleware
  requires it on every `/api/*` request.
- **Claude → MCP Worker:** an Access application sits in front of the Worker's hostname and injects a
  signed `Cf-Access-Jwt-Assertion`. The Worker **independently verifies** that JWT against the team's
  public keys (JWKS) and uses the email inside it as the audit actor.

**Deployment flow:** code lives on **github.com**; a push to `main` runs **GitHub Actions**, which uses
**Wrangler** to deploy the Pages site and (when relevant) the MCP Worker, and to (re)apply the D1 schema.
Every change travels through a **pull request** with an automatically deployed, gated **preview** that runs
on **demo data** (never the live DB).

> **Why Actions + Wrangler and not Cloudflare's native Git auto‑deploy?** On a personal **github.com**
> account, native Git integration *would* work — but we deliberately use the Actions+Wrangler path because it
> gives us a **validate gate** and **demo‑mode previews**, and it's the same pipeline that deploys the MCP
> Worker. (The original app was *forced* onto this path by a GitHub Enterprise data‑residency limit; you're
> choosing it for the gate + previews.) Consequently the Pages project is created as **Direct Upload**
> (`Git Provider: No`) so Cloudflare doesn't also try to auto‑deploy.

---

## 2. Design principles & invariants

These are the load‑bearing ideas. Keep them; they're what make the pattern cheap, safe, and AI‑friendly.

1. **Shared‑core‑first (zero drift).** All business rules live in `shared/core.js`. Both the browser API and
   the MCP worker import it, so validation/auth/audit rules can never diverge between "what the UI does" and
   "what Claude does."
2. **Framework‑agnostic core.** `core.js` has **no** `Request`/`Response`/Cloudflare coupling. Every function
   is `(env, args, actor) → plain data | throw ServiceError`. HTTP glue stays in `_lib.js`; MCP glue stays in
   the worker.
3. **Fail‑closed security.** A request with no authenticated identity is `401`, before any DB access. Demo
   data is served **only** when *both* `!env.DB` **and** `DEMO_API === "1"` — so a misconfigured production
   fails loudly (500) instead of silently serving fakes.
4. **Append‑only audit.** Every table has a `*_audit` sibling; every create/update/delete/reorder writes an
   audit row with the actor's email and an ISO timestamp. You always know who changed what, when.
5. **Soft deletes where it matters.** Long‑lived registries use `status='archived'` instead of hard delete,
   so history is preserved. (Plain list rows can hard‑delete; their audit row remains.)
6. **JSON‑array columns for small collections.** Tags, owners, dependencies, etc. are stored as a JSON string
   in one column (parsed via a helper) — no join tables needed at this scale.
7. **Lazy, idempotent seeding.** Initial content is seeded **once** from static JSON, guarded by "table empty
   *and* no audit history" so deleted rows never resurrect on refresh.
8. **One generic CRUD engine, many lists.** A single parameterized "flat‑list" engine drives every
   structurally‑similar list; adding a new list is a ~6‑line SPEC + a thin route file, not new logic.
9. **No build step.** `public/` is plain HTML/CSS/vanilla‑JS; `functions/` is bundled by Pages automatically.
   Nothing to compile, nothing to break, nothing to pay for.
10. **MCP as the primary maintenance interface.** Tools are thin wrappers over the same `core.js` functions;
    "natural‑language data entry" *is* the product. The browser is for viewing and occasional edits.

---

## 3. Repo skeleton

Create this layout. Names in `<ANGLE_BRACKETS>` are per‑project values from [§11](#11-per-project-values--fill-these-in-first).
The "OPTIONAL" tree is the MCP module ([§8](#8-the-mcp-module-optional-but-recommended)).

```
<repo-root>/
├─ public/                         # static SPA — served as‑is by Pages (NO build)
│  ├─ index.html                   # app shell (theme‑before‑paint, topbar, side panel, #view)
│  ├─ app.js                       # hash router + fetch helpers + renderers + renderMarkdown
│  ├─ styles.css                   # CSS‑variable design system (dark/light)
│  └─ data/                        # static seed JSON + the in‑app wiki
│     ├─ app.json                  # app metadata (title, accent, lists)
│     ├─ releases.json             # "What's New" feed  (releases[])
│     └─ wiki/                     # self‑documentation (index.json + *.md)
│        └─ index.json
├─ functions/                      # Cloudflare Pages Functions = the /api/* layer
│  ├─ _middleware.js               # require Access identity on every /api/* request
│  └─ api/
│     ├─ _lib.js                   # HTTP glue (json/userEmail/parsePath/fail) + re‑export core
│     ├─ _middleware.js            # demo‑mode switch (fail‑closed)
│     ├─ _mock.js                  # in‑memory demo store for previews / DB‑less local dev
│     ├─ me/[[path]].js            # who am I + my rights (drives UI)
│     └─ entries/[[path]].js       # the example entity (one file per list)
├─ shared/
│  └─ core.js                      # framework‑agnostic domain logic (imported by API + MCP)
├─ schema.sql                      # full D1 schema, idempotent (CREATE IF NOT EXISTS / INSERT OR IGNORE)
├─ migrations/                     # numbered run‑once ALTERs (NNN_<name>.sql)
├─ scripts/
│  ├─ validate-data.mjs            # CI gate: every data JSON parses; wiki manifest is valid
│  └─ pr-safe-push.sh              # the only sanctioned push (ff‑only, never main/force)
├─ .github/workflows/
│  ├─ deploy.yml                   # main → validate → (schema) → wrangler pages deploy
│  ├─ pr-preview.yml               # PR → validate + preview deploy + sticky comment
│  └─ deploy-worker.yml            # main + worker‑mcp/** or shared/** → wrangler deploy   (OPTIONAL)
├─ .claude/
│  └─ settings.json                # permission deny‑list (block git push/reset/rebase/…)
├─ worker-mcp/                     # OPTIONAL — the remote MCP server (own wrangler config)
│  ├─ wrangler.jsonc
│  ├─ package.json
│  ├─ scripts/smoke.mjs
│  └─ src/{index.js, mcp.js, dev.js}
├─ .gitignore                      # node_modules, .wrangler, OS noise
├─ CLAUDE.md                       # repo guide for future Claude sessions (data map + workflow)
└─ README.md
```

### Scoping model (read once)

Every row is scoped by **two free‑text keys**: `space` and `list`. Think of `space` as "which app instance /
tenant" and `list` as "which collection within it" (e.g. `space="home"`, `list="groceries"`). A
single-collection app just hard‑codes `space="home"` and uses `list` as the category. (In the original Command Center these
columns are named `project` and `block` — same idea.)

---

## 4. Minimal code templates

These are faithful, trimmed versions of the production code, generalized to a single example entity
`entries` with editable columns `title`, `note`, `status`, `due`. **They run as‑is.** Adding a second list
(e.g. `chores`) is: one `FLAT_SPECS` entry + one route file + (optional) MCP tools.

> When you actually scaffold, prefer the *current* package APIs over these snippets if they've moved; the
> shapes below are correct against the versions pinned in [§8](#8-the-mcp-module-optional-but-recommended).

### 4.1 `shared/core.js` (the engine)

```js
// Framework‑agnostic domain core. Imported BY BOTH the Pages API (functions/api/_lib.js
// re‑exports it) and the MCP worker (worker-mcp/src/mcp.js). No Request/Response/env coupling:
// every function is (env, args, actor) → plain data | throw ServiceError.

export const STATUSES = ["Open", "Doing", "Blocked", "Done"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Domain error. `status` maps to an HTTP status in the Pages layer; `code` is optional and
// only set where a caller needs to branch (e.g. a conflict).
export class ServiceError extends Error {
  constructor(status, message, code) { super(message); this.name = "ServiceError"; this.status = status; this.code = code; }
}

// Identity helpers + the (optional) members gate. SUPER_ADMIN comes from env so it is never
// hard‑coded; it short‑circuits membership BEFORE any DB read, so you can never lock yourself out.
function normEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }
export function superAdmin(env) { return normEmail(env && env.SUPER_ADMIN_EMAIL); }
export function isSuperAdmin(env, actor) { return normEmail(actor) === superAdmin(env) && !!superAdmin(env); }
export function assertActor(actor) {
  const a = normEmail(actor);
  if (!a) throw new ServiceError(401, "authentication required");
  return a;
}

// ── validators / coercers ──────────────────────────────────────────────────
export function jsonArray(v) {
  let a = v; if (typeof v === "string") { try { a = JSON.parse(v); } catch { a = []; } }
  return Array.isArray(a) ? a.map(String).filter(s => s.length) : [];
}
export function cleanDate(v) { return (v && DATE_RE.test(String(v))) ? String(v) : null; }
export function cleanStatus(v) { return STATUSES.indexOf(String(v)) >= 0 ? String(v) : "Open"; }
export function mintId(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6); }

// ── the generic flat‑list engine: one implementation, many lists ────────────
const FLAT_SPECS = {
  entries: {
    table: "entries", audit: "entries_audit", idCol: "entry_id", prefix: "en",
    cols: [
      { name: "title" },
      { name: "note" },
      { name: "status", clean: cleanStatus },
      { name: "due", clean: cleanDate, nullable: true }
    ]
  }
  // Add another list by adding a SPEC here, e.g.:
  // chores: { table: "chores", audit: "chores_audit", idCol: "chore_id", prefix: "ch",
  //           cols: [{name:"title"},{name:"assignee"},{name:"status",clean:cleanStatus}] }
};

function cleanCol(c, v) {
  if (c.clean) return c.clean(v);
  if (c.nullable) return (v == null || v === "") ? null : String(v);
  return String(v == null ? "" : v);
}
function mapRow(spec, r) { const o = { id: r[spec.idCol], sort_order: r.sort_order }; spec.cols.forEach(c => o[c.name] = r[c.name]); return o; }
function detail(spec, args) { const d = {}; spec.cols.forEach(c => { if (Object.prototype.hasOwnProperty.call(args, c.name)) d[c.name] = args[c.name]; }); return d; }
function auditStmt(env, spec, space, list, id, op, det, actor, at) {
  return env.DB.prepare("INSERT INTO " + spec.audit + " (space,list," + spec.idCol + ",op,detail,actor,at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(space, list, id, op, det == null ? null : JSON.stringify(det), actor, at);
}

async function flatList(env, spec, { space, list }, actor) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM " + spec.table + " WHERE space=? AND list=? ORDER BY sort_order, " + spec.idCol
  ).bind(space, list).all();
  return { rows: (results || []).map(r => mapRow(spec, r)) };
}
async function flatCreate(env, spec, args, actor) {
  const { space, list } = args, now = new Date().toISOString(), id = mintId(spec.prefix);
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM " + spec.table + " WHERE space=? AND list=?").bind(space, list).first();
  const sort = (max && max.m ? max.m : 0) + 10;
  const names = spec.cols.map(c => c.name), vals = spec.cols.map(c => cleanCol(c, args[c.name]));
  const sql = "INSERT INTO " + spec.table + " (space,list," + spec.idCol + "," + names.join(",") +
    ",sort_order,created_by,created_at,updated_by,updated_at) VALUES (" + names.map(() => "?").join(",") + ",?,?,?,?,?,?,?,?)";
  const ins = env.DB.prepare(sql);
  await env.DB.batch([
    ins.bind.apply(ins, [space, list, id].concat(vals).concat([sort, actor, now, actor, now])),
    auditStmt(env, spec, space, list, id, "create", detail(spec, args), actor, now)
  ]);
  return { row: mapRow(spec, { [spec.idCol]: id, sort_order: sort, ...Object.fromEntries(names.map((n, i) => [n, vals[i]])) }) };
}
async function flatPatch(env, spec, args, actor) {
  const { space, list } = args, id = args.id, now = new Date().toISOString(), sets = [], binds = [];
  spec.cols.forEach(c => { if (Object.prototype.hasOwnProperty.call(args, c.name)) { sets.push(c.name + "=?"); binds.push(cleanCol(c, args[c.name])); } });
  if (Number.isFinite(args.sort_order)) { sets.push("sort_order=?"); binds.push(args.sort_order | 0); }
  if (!sets.length) throw new ServiceError(400, "nothing to update");
  sets.push("updated_by=?"); binds.push(actor); sets.push("updated_at=?"); binds.push(now);
  const exists = await env.DB.prepare("SELECT " + spec.idCol + " FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id).first();
  if (!exists) throw new ServiceError(404, "not found");
  const upd = env.DB.prepare("UPDATE " + spec.table + " SET " + sets.join(", ") + " WHERE space=? AND list=? AND " + spec.idCol + "=?");
  await env.DB.batch([
    upd.bind.apply(upd, binds.concat([space, list, id])),
    auditStmt(env, spec, space, list, id, "update", detail(spec, args), actor, now)
  ]);
  return { ok: true, id };
}
async function flatDelete(env, spec, args, actor) {
  const { space, list, id } = args, now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id),
    auditStmt(env, spec, space, list, id, "delete", null, actor, now)
  ]);
  return { ok: true, deleted: id };
}
async function flatSeed(env, spec, args, actor) {
  const { space, list } = args, rows = Array.isArray(args.rows) ? args.rows : [];
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM " + spec.table + " WHERE space=? AND list=?").bind(space, list).first();
  if (cnt && cnt.c) return { seeded: false, reason: "already seeded" };
  const aud = await env.DB.prepare("SELECT COUNT(*) AS c FROM " + spec.audit + " WHERE space=? AND list=?").bind(space, list).first();
  if (aud && aud.c) return { seeded: false, reason: "previously seeded" };  // deleted rows stay deleted
  const now = new Date().toISOString(), names = spec.cols.map(c => c.name), stmts = [];
  rows.forEach((row, i) => {
    const id = mintId(spec.prefix), vals = spec.cols.map(c => cleanCol(c, row[c.name]));
    const sql = "INSERT OR IGNORE INTO " + spec.table + " (space,list," + spec.idCol + "," + names.join(",") +
      ",sort_order,created_by,created_at,updated_by,updated_at) VALUES (" + names.map(() => "?").join(",") + ",?,?,?,?,?,?,?,?)";
    const ins = env.DB.prepare(sql);
    stmts.push(ins.bind.apply(ins, [space, list, id].concat(vals).concat([(i + 1) * 10, actor, now, actor, now])));
  });
  stmts.push(auditStmt(env, spec, space, list, "*", "seed", { count: rows.length }, actor, now));
  await env.DB.batch(stmts);
  return { seeded: true, count: rows.length };
}

// Named wrappers the API + MCP import (one set per list).
export const listEntries   = (env, a, who) => flatList(env, FLAT_SPECS.entries, a, who);
export const createEntry   = (env, a, who) => flatCreate(env, FLAT_SPECS.entries, a, who);
export const patchEntry    = (env, a, who) => flatPatch(env, FLAT_SPECS.entries, a, who);
export const deleteEntry   = (env, a, who) => flatDelete(env, FLAT_SPECS.entries, a, who);
export const seedEntries   = (env, a, who) => flatSeed(env, FLAT_SPECS.entries, a, who);
```

### 4.2 `functions/_middleware.js` (auth gate — fail‑closed)

```js
// Require a Cloudflare Access identity on every /api/* request. Static assets are unaffected.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const email = request.headers.get("Cf-Access-Authenticated-User-Email") || (env && env.DEV_EMAIL) || null;
    if (!email) return new Response(JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  return next();
}
```

### 4.3 `functions/api/_middleware.js` (demo‑mode switch — fail‑closed)

```js
// Serve the in‑memory demo store ONLY when BOTH the D1 binding is absent AND DEMO_API=1.
// Preview env carries DEMO_API=1 and NO DB binding; production carries neither, so a lost
// prod binding fails loudly (500) instead of silently serving fakes.
import { handleMock } from "./_mock.js";
export async function onRequest(context) {
  const { request, env, next } = context;
  if (!env.DB && env.DEMO_API === "1") return handleMock(request, env);
  return next();
}
```

### 4.4 `functions/api/_lib.js` (HTTP glue + re‑export core)

```js
import { ServiceError } from "../../shared/core.js";
export function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
// Identity from Cloudflare Access; falls back to env.DEV_EMAIL for local `wrangler pages dev` only.
export function userEmail(request, env) {
  return request.headers.get("Cf-Access-Authenticated-User-Email") || (env && env.DEV_EMAIL ? env.DEV_EMAIL : null);
}
export function parsePath(params) { return (params && params.path) || []; }   // e.g. ['home','groceries','en-…']
export function fail(e) {
  if (e instanceof ServiceError || (e && typeof e.status === "number")) return json({ error: e.message, code: e.code }, e.status || 500);
  throw e;   // unexpected → let Cloudflare surface a 500
}
export * from "../../shared/core.js";
```

### 4.5 `functions/api/entries/[[path]].js` (a route file — copy per list)

```js
// Thin adapter over shared/core.js. The [[path]] catch‑all gives params.path = segments after /api/entries/.
//   GET    /api/entries/<space>/<list>                -> list rows
//   POST   /api/entries/<space>/<list>  {title,…}     -> add a row
//   POST   /api/entries/<space>/<list>/seed {rows:[]} -> one‑time seed
//   PATCH  /api/entries/<space>/<list>/<id> {…}       -> edit
//   DELETE /api/entries/<space>/<list>/<id>           -> delete
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listEntries, createEntry, patchEntry, deleteEntry, seedEntries } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/entries/<space>/<list>" }, 400);
  try { return json(await listEntries(env, { space: c.space, list: c.list }, c.email)); } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  const r = await body(request); if (r.error) return r.error;
  try {
    if (c.seg === "seed") return json(await seedEntries(env, { space: c.space, list: c.list, rows: r.body.rows }, c.email));
    return json(await createEntry(env, Object.assign({ space: c.space, list: c.list }, r.body), c.email), 201);
  } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/entries/<space>/<list>/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchEntry(env, Object.assign({ space: c.space, list: c.list, id: c.seg }, r.body), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/entries/<space>/<list>/<id>" }, 400);
  try { return json(await deleteEntry(env, { space: c.space, list: c.list, id: c.seg }, c.email)); } catch (e) { return fail(e); }
}
```

### 4.6 `functions/api/me/[[path]].js` (identity → UI rights)

```js
import { json, userEmail } from "../_lib.js";
import { isSuperAdmin } from "../../../shared/core.js";
export async function onRequestGet({ request, env }) {
  const email = userEmail(request, env);
  const mock = !env.DB && env.DEMO_API === "1";
  return json({ email: email || "", isSuperAdmin: isSuperAdmin(env, email), mock });
}
```

### 4.7 `functions/api/_mock.js` (demo store — sketch)

```js
// In‑memory, per‑isolate demo store for previews / DB‑less local dev. Mirrors the wire shapes of
// the real adapters; self‑seeds a couple of rows so previews aren't empty. Edits evaporate on reload.
// IMPORTANT: when you add an /api/* route, add a branch here too, or it 404s in previews.
const S = { entries: [] };
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
(function seed() { const now = new Date().toISOString();
  S.entries.push({ id: "en-demo-1", title: "Demo row — edits here are not saved", note: "Previews run on demo data.", status: "Open", due: null, sort_order: 10, created_at: now }); })();
export async function handleMock(request, env) {
  const url = new URL(request.url), parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  if (parts[0] === "me") return j({ email: "demo@example.com", isSuperAdmin: false, mock: true });
  if (parts[0] === "entries") {
    if (request.method === "GET") return j({ rows: S.entries });
    return j({ ok: true, demo: true });   // accept writes, don't persist
  }
  return j({ ok: true, demo: true });     // unknown route degrades to ok, never 500
}
```

### 4.8 `schema.sql` (one entity → the pattern)

```sql
-- Full D1 schema. Idempotent: re-applying is safe (CREATE IF NOT EXISTS / INSERT OR IGNORE).
-- CI re-applies this to prod whenever it changes on main (see deploy.yml).
--   wrangler d1 execute <D1_DB_NAME> --remote --file=./schema.sql   (production)
--   wrangler d1 execute <D1_DB_NAME> --local  --file=./schema.sql   (local dev)

-- One row per item, scoped by (space, list). Repeat this CREATE + its _audit + index per list.
CREATE TABLE IF NOT EXISTS entries (
  space      TEXT    NOT NULL,
  list       TEXT    NOT NULL,
  entry_id   TEXT    NOT NULL,
  title      TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'Open',
  due        TEXT,                              -- ISO date or NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT,
  updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_entries ON entries (space, list, sort_order);

-- Append-only audit for entries.
CREATE TABLE IF NOT EXISTS entries_audit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  space    TEXT NOT NULL,
  list     TEXT NOT NULL,
  entry_id TEXT,                                -- '*' for list-level ops (seed/reorder)
  op       TEXT NOT NULL,                       -- create|update|delete|seed
  detail   TEXT,                                -- JSON of the change (optional)
  actor    TEXT NOT NULL,
  at       TEXT NOT NULL
);

-- OPTIONAL roles layer (see §10): who may edit, plus an audit. Super-admin comes from env.
CREATE TABLE IF NOT EXISTS role_members (
  role_key TEXT NOT NULL, email TEXT NOT NULL, added_by TEXT, added_at TEXT,
  PRIMARY KEY (role_key, email)
);
CREATE TABLE IF NOT EXISTS role_members_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, role_key TEXT NOT NULL, email TEXT NOT NULL,
  op TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- One-time seed flags, if you need them.
CREATE TABLE IF NOT EXISTS meta ( k TEXT PRIMARY KEY, v TEXT );
```

### 4.9 `migrations/` convention

- **New tables/indexes/seed rows → `schema.sql`** (idempotent; CI re‑applies on change).
- **Changing an existing table (e.g. `ALTER TABLE … ADD COLUMN`) → a numbered run‑once file**
  `migrations/001_<name>.sql`. Apply it manually to prod *before* merging the PR that needs it
  (`wrangler d1 execute <D1_DB_NAME> --remote --file=./migrations/001_<name>.sql`), and update `schema.sql`
  in the same PR so a fresh DB gets the final shape. A re‑run erroring "duplicate column" means "already
  applied" — that's the convention (there is no tracking table). **Additive only**, so old code keeps working.

### 4.10 SPA shell (`public/`)

The UI is intentionally lean: an HTML shell, one vanilla‑JS file, and a CSS‑variable theme. The non‑obvious
pieces to reproduce:

- **Theme‑before‑paint** in `<head>` to avoid a flash:
  ```html
  <script>(function(){try{var t=localStorage.getItem("app-theme");
    if(t!=="light"&&t!=="dark")t=(matchMedia&&matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark";
    document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();</script>
  ```
- **CSS design system** = variables on `:root` / `[data-theme="light"]` (`--bg`, `--panel`, `--border`,
  `--text`, `--muted`, `--accent`, and RAG colors `--green/-bg`, `--amber/-bg`, `--red/-bg`). Style with
  semantic classes (`.panel`, `.cards`, `.chip`), no utility framework, no build.
- **Hash router** (`#/`, `#/<space>/<list>`): split `location.hash`, render the matching view, listen on
  `hashchange`.
- **Fetch helpers**: `fetchJSON(path)` (cached, for static `data/*.json`) and live `fetch("api/…")` for
  mutations; an `esc()` HTML‑escaper for all interpolated text.
- **`loadMe()`** on boot hits `api/me` and stores `{email, isSuperAdmin, mock}`; the `mock` flag shows a
  "demo data — edits not saved" banner on previews.
- **`renderMarkdown(src)`** — a ~60‑line inline renderer (headings, lists, bold/italic, inline+fenced code,
  links, blockquotes, rules) that **escapes raw HTML**. It powers the in‑app wiki ([§9](#9-self-documenting-wiki))
  with no external library. (Copy it from the source repo; it's self‑contained and XSS‑safe.)

> Keep the shell generic. Per‑app content (titles, which lists exist, accent color) lives in
> `public/data/app.json`, not in code.

---

## 5. Free‑tier guardrails — the whole point

**Hard rule: never attach a payment method to the Cloudflare account.** On the free plan, hitting a limit
returns an error; it does **not** auto‑upgrade or bill. That single choice removes any runaway‑bill path.

| Resource | Free allowance | How this app stays under it |
|---|---|---|
| **Workers / Pages Functions** | 100,000 requests/day | Expected traffic → far under. MCP Worker also rate‑limited per user. |
| **D1 (SQLite)** | 5 GB storage; generous daily rows read/written | Datasets at this scale are kilobytes–megabytes. |
| **Durable Objects** | **SQLite‑backed** DOs are free on the Workers Free plan | The MCP session uses a SQLite‑backed DO via `new_sqlite_classes` (NOT `new_classes`, which is the paid kind). |
| **Cloudflare Access (Zero Trust)** | Free for up to **50 users** | An allow‑list of authorized users sits well within this. |
| **KV** | Not used | The MCP auth model needs no KV (no OAuth provider). |
| **Pages builds/deploys** | Plenty for any normal release cadence | No build step; deploys are quick uploads. |

Additional guardrails baked into the pattern:

- **In‑Worker rate limit** on the MCP route, keyed by user email (a free `ratelimits` binding — WAF rate‑limit
  *rules* need a zone and aren't available on `*.workers.dev`, so we use the in‑Worker limiter instead).
- **Demo previews never touch D1** (no `DB` binding on the Preview env), so preview traffic can't run up real
  usage or mutate data.
- `[You]` **Set a usage/billing alert** in the Cloudflare dashboard anyway (Manage Account → Notifications) as
  a belt‑and‑braces tripwire.

---

## 6. Setup runbook

Work top to bottom. `[Claude]` = assistant does it in the repo; `[You]` = human clicks in a dashboard. **PAUSE**
markers are where Claude stops and waits.

### Step 0 — Prerequisites `[You]`
- A **github.com** account.
- A **Cloudflare account with NO payment method** attached.
- Locally: **Node 22+** (Wrangler v4 needs ≥22), **git**, and the **GitHub CLI** (`gh`) signed in
  (`gh auth login`). Wrangler is invoked via `npx --yes wrangler@4` (no global install needed).

### Step 1 — Scaffold the repo `[Claude]`
- Create the [§3](#3-repo-skeleton) layout with the [§4](#4-minimal-code-templates) templates, a `.gitignore`
  (`node_modules`, `.wrangler`, OS noise), a `CLAUDE.md` (data map + the [§7](#7-github-governance--safe-parallel-sessions)
  workflow), a `README.md`, the `.claude/settings.json` deny‑list ([§7](#7-github-governance--safe-parallel-sessions)),
  `scripts/validate-data.mjs` and `scripts/pr-safe-push.sh`, and the three workflow files
  ([§7](#7-github-governance--safe-parallel-sessions)). Run `node scripts/validate-data.mjs` locally — it must pass.
- **PAUSE**: show the tree and the per‑project values you'll need before any push.

### Step 2 — Authenticate Wrangler `[You]`
```bash
npx --yes wrangler@4 login
```
One browser approval; the token is cached on your machine. (This is for *local* deploys/D1; CI uses a repo
secret set in Step 7.)

### Step 3 — Create the D1 database `[You]` + `[Claude]`
`[You]` run (or approve Claude running):
```bash
npx --yes wrangler@4 d1 create <D1_DB_NAME>
```
Copy the printed **`database_id`** into [§11](#11-per-project-values--fill-these-in-first). `[Claude]` writes
it into `worker-mcp/wrangler.jsonc` (and anywhere else needed).

### Step 4 — Apply the schema to D1 `[You]`
```bash
npx --yes wrangler@4 d1 execute <D1_DB_NAME> --remote --file=./schema.sql
```
(`--local` instead of `--remote` seeds a local DB for dev.) **PAUSE** until it reports success.

### Step 5 — Create the Pages project + bindings `[You]`
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Direct Upload** (NOT "Connect to Git").
   Name it `<PAGES_PROJECT>`. (You can do the first upload now via
   `npx --yes wrangler@4 pages deploy public --project-name=<PAGES_PROJECT> --branch=main`, or let CI do it in
   Step 8.)
2. **Settings → Functions → D1 database bindings → Add**: Variable name **`DB`** (exactly) → database
   `<D1_DB_NAME>` → Save. (Newer dashboards: **Settings → Bindings → Add → D1**.)
3. **Settings → Variables and Secrets → Production**: add **`SUPER_ADMIN_EMAIL`** = `<SUPER_ADMIN_EMAIL>`.
4. **Settings → Variables and Secrets → Preview**: add **`DEMO_API`** = `1` and **do NOT** add a `DB` binding
   to Preview (previews must run on demo data). Optionally add `SUPER_ADMIN_EMAIL` here too.

> **Why Direct Upload:** we deploy via Wrangler/Actions; a Git connection would make Cloudflare *also*
> auto‑deploy, causing double deploys. Keep `Git Provider: No`.

### Step 6 — Cloudflare Access (the email gate) `[You]`
1. Dashboard → **Zero Trust** → choose the **Free** plan if prompted (no card; covers ≤50 users).
2. **Access → Applications → Add an application → Self‑hosted.**
   - Name: `<APP_NAME>`; **Application domain** = your `<PAGES_PROJECT>.pages.dev` hostname.
     (`pages.dev` may not be in the domain dropdown → use **"Switch to custom input"** and type it.)
3. **Add a policy**: name `Allowed people`, action **Allow**, Include → **Emails** → add each address in
   `<ALLOWLIST_EMAILS>` (you + any other authorized users). **Attach the policy to the app AND Save** — it only persists when the
   destination hostname, the attached policy, and Save all happen.
4. Login method: **One‑time PIN** (default; no config).
5. Capture two non‑secret values for later:
   - **`TEAM_DOMAIN`** = your Zero Trust team URL, e.g. `https://<your-team>.cloudflareaccess.com`
     (Zero Trust → Settings → Custom Pages / team domain).
   - **`POLICY_AUD`** (the Pages app's **Application Audience (AUD) tag**) — Access → Applications →
     `<APP_NAME>` → **Overview/Settings → Application Audience (AUD)**.
6. **Verify the gate**: open `<PAGES_PROJECT>.pages.dev` in an incognito window → it should ask for an email →
   an allowed email gets a PIN → the site loads; a non‑allowed email is denied. **PAUSE** to confirm.

### Step 7 — GitHub repo + secrets + branch protection `[You]` + `[Claude]`
1. `[Claude]` (or you): create the github.com repo and push `main`:
   ```bash
   gh repo create <GH_OWNER>/<GH_REPO> --private --source=. --remote=origin --push
   ```
   **PAUSE** for your OK before this first push (it's outward‑facing).
2. `[You]` **create a Cloudflare API token** (dash.cloudflare.com → My Profile → API Tokens → Create) with:
   - **Account → Cloudflare Pages → Edit**
   - **Account → D1 → Edit**
   - **Account → Workers Scripts → Edit** (for the MCP worker; harmless if you skip MCP)
3. `[You]` add **repo secrets** (GitHub → repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` = the token above
   - `CLOUDFLARE_ACCOUNT_ID` = `<CF_ACCOUNT_ID>` (dashboard → account → Account ID)
4. `[You]` **branch protection** (Settings → Rules → Rulesets → New ruleset `protect-main`, target `main`):
   - Require a pull request before merging
   - Require status check: **`validate`**
   - **Block force pushes**
   - Allow **merge commits only** (Settings → General → disable squash & rebase)
   - Enable **Automatically delete head branches**
   - Bypass: repo admin only (you), for emergencies.

### Step 8 — Wire CI `[Claude]`
- Commit the three workflows ([§7](#7-github-governance--safe-parallel-sessions)) on a branch, open a PR, let
  `pr-preview.yml` post the preview link, then (you) merge. On merge, `deploy.yml` deploys production. **PAUSE**
  to confirm the `main` run is green and the live site loads behind Access.

### Step 9 — (Recommended) the MCP module `[Claude]` + `[You]`
Follow [§8](#8-the-mcp-module-optional-but-recommended) end‑to‑end: scaffold `worker-mcp/`, deploy it, put an
Access app in front of its hostname, set its vars, connect Claude, smoke‑test. Skip only if this app truly has
no use for natural‑language operation.

### Step 10 — End‑to‑end verification `[You]` + `[Claude]`
Run the [§12](#12-end-to-end-verification-checklist) checklist.

---

## 7. GitHub governance & safe parallel sessions

This is **full governance** — chosen precisely because it makes **running several Claude sessions at once
safe**. Each session works on its own branch and opens its own PR; nothing reaches the live site except a
reviewed, validated merge. Two sessions can't stomp each other, and a bad change can't hit `main` directly.

**Branch naming (one task = one branch = one PR):**
- `content/<short-name>` — anything under `public/data/**` (JSON, wiki, release notes) or docs.
- `code/<short-name>` — `app.js`/`index.html`/`styles.css`, `functions/**`, `worker-mcp/**`, `shared/**`,
  `schema.sql`, `migrations/**`, `.github/**`. Mixed change → `code/`.

**PR description = four lines** (so reviewers/automation can reason about it):
`what/why` · `What's New? y/n` · `migration none/NNN` · `worker redeploy? y/n`.

**The gate:** `scripts/validate-data.mjs` is the required `validate` check — it parses every
`public/data/**/*.json` and checks the wiki manifest. A red `validate` blocks merge.

**Previews are safe:** every PR gets a Cloudflare preview running in **demo mode** (no DB) with a sticky
comment linking it. Edits there never touch live data.

**Merges are merge commits only** (squash/rebase disabled) so release‑note commit links stay valid.

**Conflict recipe (keep both sides):** `git fetch origin` → `git switch <branch>` → `git merge origin/main`;
on conflicts in append‑style files (`releases.json`, `wiki/index.json`) **keep both entries**; for content you
didn't intend to change, prefer `main`. Then `node scripts/validate-data.mjs`, commit the merge, push.

**Hard guardrails (defense in depth):**
- `scripts/pr-safe-push.sh` is the **only** sanctioned push — fast‑forward‑only, refuses `main`, refuses
  flag‑like/refspec branch names, never `--force`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  BRANCH="${1:-}"
  [ -z "$BRANCH" ] && { echo "a branch name is required" >&2; exit 2; }
  case "$BRANCH" in
    -*)        echo "refusing flag-like branch: $BRANCH" >&2; exit 2 ;;
    main|HEAD) echo "refusing to push '$BRANCH' — main is off-limits" >&2; exit 2 ;;
    *:*|*' '*) echo "refusing refspec/space in branch: $BRANCH" >&2; exit 2 ;;
  esac
  exec git push origin "refs/heads/${BRANCH}:refs/heads/${BRANCH}"
  ```
- `.claude/settings.json` denies the dangerous verbs outright (prefix‑matched), so a stray force flag can't slip through:
  ```json
  {
    "$schema": "https://json.schemastore.org/claude-code-settings.json",
    "permissions": { "deny": [
      "Bash(git push:*)", "Bash(git reset:*)", "Bash(git rebase:*)",
      "Bash(git filter-branch:*)", "Bash(git filter-repo:*)", "Bash(git update-ref:*)"
    ] }
  }
  ```
- **Server‑side `protect-main` ruleset** (Step 7.4) is the real backstop: even if a client guard is bypassed,
  GitHub rejects a direct or forced push to `main`.

**The three workflows** (Node 22; secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`):

- **`deploy.yml`** — on push to `main`: job `validate` (`node scripts/validate-data.mjs`); then `deploy`
  (needs validate) which, *only if `schema.sql` changed* (diff `HEAD^…HEAD`) or on manual dispatch, runs
  `wrangler d1 execute <D1_DB_NAME> --remote --file=./schema.sql`, then always
  `wrangler pages deploy public --project-name=<PAGES_PROJECT> --branch=main`. Use `fetch-depth: 2` so the
  schema diff works.
- **`pr-preview.yml`** — on PR to `main`: `validate` (on the merge ref, to catch conflicts), then `preview`
  (checks out the PR **head** sha) which runs `wrangler pages deploy public --project-name=<PAGES_PROJECT>
  --branch="$HEAD_REF" --commit-hash="$HEAD_SHA"`, reads the deployed URL from Wrangler's ND‑JSON output, and
  posts/updates a **sticky comment** (find‑or‑update via a hidden marker) with the preview link + a "demo
  mode — edits not saved" note. `permissions: pull-requests: write`.
- **`deploy-worker.yml`** (OPTIONAL) — on push to `main` touching `worker-mcp/**` or `shared/**`:
  `npm ci` in `worker-mcp/` then `npx wrangler deploy`. (`wrangler deploy` auto‑applies the Durable Object
  migration block; never rename/delete a DO class without a proper `renamed_classes`/`deleted_classes` entry.)

> Generate the exact YAML from the source repo's `.github/workflows/*.yml` (they're already generalized — just
> substitute `<PAGES_PROJECT>` and `<D1_DB_NAME>`). The pinned Node 22 and `npx --yes wrangler@4` invocations matter.

---

## 8. The MCP module (optional, but recommended)

> **This is your primary maintenance interface.** Once it's live, you operate the app by talking to Claude
> ("add bread and bananas to home/groceries", "mark chore ch‑… done", "what's overdue?"). The browser UI
> becomes the read/secondary‑edit surface. It's a separate Worker so a project *can* omit it, but the
> recommended default is to include it.

**Auth model (no OAuth provider, no KV, no long‑lived secret):** a Cloudflare Access application sits in
front of the Worker's hostname (reusing the same allow‑list). Access injects a signed
`Cf-Access-Jwt-Assertion`; the Worker verifies it offline against the team JWKS (`issuer` = `TEAM_DOMAIN`,
`audience` = `POLICY_AUD`) using `jose`, and uses the email inside as the audit actor. The only config values
are the **non‑secret** `TEAM_DOMAIN` and `POLICY_AUD`.

> ### ⚠️ How this works on a bare `*.workers.dev` host — READ THIS BEFORE THE DASHBOARD (it cost us the most)
>
> You **cannot** put a classic network‑layer "Self‑hosted" Access app in front of a raw `*.workers.dev`
> hostname — that model needs a **zone** (a custom domain), which a free workers.dev URL doesn't have. The
> mechanism that *does* work at $0, with no custom domain and **no worker code change**, is Cloudflare
> Access **Managed OAuth for MCP**: the worker returns **`401`** (not a network `302` redirect), and
> Cloudflare's edge — which owns the `workers.dev` zone — serves the OAuth discovery metadata and drives the
> browser email+PIN login. The worker's only job stays exactly as in §8.3: validate the injected
> `Cf-Access-Jwt-Assertion`. So the *only* config change to go live is setting this app's `POLICY_AUD`.
>
> **Two dashboard traps that look right but aren't:**
> 1. **"Self‑hosted application" → domain = the worker host.** Fails on workers.dev (no zone). ❌
> 2. **"MCP Server *Portal*"** (a screen offering an upstream *"Authentication type"* + a *"Cloudflare‑hosted
>    OAuth callback"* URL). This is a **different feature** that also needs a custom domain. ❌
>
>    ✅ The right feature is **Zero Trust → Access controls → AI controls → MCP servers** (see §8.6 step 2).
>
> **How to *know* it's set up correctly (live probe, no auth):**
> `GET https://<worker>.workers.dev/mcp` → **`401`** with a `WWW-Authenticate: Bearer … resource_metadata=…`
> header (and **no** `302`); and `GET …/.well-known/oauth-protected-resource` +
> `…/.well-known/oauth-authorization-server` both return **`200`**. If you get a `302` to
> `*.cloudflareaccess.com`, you built the network‑proxy variant — back out and use the MCP‑servers tab.

**Session state** lives in a **SQLite‑backed Durable Object** (free), declared via `new_sqlite_classes`. The
app data lives in the **same D1** as the Pages site (binding `DB`).

### 8.1 `worker-mcp/package.json`
```json
{
  "name": "<WORKER_NAME>",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "wrangler dev src/dev.js", "deploy": "wrangler deploy", "inspect": "npx @modelcontextprotocol/inspector" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "agents": "^0.17.0",
    "jose": "^6.2.3",
    "zod": "^4.4.3"
  },
  "devDependencies": { "wrangler": "^4.105.0" }
}
```
> Before installing, **check the current versions** of `agents` (Cloudflare Agents SDK) and
> `@modelcontextprotocol/sdk` and the `McpAgent` API — they move. Pin what you actually install.
> (Versions above are what actually shipped & verified in mid‑2026; `agents` in particular jumped
> from `0.14` → `0.17` between the source app and the next build.) On `@modelcontextprotocol/sdk@1.29`,
> register tools with **`server.registerTool(name, {description, inputSchema}, handler)`** — the older
> positional `server.tool(name, desc, schema, handler)` is **deprecated** (see §8.4).

### 8.2 `worker-mcp/wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<WORKER_NAME>",
  "main": "src/index.js",
  "compatibility_date": "<TODAY_YYYY_MM_DD>",
  "compatibility_flags": ["nodejs_compat"],         // MCP SDK + jose use Node builtins

  // MCP session state = SQLite-backed Durable Object → FREE. class_name must match the export.
  "durable_objects": { "bindings": [ { "name": "MCP_OBJECT", "class_name": "AppMCP" } ] },
  "migrations": [ { "tag": "v1", "new_sqlite_classes": ["AppMCP"] } ],   // NOT new_classes (paid)

  // The SAME D1 the Pages site uses. Paste the id from `wrangler d1 list`.
  "d1_databases": [ { "binding": "DB", "database_name": "<D1_DB_NAME>", "database_id": "<D1_DB_ID>" } ],

  // Free in-Worker rate limit on /mcp, keyed by user email (period must be 10 or 60).
  "ratelimits": [ { "name": "MCP_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 120, "period": 60 } } ],

  // Non-secret Cloudflare Access identifiers (this Worker's OWN Access app — its own AUD).
  "vars": { "TEAM_DOMAIN": "<TEAM_DOMAIN>", "POLICY_AUD": "<POLICY_AUD_MCP>" }
}
```
> **Local‑dev caveat:** a *remote* D1 binding can't be combined with a Durable Object in `wrangler dev`. For
> local dev, use a **local** D1 (seed it with `schema.sql --local`); test against the real DB only after deploy
> (or via `wrangler dev src/dev.js --remote`, which the auth‑less dev entry allows).

### 8.3 `worker-mcp/src/index.js` (production entry — verifies the Access JWT)
```js
import { AppMCP } from "./mcp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
export { AppMCP };
const mcpHandler = AppMCP.serve("/mcp");

let _jwks = null;
function getJwks(teamDomain) {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(teamDomain.replace(/\/+$/, "") + "/cdn-cgi/access/certs"));
  return _jwks;
}
function unauthorized(msg, status) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
export default {
  async fetch(request, env, ctx) {
    if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return unauthorized("MCP not configured: TEAM_DOMAIN/POLICY_AUD missing.", 503);
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return unauthorized("Cloudflare Access authentication required.", 401);
    let email;
    try {
      const { payload } = await jwtVerify(token, getJwks(env.TEAM_DOMAIN), {
        issuer: env.TEAM_DOMAIN.replace(/\/+$/, ""), audience: env.POLICY_AUD
      });
      email = payload.email || payload.common_name || payload.sub || "access-user";
    } catch { return unauthorized("Invalid or expired Cloudflare Access token.", 403); }
    if (env.MCP_RATE_LIMITER) {
      const { success } = await env.MCP_RATE_LIMITER.limit({ key: String(email) });
      if (!success) return unauthorized("Rate limit exceeded, slow down.", 429);
    }
    ctx.props = Object.assign({}, ctx.props, { email });   // becomes the audit actor
    return mcpHandler.fetch(request, env, ctx);
  }
};
```

### 8.4 `worker-mcp/src/mcp.js` (tools reuse `shared/core.js`)
```js
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceError, listEntries, createEntry, patchEntry, deleteEntry } from "../../shared/core.js";

const SPACE = z.string().default("home");
const LIST  = z.string().describe("Which list, e.g. 'groceries' or 'chores'");
const STATUS = z.enum(["Open", "Doing", "Blocked", "Done"]);

export class AppMCP extends McpAgent {
  server = new McpServer({ name: "<APP_SLUG>", version: "1.0.0" });
  get actor() { return (this.props && this.props.email) || (this.env && this.env.DEV_EMAIL) || "mcp-unknown"; }
  async run(fn) {
    try { return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] }; }
    catch (e) {
      const code = (e instanceof ServiceError && e.code) ? e.code : (e instanceof ServiceError) ? "validation" : "internal";
      return { content: [{ type: "text", text: `Error [${code}]: ${e.message}` }], isError: true };
    }
  }
  async init() {
    const env = this.env, self = this;
    // registerTool(name, { description, inputSchema }, handler) — the current @modelcontextprotocol/sdk
    // API (v1.29+). The older positional server.tool(name, desc, schema, handler) is DEPRECATED.
    this.server.registerTool("list_entries",
      { description: "List rows in a list.", inputSchema: { space: SPACE, list: LIST } },
      (a) => self.run(() => listEntries(env, a, self.actor)));
    this.server.registerTool("add_entry",
      { description: "Add a row to a list.", inputSchema: { space: SPACE, list: LIST, title: z.string(), note: z.string().optional(), status: STATUS.optional(), due: z.string().optional().describe("ISO YYYY-MM-DD") } },
      (a) => self.run(() => createEntry(env, a, self.actor)));
    this.server.registerTool("edit_entry",
      { description: "Edit a row by id.", inputSchema: { space: SPACE, list: LIST, id: z.string(), title: z.string().optional(), note: z.string().optional(), status: STATUS.optional(), due: z.string().optional() } },
      (a) => self.run(() => patchEntry(env, a, self.actor)));
    this.server.registerTool("delete_entry",
      { description: "Delete a row by id.", inputSchema: { space: SPACE, list: LIST, id: z.string() } },
      (a) => self.run(() => deleteEntry(env, a, self.actor)));
  }
}
```

### 8.5 `worker-mcp/src/dev.js` (LOCAL‑ONLY, no auth — never deploy)
```js
// npx wrangler dev src/dev.js --remote --var DEV_EMAIL:you@example.com   → http://localhost:8787/mcp
import { AppMCP } from "./mcp.js";
export { AppMCP };
export default AppMCP.serve("/mcp");
```

### 8.6 Deploy + protect + connect `[You]`
1. `[Claude]` `cd worker-mcp && npm install`. `[You]` deploy: `npx --yes wrangler@4 deploy` (or let
   `deploy-worker.yml` do it on merge). Note the Worker URL: `https://<WORKER_NAME>.<your-subdomain>.workers.dev`.
2. `[You]` **Access app for the Worker — via Managed OAuth for MCP** (see the ⚠️ callout above; do **not** use
   the plain "Self‑hosted" or "MCP Portal" flows on a workers.dev host):
   - Zero Trust → **Access controls → AI controls → MCP servers** tab → **Add an MCP server**.
     - **Name:** `<APP_NAME> MCP`
     - **HTTP URL:** `https://<WORKER_NAME>.<your-subdomain>.workers.dev/mcp`
     - **Access policy:** Include → **Emails** → your `<ALLOWLIST_EMAILS>`; login method **One‑time PIN**.
     - **Save and connect server** (this auto‑creates the backing Access application).
   - Then Zero Trust → **Access controls → Applications** → open the new app → **Advanced settings** → confirm
     **Managed OAuth is ON** → Save → copy its **Application Audience (AUD)** tag.
   - Put that AUD in `worker-mcp/wrangler.jsonc` `vars` as **`POLICY_AUD`** (`TEAM_DOMAIN` is the same as the
     Pages app), then **redeploy** (`npx --yes wrangler@4 deploy`, or let `deploy-worker.yml` do it on merge)
     so the var takes effect. **Verify with the live probe** from the ⚠️ callout (401 + `WWW-Authenticate`;
     `/.well-known/oauth-*` = 200) before moving on.
3. `[You]` **Connect Claude — use the Claude Code CLI** (claude.ai/Desktop connectors are commonly
   org‑managed and blocked; the CLI is the reliable path):
   ```bash
   claude mcp add --transport http --scope user <APP_SLUG> https://<WORKER_NAME>.<your-subdomain>.workers.dev/mcp
   ```
   (`--scope user` makes it available in every session.) Then inside a Claude Code session: **`/mcp` →
   `<APP_SLUG>` → Authenticate** → a browser opens the Access sign‑in → your email + one‑time PIN. No
   `--header` flag and no secret in `.mcp.json` — auth is the interactive OAuth/PKCE dance; Claude Code stores
   the token in its own credential store. Confirm with `claude mcp list` (shows **connected**) and `/mcp`
   (lists the 4 tools).
4. `[You]`/`[Claude]` **smoke test — against the live D1, through the connected MCP tools** (not `smoke.mjs`):
   ask Claude to `add_entry` a row to e.g. `home/groceries`, `list_entries` to confirm it, then `delete_entry`
   it. Prove it persisted with the real identity as actor:
   `npx --yes wrangler@4 d1 execute <D1_DB_NAME> --remote --command "SELECT * FROM entries_audit ORDER BY at DESC LIMIT 5"`
   — the `actor` column shows your Access email.
   > **Caveat:** `worker-mcp/scripts/smoke.mjs` targets the **local, no‑auth dev server** (`npm run dev` →
   > `src/dev.js`), **not** the OAuth‑gated prod endpoint — so it can't exercise the live auth path. Use the
   > connected MCP tools + the audit query above for the real end‑to‑end check.

---

## 9. Self-documenting wiki

Reproduce the in‑app wiki so each app explains itself (how to sign in, how to use the MCP, how it's built). It
costs nothing and is invaluable when you onboard a new user or return to an app months later.

- `public/data/wiki/index.json` = a manifest: `{ "topics": [ { "slug", "title", "icon", "section", "file",
  "summary", "lastUpdated" } ] }`. **Array order = sidebar order**; `section` groups topics under sub‑headings.
- One Markdown file per topic under `public/data/wiki/`. Rendered by the inline `renderMarkdown` in `app.js`
  (no external library; raw HTML is escaped). Authoring tips: one list item per line; don't split a numbered
  list with a fenced code block.
- `scripts/validate-data.mjs` already enforces that every topic has `slug/title/file` and that the referenced
  `.md` exists — so a broken wiki link fails CI.

Suggested starter topics: *Sign in*, *Use it from Claude (MCP)*, *How it's built*, *How changes ship*.

---

## 10. Optional pattern appendix

Opt into these as an app needs them. Each mirrors a proven shape in the source repo — point Claude at the named
function/file to copy it faithfully.

| Want… | Pattern | Where to mirror |
|---|---|---|
| **Another list** (chores, inventory, etc.) | Add a `FLAT_SPECS` entry + a `functions/api/<x>/[[path]].js` + MCP tools | `shared/core.js` `FLAT_SPECS`; `functions/api/blockers/[[path]].js` |
| **Edit rights / who‑can‑change** | A `role_members` table + `isMember`/`assertMember` gate; super‑admin from `env.SUPER_ADMIN_EMAIL` short‑circuits before any DB read (lockout‑proof) | `shared/core.js` roles section |
| **Comments / discussion** on any row | Generic `comments(space,list,entity_type,entity_id)` + a `comment_count` badge map | `shared/core.js` comments + `flatGet` badge logic |
| **Status timeline** (append‑only RAG notes) | `status_updates` table, never updated, only inserted; render newest‑first | `shared/core.js` status‑update functions |
| **Per‑day snapshot reports** (HTML blobs) | `reports` table keyed by date with `upsert` (INSERT OR REPLACE); a packaged `.claude/skills/<x>` to generate them | `reports` functions + `.claude/skills/daily-report` |
| **Versioned images/files** | `*_images(space,list,slot,version_no)` with `is_current`, base64 blob, restore | `shared/core.js` plan‑image functions |
| **Global registries** (tags/links shared across lists) | A non‑scoped table with a JSON `lists[]` array column + `seed` gate | `shared/core.js` channels/scripts |
| **Master template + run copies** (a reusable checklist you instantiate per event) | `runbooks` (golden + runs) + `items` with stable ids, deep‑copy on create, promote‑to‑master, dependency‑cycle guard | `shared/core.js` runbook/item services |
| **A reusable merge orchestrator** for many parallel PRs | A `.claude/skills/reconcile-prs` skill: PLAN by default, validate‑gated, never touches migrations, safe‑push only | `.claude/skills/reconcile-prs/SKILL.md` |

---

## 11. Per-project values — fill these in first

Collect these before Step 1. Nothing here except the API token is a secret.

| Placeholder | What it is | Example |
|---|---|---|
| `<APP_NAME>` / `<APP_SLUG>` | Human name / kebab id | "Home Hub" / `home-hub` |
| `<PAGES_PROJECT>` | Cloudflare Pages project name (→ `<name>.pages.dev`) | `home-hub` |
| `<D1_DB_NAME>` | D1 database name | `home-hub-db` |
| `<D1_DB_ID>` | D1 id (from `wrangler d1 create` / `wrangler d1 list`) | `f1e2d3c4-…` (UUID) |
| `<WORKER_NAME>` | MCP Worker name (→ `<name>.<sub>.workers.dev`) | `home-hub-mcp` |
| `<TEAM_DOMAIN>` | Zero Trust team URL (shared by both Access apps) | `https://my-team.cloudflareaccess.com` |
| `<POLICY_AUD_PAGES>` | AUD of the Access app on the Pages hostname | hex string |
| `<POLICY_AUD_MCP>` | AUD of the Access app on the Worker hostname | hex string |
| `<ALLOWLIST_EMAILS>` | Emails allowed to sign in | you + any other users |
| `<SUPER_ADMIN_EMAIL>` | The one admin (env var, not hard‑coded) | your email |
| `<GH_OWNER>` / `<GH_REPO>` | github.com owner / repo | `you` / `home-hub` |
| `<CF_ACCOUNT_ID>` | Cloudflare account id | hex string |
| `<TODAY_YYYY_MM_DD>` | Wrangler `compatibility_date` | today's date |

> Note: the Pages site reads identity from the `Cf-Access-Authenticated-User-Email` header, so it doesn't need
> `POLICY_AUD_PAGES` in code — but capture it anyway; it's handy if you later harden the Pages side too.

---

## 12. End-to-end verification checklist

- [ ] **Access gate**: incognito visit to `<PAGES_PROJECT>.pages.dev` prompts for email → allowed email + PIN
      loads the app; a non‑allowed email is denied.
- [ ] **Browser write persists**: add/edit a row in the UI → reload → it's still there → a second allowed user
      sees it too (proves D1 + identity + audit).
- [ ] **Audit trail**: `wrangler d1 execute <D1_DB_NAME> --remote --command "SELECT * FROM entries_audit ORDER BY at DESC LIMIT 5"`
      shows your edits with your email + timestamp.
- [ ] **Preview is demo‑only**: open a PR → the sticky comment's preview link loads, shows the "demo data" note,
      and edits there don't appear in production.
- [ ] **CI gate works**: a PR that breaks a `public/data/*.json` fails `validate` and can't merge.
- [ ] **(If MCP) unauth probe is fail‑closed**: `GET …/mcp` → `401` (+ `WWW-Authenticate`, no `302`) and
      `…/.well-known/oauth-*` → `200` (confirms Managed OAuth for MCP; see §8 ⚠️ callout).
- [ ] **(If MCP) Claude operates the app**: `claude mcp add --transport http --scope user … …/mcp` →
      `/mcp → Authenticate` (browser PIN) → `claude mcp list` shows **connected**; run add/list/delete via the
      tools; the `entries_audit` query shows your Access email as `actor`. (`scripts/smoke.mjs` only covers the
      local no‑auth dev server, not this live path.)
- [ ] **$0 confirmed**: no payment method on the Cloudflare account; the MCP rate‑limit is active; a usage alert
      is set; Access is on the Free plan.

---

### Provenance

This blueprint generalizes a production Cloudflare app (a "Command Center" dashboard). Where this document and
the live Cloudflare/Anthropic SDK docs disagree, **trust the current official docs** — the moving parts
(Agents SDK / `McpAgent`, the Access‑in‑front‑of‑MCP pattern, Wrangler flags, dashboard layouts) evolve. The
*shapes* here are correct against `agents@0.17`, `@modelcontextprotocol/sdk@1.29`, and `wrangler@4`.
