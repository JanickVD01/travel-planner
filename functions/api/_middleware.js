// Serve the in-memory demo store ONLY when BOTH the D1 binding is absent AND DEMO_API=1.
// Preview env carries DEMO_API=1 and NO DB binding; production carries neither, so a lost
// prod binding fails loudly (500) instead of silently serving fakes.
import { handleMock } from "./_mock.js";
export async function onRequest(context) {
  const { request, env, next } = context;
  if (!env.DB && env.DEMO_API === "1") return handleMock(request, env);
  return next();
}
