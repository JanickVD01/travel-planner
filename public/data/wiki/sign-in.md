# Sign in

This app sits behind **Cloudflare Access** — there are no passwords.

1. Open the app URL (`travel-planner.pages.dev`, or your custom domain).
2. Enter an **allowed email address**. If your address isn't on the allow-list, you're denied.
3. Cloudflare emails you a **one-time PIN**. Enter it.
4. You're in. Your email is recorded as the actor for every change you make (the audit trail).

To add or remove who can sign in, edit the **Access policy** in the Cloudflare Zero Trust
dashboard (Access → Applications → *Travel Planner* → Policies). The free plan covers up to 50 users.
