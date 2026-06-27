// MCP tools are thin wrappers over shared/core.js — the SAME functions the browser API calls,
// so "what Claude does" and "what the UI does" can never diverge. Uses registerTool (the current
// MCP SDK API; the older server.tool(...) is deprecated as of @modelcontextprotocol/sdk@1.29).
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceError, listEntries, createEntry, patchEntry, deleteEntry } from "../../shared/core.js";

const SPACE = z.string().default("home").describe("Which trip/space, e.g. 'tokyo-2026'");
const LIST = z.string().describe("Which list within the space, e.g. 'itinerary' or 'todos'");
const STATUS = z.enum(["Open", "Doing", "Blocked", "Done"]);

export class AppMCP extends McpAgent {
  server = new McpServer({ name: "travel-planner", version: "1.0.0" });

  // The authenticated email is injected by src/index.js as ctx.props.email -> this.props.email.
  get actor() { return (this.props && this.props.email) || (this.env && this.env.DEV_EMAIL) || "mcp-unknown"; }

  async run(fn) {
    try { return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] }; }
    catch (e) {
      const code = (e instanceof ServiceError && e.code) ? e.code : (e instanceof ServiceError) ? "validation" : "internal";
      return { content: [{ type: "text", text: `Error [${code}]: ${e.message}` }], isError: true };
    }
  }

  async init() {
    const env = this.env, self = this;
    this.server.registerTool("list_entries",
      { description: "List rows in a list.", inputSchema: { space: SPACE, list: LIST } },
      (a) => self.run(() => listEntries(env, a, self.actor)));
    this.server.registerTool("add_entry",
      { description: "Add a row to a list.", inputSchema: { space: SPACE, list: LIST, title: z.string(), note: z.string().optional(), status: STATUS.optional(), due: z.string().optional().describe("ISO YYYY-MM-DD") } },
      (a) => self.run(() => createEntry(env, a, self.actor)));
    this.server.registerTool("edit_entry",
      { description: "Edit a row by id.", inputSchema: { space: SPACE, list: LIST, id: z.string(), title: z.string().optional(), note: z.string().optional(), status: STATUS.optional(), due: z.string().optional() } },
      (a) => self.run(() => patchEntry(env, a, self.actor)));
    this.server.registerTool("delete_entry",
      { description: "Delete a row by id.", inputSchema: { space: SPACE, list: LIST, id: z.string() } },
      (a) => self.run(() => deleteEntry(env, a, self.actor)));
  }
}
