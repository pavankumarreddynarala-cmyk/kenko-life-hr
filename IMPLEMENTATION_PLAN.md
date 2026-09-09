# Implementation plan

1. Establish normalized PostgreSQL/Prisma entities and immutable identifier constraints.
2. Deliver OTP-bound employee self-service with an allow-list of editable fields.
3. Add server-authorized HR/CFO/admin workflows, audit trail, exports and QR data boundaries.
4. Implement custody, transfer acceptance/rejection/revocation as transactions.
5. Add staged import validation, reporting, offboarding asset action workflows, and undo/revision controls for a later rollout.

The requested HR/asset expansion and the Supabase/Twilio OTP provider adapters are implemented. Operational database/SMS credentials and the organisation's import/offboarding rules must be supplied before those separate rollout items can be enabled.
