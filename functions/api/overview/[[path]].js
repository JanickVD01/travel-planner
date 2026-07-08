// Thin adapter over shared/core.js — a read-only trip snapshot for the frontend.
//   GET /api/overview/<slug> -> { trip, steps, activitiesByStep, unassigned }
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { tripOverview } from "../../../shared/core.js";

export async function onRequestGet({ request, env, params }) {
  const email = userEmail(request, env), slug = parsePath(params)[0];
  if (!email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!slug) return json({ error: "expected /api/overview/<slug>" }, 400);
  try { return json(await tripOverview(env, { space: slug }, email)); } catch (e) { return fail(e); }
}
