// MCP tools are thin wrappers over shared/core.js — the SAME functions the browser API calls,
// so "what Claude does" and "what the UI does" can never diverge. Uses registerTool (the current
// MCP SDK API; the older server.tool(...) is deprecated as of @modelcontextprotocol/sdk@1.29).
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ServiceError, listEntries, createEntry, patchEntry, deleteEntry,
  listTrips, createTrip, patchTrip, tripBySlug,
  listSteps, createStep, patchStep, deleteStep, restoreStep, purgeStepDeep, addStay, addTravel,
  listRegions, createRegion, patchRegion, deleteRegion, restoreRegion, purgeRegionDeep, moveRegion, assignSteps,
  listActivities, createActivity, patchActivity, deleteActivity, restoreActivity, purgeActivity,
  listPacking, createPacking, patchPacking, deletePacking, restorePacking, purgePacking, filterPacking,
  listTodos, createTodo, patchTodo, deleteTodo, restoreTodo, purgeTodo,
  listAttachments, patchAttachment, deleteAttachment, purgeAttachment, setPinned,
  setCoordinate, setBooking, setIncluded, setMapUrl, tripOverview, getBudget
} from "../../shared/core.js";

const SPACE = z.string().default("home").describe("Which trip/space, e.g. 'tokyo-2026'");
const LIST = z.string().describe("Which list within the space, e.g. 'itinerary' (generic entries; a trip's to-dos use the *_todo tools)");
const STATUS = z.enum(["Open", "Doing", "Blocked", "Done"]);
const SLUG = z.string().describe("Trip slug, e.g. 'thailand-2026'");
const CCY = z.enum(["THB", "EUR"]);
const BOOKING = z.enum(["Idea", "Planned", "Booked", "Confirmed"]);
const KIND = z.enum(["travel", "stay"]);
const TRANSPORT = z.enum(["plane", "train", "bus", "ferry", "car", "other"]);
// Region membership of a step (effort 0017). A region is the planning layer above steps (e.g. 'Provence',
// 'Krabi'); locations (towns) are derived from stays, never stored.
const REGION_ID = z.string().nullable().optional().describe("Region id (from list_regions / add_region) this step belongs to; null or '' = no region (e.g. a transfer between regions)");
// Reusable optional step fields (used by add_step / edit_step).
const STEP_FIELDS = {
  location: z.string().optional(), map_url: z.string().optional(),
  lat: z.number().optional(), lng: z.number().optional(),
  arrive: z.string().optional().describe("ISO YYYY-MM-DD"), arrive_time: z.string().optional().describe("HH:MM"),
  depart: z.string().optional().describe("ISO YYYY-MM-DD"), depart_time: z.string().optional().describe("HH:MM"),
  accom_name: z.string().optional(), transport: TRANSPORT.optional(), carrier: z.string().optional(),
  cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(),
  booking_status: BOOKING.optional(), booking_url: z.string().optional(),
  included: z.boolean().optional().describe("Cost is covered by another ticket: hidden on the card + excluded from the budget"),
  note: z.string().optional(),
  region_id: REGION_ID
};
// Region fields (used by add_region / edit_region). Dates/nights are a PLAN; once the region has stays,
// its real dates + nights are derived from them (see get_trip_overview -> tree.regions).
const REGION_FIELDS = {
  planned_nights: z.number().int().positive().nullable().optional().describe("Planned number of nights (used while the region has no stays yet)"),
  start_date: z.string().nullable().optional().describe("Planned start, ISO YYYY-MM-DD"),
  end_date: z.string().nullable().optional().describe("Planned end, ISO YYYY-MM-DD"),
  note: z.string().nullable().optional()
};
const TARGET = z.enum(["step", "activity"]).describe("Which entity: a timeline 'step' or an 'activity'");
// Reusable optional activity fields (used by add_activity / edit_activity).
const ACTIVITY_FIELDS = {
  location: z.string().optional(), map_url: z.string().optional(),
  lat: z.number().optional(), lng: z.number().optional(),
  day: z.string().optional().describe("ISO YYYY-MM-DD"),
  needs_advance: z.enum(["yes", "no"]).optional().describe("Book/reserve ahead?"),
  cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(),
  booking_status: BOOKING.optional(), booking_url: z.string().optional(),
  included: z.boolean().optional().describe("Cost is covered by another ticket: hidden on the card + excluded from the budget"),
  note: z.string().optional()
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
      { description: "Add a step (travel leg or stay) to a trip's timeline. With region_id it is placed right after that region's last step (or in an empty region's slot); otherwise it's appended.", inputSchema: Object.assign({ slug: SLUG, kind: KIND, title: z.string() }, STEP_FIELDS) },
      (a) => self.run(() => createStep(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("add_stay",
      { description: "Add a STAY step. Give arrive + nights (depart is derived) or arrive + depart. Pass region_id to put it in a region (placed at the end of that region).", inputSchema: { slug: SLUG, place: z.string(), region_id: REGION_ID, arrive: z.string().optional(), nights: z.number().optional(), depart: z.string().optional(), accom_name: z.string().optional(), lat: z.number().optional(), lng: z.number().optional(), map_url: z.string().optional(), cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(), booking_status: BOOKING.optional(), booking_url: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(() => addStay(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("add_travel",
      { description: "Add a TRAVEL leg (A->B). title/location are derived from from/to. Give region_id only for a leg INSIDE a region (e.g. Ao Nang -> Railay); leave it out for a transfer between regions.", inputSchema: { slug: SLUG, from: z.string(), to: z.string(), region_id: REGION_ID, mode: TRANSPORT.optional(), carrier: z.string().optional(), arrive: z.string().optional(), arrive_time: z.string().optional(), depart: z.string().optional(), depart_time: z.string().optional(), cost_est: z.number().optional(), cost_actual: z.number().optional(), cost_ccy: CCY.optional(), booking_status: BOOKING.optional(), booking_url: z.string().optional(), note: z.string().optional() } },
      (a) => self.run(() => addTravel(env, Object.assign({}, a, { space: a.slug, list: "flow" }), self.actor)));
    this.server.registerTool("edit_step",
      { description: "Edit a step by id (any field, incl. region_id to change its region and sort_order to reorder). To move a whole region use move_region instead.", inputSchema: Object.assign({ slug: SLUG, id: z.string(), kind: KIND.optional(), title: z.string().optional(), sort_order: z.number().optional() }, STEP_FIELDS) },
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
    this.server.registerTool("purge_step",
      { description: "Permanently delete a step AND its activities/photos (cascade). Cannot be undone.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeStepDeep(env, { space: a.slug, list: "flow", id: a.id }, self.actor)));
    this.server.registerTool("delete_step_deep",
      { description: "Permanently delete a step AND its activities/photos (cascade). Alias of purge_step.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeStepDeep(env, { space: a.slug, list: "flow", id: a.id }, self.actor)));

    // ---- regions (effort 0017): Trip > Region > Location (derived from stays) > Step ----
    // Ordering rule: step sort_order is the only chronology; a region's position comes from its steps
    // (an empty region uses its own slot). move_region is the only way to reorder a region.
    this.server.registerTool("list_regions",
      { description: "List a trip's regions (the planning layer above steps, e.g. 'Provence', 'Krabi'). For their derived dates/nights/order use get_trip_overview.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listRegions(env, { space: a.slug }, self.actor)));
    this.server.registerTool("add_region",
      { description: "Add a region to a trip. It may stay empty (a plan, e.g. 'Krabi, 6 nights') until stays are added or assigned. Appended at the end of the timeline unless before_region_id/after_region_id is given.", inputSchema: Object.assign({ slug: SLUG, title: z.string().describe("Region name, e.g. 'Provence', 'North (Chiang Mai)'"), before_region_id: z.string().optional(), after_region_id: z.string().optional() }, REGION_FIELDS) },
      (a) => self.run(() => createRegion(env, Object.assign({}, a, { space: a.slug }), self.actor)));
    this.server.registerTool("edit_region",
      { description: "Edit a region by id (title, planned_nights, start_date, end_date, note). Use move_region to reorder.", inputSchema: Object.assign({ slug: SLUG, id: z.string(), title: z.string().optional() }, REGION_FIELDS) },
      (a) => self.run(() => patchRegion(env, Object.assign({}, a, { space: a.slug }), self.actor)));
    this.server.registerTool("move_region",
      { description: "Move a region (all its steps, as one block) before or after another region; give neither to move it to the end. Steps without a region stay where they are. Renumbers the timeline.", inputSchema: { slug: SLUG, id: z.string(), before_region_id: z.string().optional(), after_region_id: z.string().optional() } },
      (a) => self.run(() => moveRegion(env, { space: a.slug, id: a.id, before_region_id: a.before_region_id, after_region_id: a.after_region_id }, self.actor)));
    this.server.registerTool("assign_steps_to_region",
      { description: "Put steps into a region (region_id null = take them out of any region). Membership only: it does NOT reorder. Returns missing ids and split_regions (regions whose steps are no longer contiguous; fix with move_region or edit_step sort_order).", inputSchema: { slug: SLUG, region_id: z.string().nullable(), step_ids: z.array(z.string()).min(1) } },
      (a) => self.run(() => assignSteps(env, { space: a.slug, region_id: a.region_id, step_ids: a.step_ids }, self.actor)));
    this.server.registerTool("delete_region",
      { description: "Delete a region by id (soft-delete; recoverable via restore_region). Its steps are NOT deleted: they show at top level until the region is restored.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deleteRegion(env, { space: a.slug, id: a.id }, self.actor)));
    this.server.registerTool("restore_region",
      { description: "Restore a soft-deleted region by id (its steps regroup under it).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => restoreRegion(env, { space: a.slug, id: a.id }, self.actor)));
    this.server.registerTool("list_deleted_regions",
      { description: "List a trip's soft-deleted (trashed) regions.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listRegions(env, { space: a.slug, trash: true }, self.actor)));
    this.server.registerTool("purge_region",
      { description: "Permanently delete a region and clear region_id on its steps. The steps themselves are kept. Cannot be undone.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeRegionDeep(env, { space: a.slug, id: a.id }, self.actor)));

    // ---- activities (things to do, hung off a step) ----
    this.server.registerTool("list_activities",
      { description: "List a trip's activities, optionally only those for one step.", inputSchema: { slug: SLUG, step_id: z.string().optional().describe("Filter to this parent step id") } },
      (a) => self.run(async () => {
        const r = await listActivities(env, { space: a.slug, list: "activities" }, self.actor);
        return a.step_id ? { rows: r.rows.filter(x => x.step_id === a.step_id) } : r;
      }));
    this.server.registerTool("add_activity",
      { description: "Add an activity under a step (by step_id) on a trip.", inputSchema: Object.assign({ slug: SLUG, step_id: z.string(), title: z.string() }, ACTIVITY_FIELDS) },
      (a) => self.run(() => createActivity(env, Object.assign({}, a, { space: a.slug, list: "activities" }), self.actor)));
    this.server.registerTool("edit_activity",
      { description: "Edit an activity by id (any field, incl. step_id to re-parent and sort_order to reorder).", inputSchema: Object.assign({ slug: SLUG, id: z.string(), step_id: z.string().optional(), title: z.string().optional(), sort_order: z.number().optional() }, ACTIVITY_FIELDS) },
      (a) => self.run(() => patchActivity(env, Object.assign({}, a, { space: a.slug, list: "activities" }), self.actor)));
    this.server.registerTool("delete_activity",
      { description: "Delete an activity by id (soft-delete; recoverable via restore_activity).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deleteActivity(env, { space: a.slug, list: "activities", id: a.id }, self.actor)));
    this.server.registerTool("restore_activity",
      { description: "Restore a soft-deleted activity by id.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => restoreActivity(env, { space: a.slug, list: "activities", id: a.id }, self.actor)));
    this.server.registerTool("list_deleted_activities",
      { description: "List a trip's soft-deleted (trashed) activities.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listActivities(env, { space: a.slug, list: "activities", trash: true }, self.actor)));
    this.server.registerTool("purge_activity",
      { description: "Permanently delete a soft-deleted activity by id. Cannot be undone.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeActivity(env, { space: a.slug, list: "activities", id: a.id }, self.actor)));

    // ---- packing (the packing list; replaces the old to-do checklist) ----
    // owner = 'shared' or a person's email; the literal 'mine' maps to the current actor's email.
    const PACK_OWNER = z.string().optional().describe("'shared', a person's email, or 'mine' (maps to you)");
    const ownerOf = (v) => (v === "mine" ? self.actor : v);
    this.server.registerTool("list_packing",
      { description: "List a trip's packing items. Optional scope: 'mine' (yours), 'partner' (someone else's), 'shared', or all.", inputSchema: { slug: SLUG, scope: z.enum(["mine", "partner", "shared", "all"]).optional() } },
      (a) => self.run(async () => {
        const r = await listPacking(env, { space: a.slug, list: "packing" }, self.actor);
        return { rows: filterPacking(r.rows, self.actor, a.scope) };
      }));
    this.server.registerTool("add_packing",
      { description: "Add a packing item to a trip. owner defaults to 'shared'; pass 'mine' to assign it to yourself.", inputSchema: { slug: SLUG, title: z.string(), owner: PACK_OWNER, packed: z.boolean().optional(), category: z.string().optional(), qty: z.number().optional(), note: z.string().optional() } },
      (a) => self.run(() => createPacking(env, Object.assign({}, a, { space: a.slug, list: "packing", owner: ownerOf(a.owner) }), self.actor)));
    this.server.registerTool("edit_packing",
      { description: "Edit a packing item by id (any field, incl. owner and sort_order). owner 'mine' maps to you.", inputSchema: { slug: SLUG, id: z.string(), title: z.string().optional(), owner: PACK_OWNER, packed: z.boolean().optional(), category: z.string().optional(), qty: z.number().optional(), note: z.string().optional(), sort_order: z.number().optional() } },
      (a) => self.run(() => {
        const p = Object.assign({}, a, { space: a.slug, list: "packing" });
        if (a.owner !== undefined) p.owner = ownerOf(a.owner);   // only touch owner when explicitly given
        return patchPacking(env, p, self.actor);
      }));
    this.server.registerTool("toggle_packed",
      { description: "Set whether a packing item is packed (checked off) by id.", inputSchema: { slug: SLUG, id: z.string(), packed: z.boolean() } },
      (a) => self.run(() => patchPacking(env, { space: a.slug, list: "packing", id: a.id, packed: a.packed }, self.actor)));
    this.server.registerTool("delete_packing",
      { description: "Delete a packing item by id (soft-delete; recoverable via restore_packing).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deletePacking(env, { space: a.slug, list: "packing", id: a.id }, self.actor)));
    this.server.registerTool("restore_packing",
      { description: "Restore a soft-deleted packing item by id.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => restorePacking(env, { space: a.slug, list: "packing", id: a.id }, self.actor)));
    this.server.registerTool("list_deleted_packing",
      { description: "List a trip's soft-deleted (trashed) packing items.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listPacking(env, { space: a.slug, list: "packing", trash: true }, self.actor)));
    this.server.registerTool("purge_packing",
      { description: "Permanently delete a soft-deleted packing item by id. Cannot be undone.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgePacking(env, { space: a.slug, list: "packing", id: a.id }, self.actor)));

    // ---- todos (a free-form trip to-do list, effort 0020 — not tied to steps; done = checked off) ----
    this.server.registerTool("list_todos",
      { description: "List a trip's to-dos (the free-form to-do list), in order. Each has id, title, done ('1' = checked off) and an optional note.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listTodos(env, { space: a.slug, list: "todos" }, self.actor)));
    this.server.registerTool("add_todo",
      { description: "Add a to-do to a trip's to-do list (appended at the end).", inputSchema: { slug: SLUG, title: z.string(), done: z.boolean().optional(), note: z.string().optional() } },
      (a) => self.run(() => createTodo(env, Object.assign({}, a, { space: a.slug, list: "todos" }), self.actor)));
    this.server.registerTool("edit_todo",
      { description: "Edit a to-do by id: title, note, done, or sort_order (to reorder).", inputSchema: { slug: SLUG, id: z.string(), title: z.string().optional(), note: z.string().optional(), done: z.boolean().optional(), sort_order: z.number().optional() } },
      (a) => self.run(() => patchTodo(env, Object.assign({}, a, { space: a.slug, list: "todos" }), self.actor)));
    this.server.registerTool("toggle_todo",
      { description: "Check a to-do off (done: true) or reopen it (done: false) by id.", inputSchema: { slug: SLUG, id: z.string(), done: z.boolean() } },
      (a) => self.run(() => patchTodo(env, { space: a.slug, list: "todos", id: a.id, done: a.done }, self.actor)));
    this.server.registerTool("delete_todo",
      { description: "Delete a to-do by id (soft-delete; recoverable via restore_todo or the app's Trash).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deleteTodo(env, { space: a.slug, list: "todos", id: a.id }, self.actor)));
    this.server.registerTool("restore_todo",
      { description: "Restore a soft-deleted to-do by id.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => restoreTodo(env, { space: a.slug, list: "todos", id: a.id }, self.actor)));
    this.server.registerTool("list_deleted_todos",
      { description: "List a trip's soft-deleted (trashed) to-dos.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => listTodos(env, { space: a.slug, list: "todos", trash: true }, self.actor)));
    this.server.registerTool("purge_todo",
      { description: "Permanently delete a soft-deleted to-do by id. Cannot be undone.", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeTodo(env, { space: a.slug, list: "todos", id: a.id }, self.actor)));

    // ---- attachments (photo METADATA; image BYTES are uploaded via the web UI only, never MCP) ----
    this.server.registerTool("list_attachments",
      { description: "List a trip's photo attachments (metadata only), optionally filtered to one parent step/activity.", inputSchema: { slug: SLUG, parent_type: z.enum(["step", "activity"]).optional(), parent_id: z.string().optional().describe("Filter to this parent step/activity id") } },
      (a) => self.run(async () => {
        const r = await listAttachments(env, { space: a.slug, list: "attachments" }, self.actor);
        let rows = r.rows;
        if (a.parent_type) rows = rows.filter(x => x.parent_type === a.parent_type);
        if (a.parent_id) rows = rows.filter(x => x.parent_id === a.parent_id);
        return { rows };
      }));
    this.server.registerTool("set_caption",
      { description: "Set (or clear, pass null/empty) the caption of a photo attachment by id.", inputSchema: { slug: SLUG, id: z.string(), caption: z.string().nullable().optional() } },
      (a) => self.run(() => patchAttachment(env, { space: a.slug, list: "attachments", id: a.id, caption: a.caption == null ? null : a.caption }, self.actor)));
    this.server.registerTool("pin_image",
      { description: "Pin a photo as its parent step's card background (shown behind the step on the timeline while scrolling). Pinning one photo automatically un-pins any other photo on the same step. Pass pinned:false to unpin. Note: only 'stay' steps render a background.", inputSchema: { slug: SLUG, id: z.string(), pinned: z.boolean().optional().describe("true (default) to pin as the background, false to unpin") } },
      (a) => self.run(() => setPinned(env, { space: a.slug, id: a.id, pinned: a.pinned === undefined ? true : a.pinned }, self.actor)));
    this.server.registerTool("delete_attachment",
      { description: "Delete a photo attachment by id (soft-delete; the image bytes stay in KV until purged).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => deleteAttachment(env, { space: a.slug, list: "attachments", id: a.id }, self.actor)));
    this.server.registerTool("purge_attachment",
      { description: "Permanently delete a soft-deleted photo attachment by id (also removes its image bytes from KV).", inputSchema: { slug: SLUG, id: z.string() } },
      (a) => self.run(() => purgeAttachment(env, { space: a.slug, list: "attachments", id: a.id }, self.actor)));

    // ---- cross-entity routers + overview ----
    this.server.registerTool("set_map_url",
      { description: "Set the location of a step/activity to a real Google Maps place link (PRIMARY). Research the actual place and pass its Google Maps URL; the app opens this link directly. Prefer this over set_coordinate.", inputSchema: { slug: SLUG, target: TARGET, id: z.string(), map_url: z.string().describe("A Google Maps URL, e.g. https://www.google.com/maps/place/...") } },
      (a) => self.run(() => setMapUrl(env, { target: a.target, space: a.slug, list: a.target === "step" ? "flow" : "activities", id: a.id, map_url: a.map_url }, self.actor)));
    this.server.registerTool("set_coordinate",
      { description: "Set the lat/lng of a step or an activity (a best-estimate fallback used only when no real Google Maps link is available — prefer set_map_url).", inputSchema: { slug: SLUG, target: TARGET, id: z.string(), lat: z.number(), lng: z.number() } },
      (a) => self.run(() => setCoordinate(env, { target: a.target, space: a.slug, list: a.target === "step" ? "flow" : "activities", id: a.id, lat: a.lat, lng: a.lng }, self.actor)));
    this.server.registerTool("set_booking",
      { description: "Set the booking status (and optional URL) of a step or an activity by id.", inputSchema: { slug: SLUG, target: TARGET, id: z.string(), booking_status: BOOKING, booking_url: z.string().optional() } },
      (a) => self.run(() => setBooking(env, { target: a.target, space: a.slug, list: a.target === "step" ? "flow" : "activities", id: a.id, booking_status: a.booking_status, booking_url: a.booking_url }, self.actor)));
    this.server.registerTool("set_included",
      { description: "Mark whether a step/activity's cost is covered by another ticket. When true the cost is hidden on the card and excluded from the budget.", inputSchema: { slug: SLUG, target: TARGET, id: z.string(), included: z.boolean() } },
      (a) => self.run(() => setIncluded(env, { target: a.target, space: a.slug, list: a.target === "step" ? "flow" : "activities", id: a.id, included: a.included }, self.actor)));
    this.server.registerTool("get_trip_overview",
      { description: "Read-only trip snapshot: config, regions, steps in order, activities grouped by step, unassigned activities, and `tree`: the Trip > Region > Location > Step hierarchy (tree.items in timeline order; tree.regions = per-region derived dates/nights/planned gap/split flag/EUR subtotal; tree.strip; tree.totals). Each row carries maps_url + eur.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => tripOverview(env, { space: a.slug }, self.actor)));
    this.server.registerTool("get_budget",
      { description: "Computed budget snapshot for a trip (all figures in EUR): totals, projected spend vs target, remaining/projected, pct, over-budget flag, estimated by-category breakdown, and byRegion (EUR est/actual per region id; 'none' = no region). 422 no_rate if the trip has no FX rate.", inputSchema: { slug: SLUG } },
      (a) => self.run(() => getBudget(env, { space: a.slug }, self.actor)));
  }
}
