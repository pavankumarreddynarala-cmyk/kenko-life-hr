# The Kenko Life — HR & Asset Portal

A Next.js 15 portal for governed employee master data, fixed assets, employee-to-employee transfer approvals, onboarding, QR identification, and append-only audit history. PostgreSQL/Supabase is the system of record; the application does not silently fall back to local storage.

## Local setup

1. Copy `.env.example` to `.env` and provide `DATABASE_URL`, `DIRECT_URL`, and a 32+ character `JWT_SECRET`.
2. Install and prepare the database:

   ```powershell
   npm install
   npm run prisma:generate
   npx prisma migrate deploy
   $env:BOOTSTRAP_ADMIN_PASSWORD="<choose a strong password>"; npm run bootstrap:admin
   ```

3. In Supabase Auth, enable Email authentication and add `http://localhost:3000/employee` to the allowed redirect URLs.
4. Run `npm run dev`, then open `/login` for management or `/employee` for employee email access.

There are no default or sample accounts. `npm run bootstrap:admin` creates the first administrator (`pavan@thekenkolife.com`, override with `SUPER_ADMIN_EMAIL`) and the "Kenko Life" company. Only that account sees the **Logins** page and can create or reset every other Admin, HR or CFO login; the server rejects the request for anyone else.

### One-time data purge (brief R2)

`npm run purge:all -- --confirm` writes a full backup to `backups/` (git-ignored; contains personal data and password hashes, store it securely), then asks you to type `DELETE ALL DATA` and permanently truncates every table. Afterwards run `npm run bootstrap:admin` and change `JWT_SECRET` so old sessions stop working. The purge cannot be undone.

### Test employee email authentication locally

The employee portal uses Supabase Auth email magic links. PostgreSQL remains required for employee lookup, onboarding, transfers, and audit events. A missing or unreachable database is shown as an actionable message in `/employee` rather than a Next.js runtime overlay.

1. Copy `.env.example` to `.env.local`.
2. Set working `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` values. Keep `APP_URL=http://localhost:3000`.
3. In **Supabase → Authentication → Providers**, enable Email. In **URL Configuration**, add `http://localhost:3000/employee` as an allowed redirect URL.
4. Run `npx prisma migrate deploy`, then `npm run dev`.
5. Open `/employee`, enter an email address, and open the one-time link delivered by Supabase.

An employee record is not required before requesting a link. Existing employees are matched by email; new employees continue to the existing onboarding form and receive an Employee Code only after submitting it.

## Employee CODE

Employee Code is the highest existing number in Employee Master plus one (`EMP0001`, `EMP0002`, …), allocated on the server inside a transaction guarded by a database advisory lock, so simultaneous additions never receive the same number. Editing an employee never changes the number; CODE is recalculated from it. `CODE` is recalculated from controlled master data in this exact order:

`CITY-OUTLET_MODEL-SPECIAL_OR_AREA-NO_OF_OUTLETS-DEPARTMENT-EMPLOYEE_ROLE-EMPLOYEE_NUMBER`

For example, Employee Code `EMP0001` with the corresponding configured codes becomes `BLR-COR-IDN-1-TCWG-CEO-0001`. CODE remains empty until every dependent field is configured. CTC fields are intentionally not part of this portal.

## Supabase email authentication

Employee authentication requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `APP_URL`. Enable the Email provider in Supabase Auth and allow `${APP_URL}/employee` as a redirect URL. The application asks Supabase to create an Auth identity when necessary, verifies the returned access token with Supabase on the server, and then issues its own httpOnly, employee-scoped session. The Supabase access token is removed from the browser URL immediately and is not persisted by the application.

Supabase controls email templates, SMTP delivery, link expiry, and rate limits. Keep email confirmation enabled, and do not enable password-based employee sign-in: the server accepts only Supabase sessions whose verified authentication method is email OTP/magic link. Configure a custom SMTP provider and branded magic-link template for production. Twilio, SMS configuration, `OTP_PROVIDER`, and `DEV_OTP` are not used.

## Supabase deployment

1. Create a Supabase project and copy its pooled connection string to `DATABASE_URL` and direct connection string to `DIRECT_URL`.
2. Run `npx prisma migrate deploy`. The baseline migration creates relational foreign keys, unique and partial indexes, domain checks, generated timestamps, the Employee Code sequence/CODE trigger, and RLS.
3. Run `npm run bootstrap:admin` once to create the first administrator.
4. Enable Supabase Email Auth, configure production SMTP, allow `${APP_URL}/employee` as a redirect URL, and deploy the Next.js server with the same environment variables.

The server uses Prisma through the database owner/service connection. RLS denies direct PostgREST access by default and exposes read-only policies for authenticated Supabase users on non-sensitive master/asset tables. Employee portal authorization is enforced again in server routes using httpOnly signed sessions and ownership checks.

## Asset Register (Stage 2)

- **Years:** the list runs from FY 2019-20 to the running financial year (1 April to 31 March). "Add next year" appends one year per click (ADMIN/CFO).
- **Depreciation:** `src/lib/depreciation.ts` is a pure, unit-tested engine. Companies Act: straight line to residual value, actual days held ÷ days in the FY (366 in a leap-year FY), full month = annual ÷ 12, part month prorated by days, stops at residual. Income Tax: block-wise WDV, half rate for additions used under 180 days, sale value deducted from the block. Useful life, residual % and block rates are data on the **Depreciation Setup** page; the starter rows are placeholders marked "To verify".
- **QR scan:** `/api/qr-scan/<token>` is live (never cached) and enforced on the server. ADMIN gets every group; HR, CFO and employees get Group 1, Group 2 and the custodian only. Camera access needs HTTPS.

## Main workflows

- **Employee Master:** governed master dropdowns, dynamic CODE, add/edit, full per-column filters, masked exports.
- **Asset Register:** add/edit, governed location fields, full per-column filters, stable QR detail links, labelled SVG downloads.
- **Transfers:** management transfers with effective/registered dates and editable history; employee outgoing/incoming requests with recipient approval or decline. Assignment, status, event, and audit writes share a transaction.
- **Employee Portal:** Supabase email magic-link authentication, existing-employee detection, validated Indian onboarding, My Assets, and Requests.
- **Audit:** actor, role, action, entity, timestamp, and before/after/details for portal mutations.

See [FREE_TIER_SETUP.md](./FREE_TIER_SETUP.md) and [CLOUD_DEPLOYMENT.md](./CLOUD_DEPLOYMENT.md) for hosting guidance.
