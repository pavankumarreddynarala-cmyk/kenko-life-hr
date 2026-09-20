# Implementation plan

1. Establish normalized PostgreSQL/Prisma entities and immutable identifier constraints.
2. Deliver OTP-bound employee self-service with an allow-list of editable fields.
3. Add server-authorized HR/CFO/admin workflows, audit trail, exports and QR data boundaries.
4. Implement custody, transfer acceptance/rejection/revocation as transactions.
5. Add staged import validation, reporting, offboarding asset action workflows, and undo/revision controls for a later rollout.

The requested HR/asset expansion and the Supabase/Twilio OTP provider adapters are implemented. Operational database/SMS credentials and the organisation's import/offboarding rules must be supplied before those separate rollout items can be enabled.

## HR & Asset Management expansion (this round)

Delivered:
- Roles expanded to ADMIN/CEO/COO/HR/CFO (all equal, full management permissions via `MANAGEMENT_ROLES`) plus the restricted EMPLOYEE role.
- Employee Portal authentication moved from mobile OTP to email OTP (mobile number is now a regular profile field, not the login identifier).
- Employee Master: soft delete + restore, Edit repositioned to the front of each row, button placement.
- Asset Register: automatic book (SLM/WDV) and income-tax (WDV block, 180-day rule) depreciation calculation (`src/lib/depreciation.ts`, unit-tested), year/month/multi-year period selection, a fixed disposal-reason dropdown, a 9-group edit form, QR moved to the end of each row, bulk QR ZIP download.
- QR scan page (`/qr/[token]`) rewritten to actually enforce role/ownership server-side — previously it leaked basic asset info to anyone with the link.
- Master Data: Company hidden from this admin section (still used everywhere else); a new generic "+ Add Master" system (`CustomMasterType`/`CustomMasterValue`) for defining new master categories without code changes.
- Import/Export: real upload → validate → review-errors → confirm pipeline for Employees and Assets, sharing one column-definition source of truth with the downloadable templates so they can't drift apart.
- Dashboard and Audit Log button placement brought in line with the spec.

Known gaps, called out rather than silently shipped:
- The Asset Register **table** still uses a single flat header row; the 9 field groups are fully reflected in the Add/Edit form but not as a visual multi-level table header.
- The left navigation is still a flat list, not nested into Employee Management / Asset Management / Administration sections.
- Migrations were authored by hand (no live database was available while building) — run `npx prisma migrate deploy` and exercise every flow (including direct URL/API access per role, QR scanning as different roles, and a real import) before relying on this in production.

