import { json, userEmail } from "../_lib.js";
import { isSuperAdmin } from "../../../shared/core.js";
export async function onRequestGet({ request, env }) {
  const email = userEmail(request, env);
  const mock = !env.DB && env.DEMO_API === "1";
  return json({ email: email || "", isSuperAdmin: isSuperAdmin(env, email), mock });
}
