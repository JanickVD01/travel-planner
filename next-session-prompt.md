# Next-session kickoff — Implementation planning

> **How to use this file.** Open a **fresh Claude Code session in this repo, in plan mode**
> (Shift+Tab, or `/plan`), and paste the prompt block below. It produces a detailed,
> milestone-by-milestone implementation plan from the approved spec in
> [`travel-planner-requirements.md`](travel-planner-requirements.md). Nothing here writes feature
> code — planning only, presented for your approval first.
>
> **Model note (Fable 5).** The prompt is model-agnostic — it works on any model. If you're running
> the session on **Claude Fable 5**, pick it as the session model in Claude Code (the prompt sets no
> model itself) and run at **`high` (or `xhigh`) effort**. Expect Fable 5 to take longer per turn and
> to be more thorough — good for a planning pass. The prompt below is lightly tuned for Fable 5's
> prompting profile (goal + constraints over rigid step-lists; an explicit act-when-ready / don't-
> re-litigate nudge). It reads fine on any other model too.

---

## The prompt (copy from here)

```
We're building the Travel Planner Thailand trip feature on top of the existing $0 AI-first
Cloudflare scaffold in this repo. The full, approved requirements & design spec is already written
— read it first, in full, plus the repo guide:

  - travel-planner-requirements.md   (the authoritative spec: canonical data model in §4, MCP
                                       surface §5, UI/UX §6, budget/currency §7, risks §8,
                                       phasing §10, verification §11)
  - CLAUDE.md                        (repo governance: the ~6-line "add a list" pattern, the
                                       parallel-session PR workflow, hard rules)
  - MEMORY.md                        (how the project got here)

Also read the actual code the spec extends before planning: shared/core.js, schema.sql,
functions/api/entries/[[path]].js, functions/api/_mock.js, worker-mcp/src/mcp.js, public/app.js,
public/styles.css, public/index.html.

Your task THIS session: produce a detailed, milestone-by-milestone IMPLEMENTATION PLAN (do not
write feature code yet — plan mode). The goal is a plan that is small-slice-first, safe under the
repo's PR workflow, and faithful to the locked spec. Use your judgment on structure; the numbered
points below are constraints to satisfy, not a recipe to recite.

When you have enough information to act, act. Do not re-derive facts the spec already establishes,
re-litigate a decision that is locked in §2/§4, or narrate options you won't pursue. If you're
weighing a choice, give a recommendation, not an exhaustive survey.

Requirements for the plan:

  1. Treat §4 of the spec (the column dictionary) as canonical and locked — do not redesign the
     data model. If you find a genuine conflict with the real engine, flag it, don't silently change it.
  2. Start with the Phase 1 THIN END-TO-END SLICE and make it the first, independently-shippable
     milestone: cleaners + FLAT_SPECS.trips + FLAT_SPECS.steps + wrappers in shared/core.js; schema
     blocks; copy the entries route per entity; _mock.js branches; MCP set_trip/add_stay/add_travel/
     list_steps/edit_step; UI home card → vertical timeline (steps only) → one inline edit
     (cost_actual) round-tripping through flatPatch; seed the Thailand trip (thb_per_eur + budget
     target). Done = "Claude adds a stay from the phone; it appears in the browser timeline; I edit
     its actual cost inline; it persists."
  3. Then break Phases 2–5 (activities+nesting, budget view, checklist+reorder+delete-deep+polish,
     hardening) into milestones. For each milestone give: the exact files to touch, what changes in
     each, which existing patterns/functions to reuse, the migration/redeploy needs, and the
     acceptance check.
  4. Honor the repo workflow: one task = one branch (code/* or content/*) = one PR; push only via
     scripts/pr-safe-push.sh; validate gate + demo-mode preview; apply schema migrations to prod D1
     BEFORE merge; merge-commit only; never push main; never attach a payment method; every new
     /api/* route needs a _mock.js branch.
  5. Include the end-to-end verification steps from §11 (local D1 + pages dev, worker-mcp smoke with
     API==MCP budget parity, validate-data, demo preview, two-device manual pass).

Sequence the milestones so each is a small, safe, independently mergeable PR. Present the plan for
approval before implementing.
```

## Copy up to here

---

### Context if you need it
- **Where we are:** infra is complete (scaffold, Pages, D1, Cloudflare Access, MCP worker, CI/deploy,
  governance — all live). The app still shows the generic `entries` placeholder; the travel data
  model / views / MCP tools are **not built yet**.
- **What's locked:** the 4 product decisions and the canonical data model in `travel-planner-requirements.md`
  §2 and §4. Don't relitigate them.
- **First deliverable:** the Phase 1 thin slice above — the smallest change that proves MCP-write +
  API + browser view + inline edit + audit all work end-to-end on the real trip data model.
