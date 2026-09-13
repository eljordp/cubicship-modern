# Consumer DHL shipping update — September 13, 2026

Audience confirmed by owner: primarily individuals using DHL Express. This updates the existing cubicship.com project (eljordp/cubicship-modern, Vercel cubicship-modern); no replacement project or storage service is created.

- Homepage and branch calls to action lead to /ship.html. The guest form offers a minimal quote request and a full drop-off preparation path, with document/package choice, packing help, optional weight/dimensions, pickup inquiry, review and a saved request code.
- Existing customer-shipments endpoint and branch queue are reused. Online requests are validated separately; existing counter QR input remains supported. New requests stay in the branch queue, with their intent and package details visible and included in staff copy text.
- Online confirmation returns only the code/status/branch. Request retries reuse an opaque request ID. Online intake is saved before staff email; the complete store is not rewritten after waiting on email. Email delivery is not required for a saved request to remain available to staff.
- The existing Blob store still uses a whole-file read/write model. These changes do not claim cross-instance transactional idempotency or eliminate the pre-existing concurrent-write risk. A transactional store migration is separate work.
- Quotes, collection availability, item eligibility and final charges remain staff-confirmed. No automatic carrier rating/label purchase, payment or confirmed pickup has been introduced. Existing account features and Cognito intake for freight/other services remain available.
- Public account wording is now Customer Dashboard, with a guest path. Company is shown only for business registration.
- Location search is placed directly after the page heading. CSS now respects hidden results; earlier audit checked the count but did not verify that nonmatches disappeared. ZIP 60455 now visibly leaves only Bridgeview. Opening-soon locations cannot receive online guest requests.
- Branch pages link to existing Google listings for current hours and advise calling for the last collection. No unverified operating hours, price or response-time SLA is fabricated.

Validation: ten Node tests cover quote/drop-off requirements, invalid/inactive branches, invalid fields, saved receipts, branch routing, retry behavior, notification and storage failures, rate limits, and existing QR compatibility. Chrome browser tests used a local server running the real endpoint with in-memory storage and mocked email: quote-first and full drop-off both returned the correct branch code. Mobile homepage/form/location checks passed at 390px without horizontal overflow. All modified inline scripts parse; new form/quote/all 15 branch pages passed duplicate-ID and local-link checks. No real customer request or carrier booking was created during tests.

The local test server and temporary editing scripts are outside the repository and are not deployed. Tests, tools, docs and environment files are excluded from deployed static files.
