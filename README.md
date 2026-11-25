# Table & Thyme

A responsive restaurant reservation site with a customer booking form and a staff dashboard for reservations, customer records, and employee roles.

## Stack

- React, TypeScript, and Vite
- Supabase Auth and Postgres for staff access and restaurant records
- GitHub Actions for linting, type-checking/building, and GitHub Pages deployment

The site can build without backend credentials. Until Supabase is configured, booking submission and staff sign-in are intentionally unavailable.

## Run locally

```sh
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Fill in the Supabase values in `.env.local` after completing the setup below. Never put a Supabase `service_role` key in the frontend or GitHub Pages variables.

## Configure Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/migrations/202611250001_initial_schema.sql`](./supabase/migrations/202611250001_initial_schema.sql).
3. Invite the first administrator from **Authentication → Users**. The database trigger creates a staff profile automatically.
4. Promote that account to administrator in the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = lower('owner@example.com');
   ```

5. Add the project URL and the public anon/publishable key to `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

   The anon/publishable key is included in the static site by design. Row-level security policies protect private records. Do not use the `service_role` key.
6. Invite other employees from **Authentication → Users**. New users receive the `staff` role. Administrators can promote or demote staff in the Team view.

Public booking requests are recorded as `pending`; a team member must confirm them. The current version does not check table capacity or prevent overlapping reservations.

## GitHub Pages deployment

1. Create a GitHub repository and push this project to its `main` branch.
2. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. In **Settings → Pages**, set the source to **GitHub Actions**.
4. Push to `main`. The workflow runs Oxlint and the TypeScript/Vite production build, then deploys the site. Pull requests run the same checks without deploying.

The Vite config automatically uses the correct path for a project Pages site and the root path for a `username.github.io` repository.

## Project checks

```sh
npm run lint
npm run build
```

## MVP boundaries

- Reservation requests, status updates, customer directory, and staff role management are included.
- Reservation requests need a staff confirmation; there is no live availability, table assignment, payment, notification, or shift scheduling yet.
- Customer contact details are available to authenticated restaurant staff. Configure Supabase Auth, review the RLS policies, and follow applicable privacy rules before using real customer data.
