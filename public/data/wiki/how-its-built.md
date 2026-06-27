# How it's built

Two lightweight Cloudflare deployables share **one SQLite database (D1)** and **one domain-logic
module**, fronted by **Cloudflare Access**, shipped through **GitHub + Actions + Wrangler**.

- **Pages project** — a no-build static SPA (`public/`) plus `/api/*` Pages Functions (`functions/`).
- **MCP Worker** (`worker-mcp/`) — a remote MCP server on a SQLite-backed Durable Object that
  verifies the Access JWT and operates the same data.
- **`shared/core.js`** — framework-agnostic domain logic. Both surfaces import it, so validation,
  auth, and audit rules can never drift between "what the UI does" and "what Claude does".
- **D1** — one SQLite database, bound as `DB` to both surfaces.

## Principles

- **Fail-closed security** — no identity means `401` before any DB access. Demo data is served
  *only* when both `!DB` and `DEMO_API=1`, so a misconfigured production fails loudly instead of
  silently serving fakes.
- **Append-only audit** — every table has a `*_audit` sibling.
- **One generic CRUD engine, many lists** — adding a list is a small SPEC + a thin route file.
- **No build step** — plain HTML/CSS/vanilla-JS; nothing to compile.
- **$0** — every choice stays inside the Cloudflare free tier, and no payment method is attached.
