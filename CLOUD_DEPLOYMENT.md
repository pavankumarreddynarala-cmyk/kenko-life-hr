# Cloud deployment and shared access

This application is designed for one shared PostgreSQL database. That is what makes master-data changes, employee records, asset transfers, and audit entries visible to every authorized administrator and employee from any device.

## Recommended production architecture

| Component | Recommended service | Purpose |
| --- | --- | --- |
| Application | Vercel (Mumbai region) | HTTPS Next.js application with automatic deployments |
| Database | Neon, Supabase, AWS RDS, or Vercel Postgres | Managed PostgreSQL database shared by all users |
| OTP | MSG91, Twilio, or a verified WhatsApp/SMS provider | Production OTP delivery |
| Rate limiting | Upstash Redis | Durable throttling across cloud instances |
| Files | S3 / Vercel Blob | Staged Excel imports and generated exports |

## Deploy to Vercel

1. Put `kenko-life-hr` in a private GitHub repository.
2. Import that repository in the organisation's Vercel account, then set the root directory to `kenko-life-hr`.
3. Provision a managed PostgreSQL database and add its pooled connection string as `DATABASE_URL`.
4. Set `JWT_SECRET` to a unique 32+ character secret. Configure either `OTP_PROVIDER=supabase` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`, or `OTP_PROVIDER=twilio` with all three `TWILIO_*` variables. Do **not** use `DEV_OTP`.
5. Run `npx prisma migrate deploy` against the production database. The migration installs constraints, indexes, generated timestamp/CODE triggers, and RLS policies. Run the seed script only for a private demo.
6. Assign your custom domain and use Vercel's HTTPS redirect.

Never use the local demo password in production. Replace management authentication with your approved identity provider or carefully managed password reset workflow before inviting staff.

## Shared updates

The Master Data page polls the cloud API every 10 seconds, so additions appear across signed-in users without a browser reload. For instantaneous push at larger scale, configure a provider such as Ably, Pusher, or Supabase Realtime and emit events after transaction commits; the cloud database remains the source of truth.
