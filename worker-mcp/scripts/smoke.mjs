#!/usr/bin/env node
// MCP smoke test: connect over the protocol, then add -> list -> delete a row (self-cleaning).
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

let createdId = null;
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

  console.log("\n✓ smoke passed against " + URL_);
  await client.close();
  process.exit(0);
} catch (e) {
  console.error("\n✗ smoke failed:", e.message);
  if (createdId) console.error("  (leftover row may remain: " + createdId + ")");
  try { await client.close(); } catch {}
  process.exit(1);
}
