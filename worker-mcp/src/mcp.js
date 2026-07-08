// MCP tools are thin wrappers over shared/core.js — the SAME functions the browser API calls,
// so "what Claude does" and "what the UI does" can never diverge. Uses registerTool (the current
// MCP SDK API; the older server.tool(...) is deprecated as of @modelcontextprotocol/sdk@1.29).
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ServiceError, listEntries, createEntry, patchEntry, deleteEntry,
  listTrips, createTrip, patchTrip, tripBySlug,
  listSteps, createStep, patchStep, deleteStep, restoreStep, addStay, addTravel
} from "../../shared/core.js";

const SPACE = z.string().default("home").describe("Which trip/space, e.g. 'tokyo-2026'");
const LIST = z.string().describe("Which list within the space, e.g. 'itinerary' or 'todos'");
const STATUS = z.enum(["Open", "Doing", "Blocked", "Done"]);
const SLUG = z.string().describe("Trip slug, e.g. 'thailand-2026'");
const CCY = z.enum(["THB", "EUR"]);
const BOOKING = z.enum(["Idea", "Planned", "Booked", "Confirmed"]);
const KIND = z.enum(["travel", "stay"]);
const TRANSPORT = z.enum(["plane", "train", "bus", "ferry", "car", "other"]);
// Reusable optional step fields (used by add_step / edit_step).
const STEP_FIELDS = {
  location: z.string().optional(), map_url: z.string().optional(),
  lat: z.number().optional(), lng: z.number().optional(),
  arrive: z.string().optional().describe("ISO YYYY-MM-DD"), arrive_time: z.string().optional().describe("HH:MM"),
  depart: z.string().optional().describe("ISO YYYY-MM-DD"), depart_time: z.string().optional().describe("HH:MM"),
  accom_name: z.string().optional(), transport: TRANSPORT.optional(), carrier: z.string().optional(),
  cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(),
  booking_status: BOOKING.optional(), booking_url: z.string().optional(), note: z.string().optional()
};

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

    // ---- trips ----
    this.server.registerTool("list_trips",
      { description: "List all trips.", inputSchema: {} },
      () => self.run(() => listTrips(env, { space: "app", list: "trips" }, self.actor)));
    this.server.registerTool("get_trip",
      { description: "Get a trip's config by slug.", inputSchema: { slug: SLUG } },
      (a) => self.run(async () => (await tripBySlug(env, a.slug)) || { error: "trip not found: " + a.slug }));
    this.server.registerTool("create_trip",
      { description: "Create a trip. slug becomes the space of its steps.", inputSchema: { title: z.string(), slug: z.string().optional(), home_ccy: CCY.optional(), thb_per_eur: z.number().optional().describe("1 EUR = N THB (~39)"), budget_target_eur: z.number().optional(), start_date: z.string().optional(), end_date: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(() => createTrip(env, Object.assign({}, a, { space: "app", list: "trips", slug: a.slug || a.title }), self.actor)));
    this.server.registerTool("set_trip",
      { description: "Update a trip's config (FX rate, budget target, dates, title, note) by slug.", inputSchema: { slug: SLUG, title: z.string().optional(), home_ccy: CCY.optional(), thb_per_eur: z.number().optional(), budget_target_eur: z.number().optional(), start_date: z.string().optional(), end_date: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(async () => {
        const t = await tripBySlug(env, a.slug);
        if (!t) throw new ServiceError(404, "trip not found: " + a.slug);
        return patchTrip(env, Object.assign({}, a, { space: "app", list: "trips", id: t.id }), self.actor);
      }));

    // ---- steps (the timeline) ----
    this.server.registerTool("list_steps",
      { description: "List a trip's steps in timeline order.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listSteps(env, { space: a.slug, list: "flow" }, self.actor)));
    this.server.registerTool("add_step",
      { description: "Add a step (travel leg or stay) to a trip's timeline.", inputSchema: Object.assign({ slug: SLUG, kind: KIND, title: z.string() }, STEP_FIELDS) },
      (a) => self.run(() => createStep(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("add_stay",
      { description: "Add a STAY step. Give arrive + nights (depart is derived) or arrive + depart.", inputSchema: { slug: SLUG, place: z.string(), arrive: z.string().optional(), nights: z.number().optional(), depart: z.string().optional(), accom_name: z.string().optional(), lat: z.number().optional(), lng: z.number().optional(), map_url: z.string().optional(), cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(), booking_status: BOOKING.optional(), booking_url: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(() => addStay(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("add_travel",
      { description: "Add a TRAVEL leg (A->B). title/location are derived from from/to.", inputSchema: { slug: SLUG, from: z.string(), to: z.string(), mode: TRANSPORT.optional(), carrier: z.string().optional(), arrive: z.string().optional(), arrive_time: z.string().optional(), depart: z.string().optional(), depart_time: z.string().optional(), cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(), booking_status: BOOKING.optional(), booking_url: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(() => addTravel(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("edit_step",
      { description: "Edit a step by id (any field, incl. sort_order to reorder).", inputSchema: Object.assign({ slug: SLUG, id: z.string(), kind: KIND.optional(), title: z.string().optional(), sort_order: z.number().optional() }, STEP_FIELDS) },
      (a) => self.run(() => patchStep(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("delete_step",
      { description: "Delete a step by id (soft-delete; recoverable via restore_step).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deleteStep(env, { space: a.slug, list: "flow", id: a.id }, self.actor)));
    this.server.registerTool("list_deleted_steps",
      { description: "List a trip's soft-deleted (trashed) steps.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listSteps(env, { space: a.slug, list: "flow", trash: true }, self.actor)));
    this.server.registerTool("restore_step",
      { description: "Restore a soft-deleted step by id.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => restoreStep(env, { space: a.slug, list: "flow", id: a.id }, self.actor)));
  }
}
