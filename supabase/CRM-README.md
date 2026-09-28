# CubicShip CRM

`/crm.html` uses existing owner/staff authentication. Owners see all branches; managers and employees see only their assigned branch. Demo accounts cannot access real CRM records. Supabase anonymous/customer roles have no table or RPC access; all CRM operations use server-side service credentials and route-level branch scope.

Lead routing follows existing access permissions, not a confirmed staffing policy. New leads have no assigned person. Mo/Tamir still need to confirm whether stores or a central team handle follow-up. No automatic staff assignment is enabled.

Apply `crm.sql` as an additive migration before deploying this feature. It was applied to the Cubic project on 2026-09-27. Never publish service keys or put them in static assets. Required server configuration: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PORTAL_SESSION_SECRET. Service email also uses RESEND_API_KEY, QUOTE_FROM_EMAIL and QUOTE_REPLY_TO.

Website shipping/service records remain authoritative in the existing private Blob store. Successful writes attempt idempotent CRM sync. Staff can run **Sync inquiries** to backfill old requests or recover from a CRM outage; existing pipeline stages, assignments and due dates are retained. Historical requests without a captured language show “unknown,” not an inferred preference. Source audit entries and notification statuses are mirrored with stable event keys. No new messages are sent during sync or import.

External freight is a reviewed CSV import, not automatic Cognito synchronization. Use the template and preserve the external entry ID. Managers import their own branch; owners may import any registered branch. Imports never grant marketing consent.

New email-help submissions collect an email, optional name/message/branch, UI language and sanitized campaign labels. Service follow-up purpose and optional unchecked marketing consent are recorded separately. No marketing campaigns are sent. Opt-out works immediately after signup and staff can record a later customer opt-out. Before building campaigns, include a persistent signed unsubscribe link and honor `marketing_consent` and `unsubscribed_at` at send time. Consent is customer-submitted, not double-opt-in verified.

The existing Google Analytics property G-KQMJQ5RPNG remains installed alongside allowlisted aggregate counters in Supabase. GA receives `generate_lead` only after a successful saved-request response, with service type, language and branch, never customer contact fields. Safe campaign and advertising click IDs are retained for attribution; arbitrary URL parameters and private hashes are excluded. GA may use cookies and advertising identifiers. First-party counters do not save visitor IDs, form contents or GPS coordinates. GPC/DNT requests are respected. Short-lived rate-limit keys are keyed IP hashes, not raw addresses. Public analytics begin with this release; historical inquiries retain their source dates. Reports paginate in 500-row pages with a visible 5,000-record cap. Counts represent actions, not unique people or attributable individual click histories.

CRM and legacy portal service replies write a pending history entry before contacting Resend. A stable idempotency key protects retries, and accepted/failed/uncertain status is visible. “Accepted” is not delivery confirmation. Incoming replies and delivery events remain in the configured email inbox/provider. Native inquiry acknowledgements continue through the existing notification system.

Verification: `npm test`; local browser fixtures exercise the UI without real messages. The database was also checked in a rollback-only transaction for deduplication, consent withdrawal, branch restrictions, concurrent edits, rate limiting and privilege denial.

Rollback: restore the previous Vercel production deployment. Leave the additive CRM tables in place so collected leads and history are retained. No existing shipment data or customer-account schema was removed.
