# Fish Restaurant

A responsive restaurant reservation site with staff access, built as a practical DevOps learning project.

## Application stack

- React, TypeScript, and Vite
- Supabase Auth and Postgres for staff access and restaurant records
- GitHub Pages for the public static site

The site builds without backend credentials. Until Supabase is configured, booking submission and staff sign-in are intentionally unavailable.

## Development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` after configuring Supabase. Never put a Supabase `service_role` key in the frontend or GitHub variables.

## Supabase setup

1. Create a Supabase project.
2. In order, run [`supabase/migrations/202611250001_initial_schema.sql`](./supabase/migrations/202611250001_initial_schema.sql) and [`supabase/migrations/202611250002_table_selection_and_preorders.sql`](./supabase/migrations/202611250002_table_selection_and_preorders.sql) in the Supabase SQL Editor.
3. Replace the sample tables and menu items seeded by the second migration with the restaurant’s actual floor plan, prices, currency, and menu. The current sample layout, USD prices, and displayed 5–10 pm daily hours are placeholders; the booking flow assumes a two-hour table reservation and interprets times in the guest’s browser timezone.
4. Invite the first administrator from **Authentication → Users**. The database trigger creates a staff profile.
5. Promote that account in the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = lower('owner@example.com');
   ```

6. Add the project URL and public anon/publishable key to `.env.local`.
7. Invite other employees from **Authentication → Users**. New users receive the `staff` role. Administrators can promote or demote employees in the Team view.

Guests can choose an available table sized for their party and optionally add menu items to their reservation. Availability checks and reservation creation run in database functions; creation locks the selected table and rejects overlapping pending or confirmed reservations. Pre-order item names and prices are snapshotted for the staff reservation list. Requests are stored as `pending` until staff confirm them. No online payment is collected.

Without Supabase configured, the site displays sample tables and menu items for preview, but does not submit bookings. After Supabase is configured, the floor plan and menu are read from the database, so update the seeded placeholder data before accepting real reservations.

## Automated development and deployment

The GitHub Actions workflow runs for pull requests and pushes to `main`:

1. Install from the lockfile, lint, and audit production dependencies.
2. Run Vitest component tests.
3. Type-check and build the production site.
4. Serve the built app and smoke-test its HTML, JavaScript, and CSS assets.
5. Upload the site to GitHub Pages. Pull requests do not deploy.
6. On pushes to `main`, also build and publish a container tagged with the commit SHA and `latest` to GitHub Container Registry (GHCR).

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions → Variables** to enable the real backend in Pages and container builds. The anon/publishable key is public by design; row-level security protects private records. Do not configure a service-role key.

## Local Docker and blue/green Kubernetes demo

This is a **local learning/demo cluster**, not a hosted production cluster. It requires Docker Desktop to be running, plus `kubectl` and [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/). It uses no cloud resources.

Create a local cluster and deploy:

```powershell
kind create cluster --name fish-devops
npm run k8s:deploy
kubectl port-forward --namespace fish service/fish-active 8080:80
```

Open `http://localhost:8080`. `k8s:deploy` builds the container, loads it into Kind, waits for the inactive deployment to become ready, checks its HTTP response, then changes the `fish-active` Service selector. Both blue and green deployments remain available.

Deploy another version with `npm run k8s:deploy`. Switch traffic back to the previous healthy version with `npm run k8s:rollback`. Both commands accept `--cluster` and `--port` options; `k8s:deploy` also accepts `--image <registry/image:tag>` to use an already-published image.

The Kubernetes pods use a non-root Nginx image, read-only root filesystem, dropped Linux capabilities, resource limits, and HTTP readiness/liveness probes.

## Tests and checks

```powershell
npm run lint
npm test
npm run build
npm run test:integration
```

## Scope and next steps

- The broker is deliberately deferred: the current booking RPC is synchronous and has no background email/notification worker to queue.
- This free setup does not provide a public Kubernetes endpoint or cloud blue/green deployment. A real hosted cluster needs a cloud account and budget.
- Customer contact details are available to authenticated restaurant staff. Configure Supabase Auth and review the RLS policies and applicable privacy rules before using real customer data.
