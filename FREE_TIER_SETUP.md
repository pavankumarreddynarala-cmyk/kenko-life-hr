# Free-tier setup: Vercel + Supabase

This is the best **no-cost development, demo, and pilot** configuration for this project. It is not a compliant permanent production configuration for a commercial company application: Vercel states that its Hobby plan is for personal, non-commercial use, and its limits can stop service when exhausted. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel pricing](https://vercel.com/pricing).

## What is free, and its limits

| Service | Use in this application | Free-tier reality |
| --- | --- | --- |
| Vercel Hobby | Next.js hosting and API routes | Free for personal/non-commercial development only; do not use it as the company's live production host. |
| Supabase Free | Shared PostgreSQL database and optional real-time service | 500 MB database, 1 GB storage, 50,000 MAUs; inactive projects can pause after one week. [Current limits](https://supabase.com/pricing) |
| Email magic links | Employee portal authentication | Supabase Auth includes email authentication; its default mailer is rate-limited and intended for testing. |

## Recommended no-cost pilot authentication

Use Supabase Email Auth for both development and deployment. Its built-in mailer is suitable for initial testing; configure custom SMTP before production use for delivery reliability and control.

## Step-by-step: Supabase database

1. Create a personal Supabase account at [supabase.com](https://supabase.com) and choose **New project** on the Free plan.
2. Select a region close to your users, create a strong database password, and save it in a password manager.
3. In **Project Settings → Database → Connect**, copy both connection strings:
   - Transaction pooler URL for `DATABASE_URL`.
   - Direct connection URL for `DIRECT_URL`; migrations use this path.
4. In the project folder, copy `.env.example` to `.env`, then replace `PROJECT_REF`, `REGION`, and `PASSWORD` with the values from Supabase. Never commit `.env`.
5. Install Node.js LTS, then run:

   ```powershell
   npm install
   npm run prisma:generate
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```

6. Open `http://localhost:3000/login`. The seed demo password is only for local testing; replace it before inviting anyone.
7. In Supabase, monitor **Database → Usage**. Export data routinely because automatic backups are not included on the Free plan.

## Step-by-step: Vercel preview deployment

1. Create a private GitHub repository and push the `kenko-life-hr` folder.
2. Create a personal Vercel account and select **Add New → Project**.
3. Import the repository. Set the root directory to `kenko-life-hr`.
4. In **Settings → Environment Variables**, add:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET` — create a random unique string of at least 32 characters.
   - `APP_URL` — the public application origin.
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Supabase Email Auth.
5. In **Supabase → Authentication → URL Configuration**, add `${APP_URL}/employee` to Redirect URLs. Enable the Email provider with email confirmation, leave password-based employee sign-in disabled, and configure custom SMTP before production.
6. Deploy. Vercel gives a `*.vercel.app` preview URL that admins can use to test the shared Supabase database.

## Step-by-step: give users access

1. Sign in as the seeded administrator in the pilot.
2. Open **Master Data** and create Companies, Locations, Cities, Branches, Departments, Designations, and Cost Centres.
3. Create management accounts with the intended HR and CFO roles. Do not distribute the seeded account.
4. Share the employee invitation URL `/employee`. Employees enter their email and can authenticate before an Employee Code exists; new employees receive their code after onboarding.
5. All users access the same cloud database. The Master Data module refreshes every 10 seconds; it does not require copying files between computers.

## Before moving past pilot use

- Move Vercel to a commercial plan or a commercial host.
- Configure custom SMTP, a branded magic-link template, and an approved sender domain in Supabase Auth.
- Replace demo passwords with an approved login and reset process.
- Enable backups and retention, set alerting for quota usage, and use a custom domain with HTTPS.
