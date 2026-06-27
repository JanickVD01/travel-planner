// LOCAL-ONLY dev entry — NO auth. NEVER deploy this (wrangler deploy uses src/index.js).
// Run:  npx --yes wrangler@4 dev src/dev.js --var DEV_EMAIL:you@example.com
//   ->  http://localhost:8787/mcp   (actor falls back to DEV_EMAIL)
// Note: a *remote* D1 binding can't combine with a Durable Object in `wrangler dev`; use a local
// D1 seeded with `wrangler d1 execute travel-planner-db --local --file=../schema.sql`.
import { AppMCP } from "./mcp.js";
export { AppMCP };
export default AppMCP.serve("/mcp");
