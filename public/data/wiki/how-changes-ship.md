# How changes ship

Code lives on GitHub. A push to `main` runs GitHub Actions, which uses Wrangler to deploy the
Pages site and (when relevant) the MCP Worker, and to re-apply the D1 schema when it changes.
Every change travels through a **pull request** with a gated, demo-data **preview**.

## Safe parallel sessions

This is the whole point of the governance: you can run **several Claude Code sessions at once**.

- **One task = one branch = one PR.** Use `content/<name>` for changes under `public/data/**`;
  use `code/<name>` for everything else.
- Each PR gets a Cloudflare **preview running in demo mode** (no database) — preview edits never
  touch live data.
- The required **`validate`** check parses every data JSON and the wiki manifest; a red check
  blocks merge.
- Merges are **merge commits only**, so release-note commit links stay valid.
- `main` is protected server-side: no direct or forced pushes, ever.

## The PR description (four lines)

```
what/why: <one line>
What's New? y/n
migration: none / NNN
worker redeploy? y/n
```
