# Use it from Claude (MCP)

The recommended way to enter and edit data is to **talk to Claude**. A remote MCP server
(`worker-mcp/`) exposes the same operations the browser uses, so the two can never disagree.

## Connect once

In Claude Code:

```
claude mcp add --transport http travel-planner https://<worker>.<subdomain>.workers.dev/mcp
```

The first connection goes through the Cloudflare Access sign-in (email + PIN). After that,
Claude can call the tools directly.

## What you can say

- "List entries in the *tokyo-2026 / itinerary* list."
- "Add an entry titled 'Book flights' to *tokyo-2026 / todos*, status Doing, due 2026-08-01."
- "Mark entry `en-...` done."
- "Delete entry `en-...`."

Every change is written with your email and a timestamp to the append-only audit table, so you
always know who changed what, when. The browser is the read / occasional-edit surface.
