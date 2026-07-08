// Thin adapter over shared/core.js — a computed, read-only budget snapshot for the frontend.
// The UI renders these numbers verbatim; all money math lives in core (computeBudget/getBudget).
//   GET /api/budget/<slug> -> { rate, target, home_ccy, totalEst, totalActual, estOfUnspent,
//                               projectedSpend, remaining, projected, pct, over, byCategory }
// A trip with no FX rate surfaces cleanly as 422 {code:"no_rate"} via fail().
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { getBudget } from "../../../shared/core.js";

export async function onRequestGet({ request, env, params }) {
  const email = userEmail(request, env), slug = parsePath(params)[0];
  if (!email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!slug) return json({ error: "expected /api/budget/<slug>" }, 400);
  try { return json(await getBudget(env, { space: slug }, email)); } catch (e) { return fail(e); }
}
