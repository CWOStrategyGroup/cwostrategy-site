# Security & Operations — CWO Strategy Group

Everything here is current as of the client-portal launch. Two items at the top
require action from a human; the rest is already live.

---

## ⚠️ Action required

### 1. Security headers are not being served

The live origin is **GitHub Pages**, which ignores both `netlify.toml` and
`_headers`. Right now the site is served with **no CSP, no HSTS, and no
X-Frame-Options**, regardless of what those files say.

Fix this at the Cloudflare edge. In the Cloudflare dashboard for
`cwostrategy.com`:

**Rules → Transform Rules → Modify Response Header → Create rule**

- Rule name: `Security headers`
- If: `Hostname equals cwostrategy.com`
- Then, *Set static* for each of the following:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=()` |
| `Content-Security-Policy` | see below |

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://ajfekzqnajmcpcvqadtj.supabase.co; manifest-src 'self'; upgrade-insecure-requests
```

> **`connect-src` must include the Supabase origin.** Without it the client
> portal cannot sign in or load analytics. This is the single most common way
> to break the portal.

Verify afterwards with `curl -sI https://cwostrategy.com | grep -i content-security`.

### 2. Analytics will stay empty until two secrets are set

The portal is wired and working, but no traffic data will appear until the
Cloudflare sync can authenticate.

1. **Cloudflare → Analytics & Logs → Web Analytics.** Confirm `cwostrategy.com`
   has a site there. Copy its **Site Tag**.
2. **Cloudflare → My Profile → API Tokens → Create Token → Custom token.**
   - Permission: **Account → Account Analytics → Read**
   - Account resources: your account
   - Copy the token; it is shown once.
3. **Supabase → Project Settings → Edge Functions → Secrets.** Add:
   - `CF_API_TOKEN` — the token from step 2
   - `CF_ACCOUNT_ID` — your Cloudflare account ID (Cloudflare dashboard sidebar)
   - `LEAD_IP_SALT` — any long random string, e.g. `openssl rand -hex 32`
4. Record the site tag against the site row:
   ```sql
   update public.client_sites
      set cf_site_tag = 'PASTE_SITE_TAG_HERE'
    where domain = 'cwostrategy.com';
   ```
5. Run the sync once to backfill:
   ```bash
   curl -X POST \
     'https://ajfekzqnajmcpcvqadtj.supabase.co/functions/v1/sync-cloudflare-analytics?days=30' \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

---

## Architecture

```
Visitor ──► Cloudflare (DNS, TLS, CDN, Web Analytics)
                │
                ▼
          GitHub Pages  ← static HTML/CSS/JS, no build step
                │
      browser fetch (CORS)
                │
                ▼
            Supabase
        ├── Auth ........... passwordless magic link, signup closed
        ├── Postgres ....... all tenant data, protected by RLS
        └── Edge Functions
              ├── submit-lead ................ public, rate limited
              └── sync-cloudflare-analytics .. service-role only, scheduled
```

There is **no application server**. Authorization is enforced by Postgres
row-level security, not by code that could be bypassed.

---

## Security model

**Tenant isolation.** Every tenant-scoped table has RLS enabled *and forced*.
A signed-in user can read only rows belonging to a client they are a member of.
`portal_summary()` is `SECURITY INVOKER`, so those policies apply to it too, and
it derives the tenant from `auth.uid()` — the client never sends an id, so there
is no IDOR surface.

**Verified by attack test**, not by assumption. All of these are blocked:

| Attempt | Result |
|---|---|
| Read another tenant's analytics | 0 rows (RLS) |
| Forge analytics rows | permission denied |
| Add self to another tenant | permission denied |
| File a request against another tenant | RLS policy violation |
| Read the internal sync log | permission denied |
| Anonymous read of any table | permission denied |

**The publishable key in `auth.js` is public by design.** It grants nothing.
`anon` has no grants anywhere in the `public` schema.

**Helper functions live in a `private` schema** that PostgREST does not expose,
so they are usable inside RLS policies but unreachable over the API.

**Never put the `service_role` key in any file in this repo.** It bypasses RLS
entirely. It belongs only in Supabase Edge Function secrets.

---

## Adding a client

```sql
-- 1. create the tenant
insert into public.clients (name, slug, contact_email)
values ('Acme Bakery', 'acme-bakery', 'owner@acmebakery.com');

-- 2. attach their website (site tag from Cloudflare Web Analytics)
insert into public.client_sites (client_id, domain, label, cf_site_tag)
select id, 'acmebakery.com', 'Main site', 'THEIR_SITE_TAG'
from public.clients where slug = 'acme-bakery';

-- 3. authorise the person who will sign in
select private.add_client_contact('acme-bakery', 'owner@acmebakery.com');
```

Then **Supabase → Authentication → Users → Invite user** with that email.
When they accept, a trigger links them to the tenant automatically.

An email that is not pre-authorised in step 3 can still receive a link, but will
see "this account isn't linked to a client" and no data.

---

## Where the data lives

| What | Where | Who can read it |
|---|---|---|
| Client analytics | `daily_metrics`, `page_metrics`, `source_metrics` | that client only |
| Change requests | `portal_requests` | that client only |
| Contact-form leads | `leads` | staff only (service role) |
| Invite allowlist | `client_invites` | staff only |
| Sync audit log | `sync_runs` | staff only |

Read leads in the Supabase dashboard, or:
```sql
select created_at, name, email, company, budget, message
from public.leads where status = 'new' order by created_at desc;
```

---

## Known gaps, stated honestly

- **Keyword rankings are not connected.** Cloudflare Web Analytics measures
  traffic, not search position. The `keyword_rankings` table exists and the
  portal renders it when populated, but it is deliberately empty rather than
  filled with estimates. Connecting Google Search Console would close this.
- **Uptime and Core Web Vitals are not connected.** The portal says so rather
  than showing invented figures.
- **Unique visitors are not available** from Cloudflare RUM. The third KPI is
  pages-per-visit, which is derived from data we genuinely have.
- **Sign-in tokens live in `sessionStorage`**, so a cross-site scripting bug
  could read them. The CSP above is the mitigation — which is why item 1 at the
  top of this file matters.

---

## Scheduling the daily sync

Supabase → Integrations → Cron, or:

```sql
select cron.schedule(
  'cloudflare-analytics-daily', '0 5 * * *',
  $$select net.http_post(
      url := 'https://ajfekzqnajmcpcvqadtj.supabase.co/functions/v1/sync-cloudflare-analytics?days=3',
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_key'))
  )$$
);
```

Check it ran: `select * from public.sync_runs order by started_at desc limit 5;`
