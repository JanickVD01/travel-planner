"use strict";
/* PostHog analytics — effort 0016. PostHog Cloud EU (Frankfurt).

   The KEY below is PostHog's PUBLIC, write-only project ingest token — designed to live in client code
   (it cannot read data), so committing it to a public repo is expected and safe, per PostHog's design.

   Init is DEFERRED to app boot (app.js calls Analytics.init(state.me)) so that:
     - demo/preview deployments (no DB → mock identity) are NOT tracked, keeping prod data clean; and
     - we identify the real signed-in user (email from /api/me) with no anonymous phase.
   Every call is guarded, so a blocked or absent SDK (e.g. an ad-blocker eats *.posthog.com) can never
   break the app — analytics just silently does nothing.

   PostHog's library (array.full.js) is loaded by a plain <script src> from the EU assets host in
   index.html (allowed by script-src 'self' https://*.posthog.com — no inline snippet, so no
   'unsafe-inline'). Session replay is intentionally OFF here (it needs a worker-src CSP change + text
   masking for personal trip data — a deliberate follow-up). */

window.Analytics = {
  KEY: "phc_D65xJQ7NVMdx2ZjhQguWwm7bjUzWJSRhSBeceq8Knkjn",
  ready: false,

  // Called once from boot() with the resolved identity. No-op in demo/preview, or if the SDK didn't load.
  init(me) {
    if (this.ready || !window.posthog || !me || me.mock || !me.email) return;
    try {
      posthog.init(this.KEY, {
        api_host: "https://eu.i.posthog.com",   // EU ingestion (GDPR data residency)
        ui_host: "https://eu.posthog.com",       // so any deep links resolve to the EU app
        persistence: "memory",                    // no cookie/localStorage → no consent banner needed
        person_profiles: "identified_only",       // no anonymous person records
        respect_dnt: true,                         // honour Do-Not-Track / GPC
        capture_pageview: false,                   // hash router → we send $pageview manually (see app.js route())
        capture_pageleave: true,
        capture_exceptions: true,                  // error tracking: unhandled errors + promise rejections
        disable_session_recording: true,           // replay is a deliberate follow-up (CSP worker-src + masking)
      });
      posthog.identify(me.email, { email: me.email });
      this.ready = true;
    } catch (_) { /* never let analytics break the app */ }
  },

  // Manual pageview for the hash router (route() has no real pathname, so we tag the hash route).
  pageview(route) {
    if (this.ready && window.posthog) { try { posthog.capture("$pageview", { route: route }); } catch (_) {} }
  },

  // Deliberate usage event helper (e.g. Analytics.capture("trip_created", {...})).
  capture(event, props) {
    if (this.ready && window.posthog) { try { posthog.capture(event, props); } catch (_) {} }
  },
};
