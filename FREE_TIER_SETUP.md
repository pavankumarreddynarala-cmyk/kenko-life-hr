# Free-tier setup: Vercel + Supabase

This is the best **no-cost development, demo, and pilot** configuration for this project. It is not a compliant permanent production configuration for a commercial company application: Vercel states that its Hobby plan is for personal, non-commercial use, and its limits can stop service when exhausted. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel pricing](https://vercel.com/pricing).

## What is free, and its limits

| Service | Use in this application | Free-tier reality |
| --- | --- | --- |
| Vercel Hobby | Next.js hosting and API routes | Free for personal/non-commercial development only; do not use it as the company's live production host. |
| Supabase Free | Shared PostgreSQL database and optional real-time service | 500 MB database, 1 GB storage, 50,000 MAUs; inactive projects can pause after one week. [Current limits](https://supabase.com/pricing) |
| Phone OTP | Employee portal authentication | Supabase Auth still requires a configured SMS provider. The app also supports Twilio Verify directly. |

## Recommended no-cost pilot authentication

Use the local-only `DEV_OTP` flow solely for development. For a deployed employee portal, configure Supabase Phone Auth with its supported SMS provider or select the built-in Twilio Verify adapter. A genuine SMS service cannot safely be promised at zero recurring cost.

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
   - `OTP_PROVIDER=development` and `DEV_OTP` only for a private demo; production startup rejects development OTP requests.
   - For Supabase OTP: `OTP_PROVIDER=supabase`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`.
   - For Twilio Verify: `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`.
5. Deploy. Vercel gives a `*.vercel.app` preview URL that admins can use to test the shared Supabase database.
6. Remove `DEV_OTP`, create real accounts, and choose a production auth method before any real employee records are entered.

## Step-by-step: give users access

1. Sign in as the seeded administrator in the pilot.
2. Open **Master Data** and create Companies, Locations, Cities, Branches, Departments, Designations, and Cost Centres.
3. Create management accounts with the intended HR and CFO roles. Do not distribute the seeded account.
4. Share the employee portal URL `/employee` only after replacing development OTP with Supabase Phone Auth or Twilio Verify.
5. All users access the same cloud database. The Master Data module refreshes every 10 seconds; it does not require copying files between computers.

## Before moving past pilot use

- Move Vercel to a commercial plan or a commercial host.
- Enable real SMS OTP with a verified provider and Indian DLT compliance if mobile OTP is retained.
- Replace demo passwords with an approved login and reset process.
- Enable backups and retention, set alerting for quota usage, and use a custom domain with HTTPS.
