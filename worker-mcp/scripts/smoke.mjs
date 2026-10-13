#!/usr/bin/env node
// MCP smoke test: connect over the protocol, then add -> list -> delete a row, and a regions round-trip
// (add_region -> add_stay in it -> overview tree -> purge), all self-cleaning.
// Defaults to the local no-auth dev server (src/dev.js). To hit the deployed Worker behind
// Cloudflare Access, set MCP_URL and a service token:
//   MCP_URL=https://<worker>.<sub>.workers.dev/mcp \
//   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL || "http://localhost:8787/mcp";
const SPACE = process.env.SMOKE_SPACE || "smoke";
const LIST = process.env.SMOKE_LIST || "smoke";

const headers = {};
if (process.env.CF_ACCESS_CLIENT_ID) headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
if (process.env.CF_ACCESS_CLIENT_SECRET) headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;

function payload(res) {
  const txt = (res && res.content && res.content[0] && res.content[0].text) || "";
  if (res && res.isError) throw new Error("tool error: " + txt);
  try { return JSON.parse(txt); } catch { return txt; }
}

const transport = new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers } });
const client = new Client({ name: "travel-planner-smoke", version: "1.0.0" });

let createdId = null, regionId = null, stepId = null;
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("• tools:", tools.tools.map(t => t.name).join(", "));

  const created = payload(await client.callTool({ name: "add_entry", arguments: { space: SPACE, list: LIST, title: "smoke-test row", status: "Open" } }));
  createdId = created && created.row && created.row.id;
  if (!createdId) throw new Error("add_entry returned no id: " + JSON.stringify(created));
  console.log("• added:", createdId);

  const listed = payload(await client.callTool({ name: "list_entries", arguments: { space: SPACE, list: LIST } }));
  const found = (listed.rows || []).some(r => r.id === createdId);
  if (!found) throw new Error("created row not found in list_entries");
  console.log("• listed: found the new row ✓");

  const del = payload(await client.callTool({ name: "delete_entry", arguments: { space: SPACE, list: LIST, id: createdId } }));
  if (!del || !del.ok) throw new Error("delete_entry failed: " + JSON.stringify(del));
  createdId = null;
  console.log("• deleted ✓");

  // Regions round-trip (effort 0017), self-cleaning: add a region -> a stay inside it -> the overview
  // tree groups it -> purge both (purge_region clears region_id; purge_step removes the stay).
  const R = payload(await client.callTool({ name: "add_region", arguments: { slug: SPACE, title: "smoke-region", planned_nights: 2 } }));
  regionId = R && R.row && R.row.id;
  if (!regionId) throw new Error("add_region returned no id: " + JSON.stringify(R));
  const st = payload(await client.callTool({ name: "add_stay", arguments: { slug: SPACE, place: "smoke-town", arrive: "2030-01-01", nights: 2, region_id: regionId } }));
  stepId = st && st.row && st.row.id;
  if (!stepId || st.row.region_id !== regionId) throw new Error("add_stay with region_id failed: " + JSON.stringify(st));
  const ov = payload(await client.callTool({ name: "get_trip_overview", arguments: { slug: SPACE } }));
  const g = ov && ov.tree && ov.tree.regions && ov.tree.regions[regionId];
  if (!g || g.nights !== 2 || g.stays !== 1) throw new Error("overview tree missing the region: " + JSON.stringify(ov && ov.tree));
  console.log("• regions: add_region + add_stay(region_id) + tree ✓");
  const pr = payload(await client.callTool({ name: "purge_region", arguments: { slug: SPACE, id: regionId } }));
  if (!pr || !pr.ok || pr.steps_cleared !== 1) throw new Error("purge_region failed: " + JSON.stringify(pr));
  regionId = null;
  payload(await client.callTool({ name: "purge_step", arguments: { slug: SPACE, id: stepId } }));
  stepId = null;
  console.log("• regions: purged (region + step) ✓");

  // get_budget (best-effort): the dev DB may have no trips, so a 404/422 tool-error is acceptable.
  // We only assert the tool RESPONDS with content, and never let it fail the smoke.
  try {
    const slug = process.env.SMOKE_SLUG || "thailand-2026";
    const res = await client.callTool({ name: "get_budget", arguments: { slug } });
    if (!res || !Array.isArray(res.content) || !res.content.length) throw new Error("no content returned");
    console.log("• get_budget: responded" + (res.isError ? " (tool error, tolerated: " + res.content[0].text + ")" : " ✓"));
  } catch (e) {
    console.log("• get_budget: skipped (" + e.message + ")");
  }

  console.log("\n✓ smoke passed against " + URL_);
  await client.close();
  process.exit(0);
} catch (e) {
  console.error("\n✗ smoke failed:", e.message);
  if (createdId) console.error("  (leftover row may remain: " + createdId + ")");
  if (regionId) console.error("  (leftover region may remain in '" + SPACE + "': " + regionId + ")");
  if (stepId) console.error("  (leftover step may remain in '" + SPACE + "': " + stepId + ")");
  try { await client.close(); } catch {}
  process.exit(1);
}
