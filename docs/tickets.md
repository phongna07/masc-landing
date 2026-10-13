# Ticket operations and PayOS setup

## Deployment prerequisites

The implementation uses the official `@payos/node` v2 SDK, hosted Vietnamese bank-transfer checkout, signed webhook verification, and authenticated/signed payment-request lookups. Read the [PayOS getting-started guide](https://payos.vn/docs/), [API reference](https://payos.vn/docs/api/), [Node SDK guide](https://payos.vn/docs/sdks/back-end/node/), [webhook reference](https://payos.vn/docs/du-lieu-tra-ve/webhook/), and [official SDK repository](https://github.com/payOSHQ/payos-lib-node).

PayOS [does not provide a separate sandbox](https://payos.vn/docs/moi-truong-test/). A signed locally prepared fixture is a manual simulation, not proof that PayOS or a receiving bank verified a transfer. Real end-to-end verification requires an explicitly authorized production-channel payment. Do not initiate payments, apply migrations, or run simulations against an unconfirmed database.

1. Create a PayOS account, complete its individual/business verification, link the intended receiving bank account, and create a payment channel. Confirm the bank and channel with the organizer. Obtain the channel's client ID, API key, and checksum key.
2. Confirm the database deployment target before applying the checked-in migrations with `pnpm db:migrate` from `/home/phong/masc-landing`. Ticket migrations include `0018_left_talisman.sql`, `0019_chunky_azazel.sql`, `0020_messy_serpent_society.sql`, and `0021_curious_gunslinger.sql`. Apply `0021` before deploying the reconciliation code that uses its lease and pending-notification tokens. `0019` deliberately creates the buyer/order unique index before adding its dependent foreign key. Never use `db:push` as routine validation.
3. Supply the following through deployment secrets, or the gitignored `apps/web/.env` for local development. Never prefix these variables with `NEXT_PUBLIC_`:

   | Variable | Meaning |
   | --- | --- |
   | `PAYOS_CLIENT_ID` | Client ID of the verified payment channel |
   | `PAYOS_API_KEY` | Server API key for that channel |
   | `PAYOS_CHECKSUM_KEY` | Signature verification/signing key for that channel |
   | `TICKET_APP_URL` | Application origin, such as your actual HTTPS deployment URL; no path, query, fragment, or embedded credentials |
   | `TICKET_WORKER_SECRET` | Random secret with at least 32 characters, shared only with the scheduler |

   These are validated in `packages/env/src/server.ts`. They are optional while ticket sales are disabled so the existing application can run without a PayOS channel; attempting checkout without the four PayOS/base-URL settings fails before an order or reservation is created. Do not bypass environment validation or supply dummy secrets. Configure the worker before opening sales.
4. Keep `BETTER_AUTH_URL`, `CORS_ORIGIN`, the Google OAuth application's allowed origin/callback, and `TICKET_APP_URL` consistent. Existing Better Auth Google wiring remains in use. Next.js must run the ticket handlers in the Node runtime with outbound access to PayOS and Neon HTTPS **and WebSockets**. The ticket transaction helper uses the installed Neon `Pool` driver with `ws`; the rest of the repository keeps its existing HTTP database client. Interactive transactions and row locks are [supported through Neon Pool](https://github.com/neondatabase/serverless#sessions-transactions-and-node-postgres-compatibility).
5. Retain the existing email configuration: `MAIL_USERNAME`, `PRIMARY_EMAIL_SERVICE`, ZeptoMail URL/token, and Maileroo sending key. Verify the sending domain and attachment delivery with the selected service. Ticket jobs use a separate queue, not competition `email_queue` fields. PNG attachments use the documented [ZeptoMail attachment fields](https://www.zoho.com/cpaas/help/api/email-sending.html) and [Maileroo attachment fields](https://maileroo.com/docs/api-reference/emails/send-email). Tracking is disabled for ticket emails; there are no public QR image URLs.

## URLs and webhook registration

- Webhook: `TICKET_APP_URL` + `/api/tickets/payos/webhook`.
- Return and cancel destinations: `TICKET_APP_URL` + `/tickets/orders/<local-order-UUID>` for each order. PayOS may append presentation parameters; the application never uses them as payment evidence.
- Root admins can use **Register and confirm webhook** on `/admin/tickets`. This calls `payos.webhooks.confirm` for the configured webhook URL. Alternatively, register the same URL in the payment-channel dashboard and complete its confirmation. Make the deployed endpoint publicly reachable before registration, without a login redirect, deployment password, or proxy challenge.
- The channel-confirmation sample is signature-verified and durably stored as a sample. Its exact documented identifiers are recognized; it cannot issue tickets. Unknown signed orders are stored as unmatched alerts. Invalid JSON/schema/signatures receive 400; a storage/configuration failure receives 503. A successful acknowledgment means the receipt is durable or was already recorded, not that tickets must have been issued synchronously.
- Browser return/cancel parameters and client-side success flags cannot confirm payment. Cancellation uses an authenticated server-side PayOS cancellation response. An ambiguous cancellation keeps its reservation until confirmed cancellation or local expiry.

## Scheduler and recovery

Deploy an external scheduler that sends **POST** `/api/tickets/worker` every minute, with the header `Authorization: Bearer <TICKET_WORKER_SECRET>`. Keep this credential in scheduler secret storage. The endpoint is not a public GET cron URL. A configured request has this shape; do not run it against an unconfirmed deployment:

```sh
curl --fail --request POST \
  --header "Authorization: Bearer $TICKET_WORKER_SECRET" \
  "$TICKET_APP_URL/api/tickets/worker"
```

Allow up to 300 seconds for this Node route; it processes at most four orders and two email jobs per invocation. Configure the platform/scheduler's request timeout accordingly. With a larger backlog, invoke more frequently or increase deployment throughput deliberately, while respecting the payment channel's provider limits. Never leave the scheduler dependent on a customer's browser or a developer's local process. Monitor non-2xx responses, oldest due orders, failed email jobs, and review orders in the admin pages.

Each order has a durable reconciliation due time and 30-second lease. Calls are serial within a worker, SDK retries are disabled, and failures use exponential backoff from 30 seconds up to one hour. Routine polling also backs off, and successful lookups are throttled for at least ten seconds. Duplicate webhook receipts do not reset backoff or trigger another provider call. Root admins can reconcile a particular order or a bounded group from the management pages; this shares fulfillment logic and leases with the worker. Authentication and role checks bypass Better Auth's cookie cache on sensitive operations.

Each new webhook receipt also replaces a durable pending-notification marker. A lookup captures that marker when it claims its lease; completion leaves the order immediately due if the marker changed during the lookup. Failed lookups retain the marker for recovery, even on older terminal orders. A unique lease token prevents a replaced worker from applying its lookup result, clearing a newer lease, or changing the newer worker's retry schedule.

Creating orders are persisted with unique safe-integer provider order codes before any provider request. A compare-and-set marks that creation **may** have been attempted before the network call. An explicit HTTP authentication/validation rejection becomes a failed local order. A timeout, process interruption after that marker, provider conflict, 429, business error, or 5xx remains uncertain: recovery looks up the same order code and can recover its hosted checkout URL. It never blindly sends a second creation request. If creation was never attempted, the worker can perform that first request. If the link remains absent, the order keeps the diagnostic and expires locally; inspect it before starting a fresh order. Keep the original record for any later payment.

Local expiry releases held reservations and ends creating/pending/processing checkouts, even if PayOS is temporarily unavailable. Recent terminal/issued orders are reconciled for 90 days to detect extra transfers. Unresolved creating/pending/processing/review orders remain eligible regardless of age, and a new durable notification also wakes an older order. Older terminal orders can always be reconciled explicitly by root admins.

Email jobs are claimed with row locks and a five-minute lease. Each failure retries with bounded exponential backoff, up to six attempts; permanent failure remains visible and can be followed by a deliberate resend job. One initial job per fulfilled order is enforced by a unique key. Each deliberate resend has its own request key and audit record. Provider acceptance followed by a lost response can cause an email to be delivered again when retried; this is the unavoidable at-least-once delivery boundary, not another order fulfillment or initial-job creation. `sent` means the email provider accepted the message, not a guaranteed inbox delivery. Inspect provider delivery/bounce information separately when necessary.

## Initial settings, event information and roles

On first ticket configuration access, the application creates database-backed defaults if absent: sales closed, purchased VIP capacity 30, Normal capacity unlimited, and the package prices below. Existing configured values are never overwritten by initialization.

| Package | Admission | Individual tickets | Total VND |
| --- | --- | ---: | ---: |
| Silver | Normal | 1 | 129,000 |
| Golden | Normal | 2 | 249,000 |
| Platinum | Normal | 3 | 349,000 |
| VIP | VIP + Networking Lunch | 1 | 199,000 |

Before generating or selling tickets, a root admin should configure the confirmed event name, date/time with ISO offset, venue, and IANA timezone at `/admin/tickets`. The known event name is prefilled; date and venue are nullable and displayed as unconfirmed. The initial timezone is `Asia/Ho_Chi_Minh`. No event date or venue has been invented. Event metadata is snapshotted at checkout or batch generation along with the applicable benefits. Configure it first so issued images and emails carry confirmed information. VIP lunch is a displayed entitlement; lunch redemption is not implemented.

Prices are integer VND stored in the database. Each checkout snapshots package name, admission category, quantity, benefits, currency, total, and event metadata. Root price changes affect future orders only. Each order contains exactly one package; VIP always issues one ticket, and buyers may place repeated orders while capacity remains. Buyer name and phone are optional contact details, not attendee requirements. No competition registration, transfer, or ticket-claim step is involved.

Root admins have ticket-management and check-in permissions. Existing professional admins have neither. Root admins grant/remove `entrance-staff` by Google email from ticket overview; this action cannot change an existing root/professional role. Entrance staff have only `/admin/check-in` and its minimum admission procedures, not orders, financial data, management images/exports, or unrelated admin areas. Navigation and fresh server procedure checks enforce these distinctions. Staff accounts may still use normal customer functionality for tickets they purchase themselves.

## Capacity, payments and manual resolution

All operations that affect purchased VIP capacity lock the singleton sales-settings row before locking orders. Fulfilled purchased VIP orders and held, unexpired reservations count against the limit. Gifted VIP tickets do not count. Normal tickets have unlimited capacity. Checkout and provider expiry match at a 15-minute, whole-second deadline. Closing sales blocks new orders and allows existing unexpired ones to complete. A capacity reduction cannot go below consumed purchases plus held reservations. Refunds and revocation do not release consumed VIP capacity; root admins can deliberately increase capacity if the organizer wishes to make more places available.

Fulfillment verifies provider order code and link ID, the stored price and currency, settlement total, remaining amount, distinct bank references, and the signed transaction amounts. The PayOS domestic payment-request lookup expresses amounts in VND and does not guarantee a top-level currency field; any supplied currency and every stored webhook currency are validated against the immutable VND snapshot. Pending/processing states do not issue tickets. Underpayment, overpayment, duplicate additional transfers, conflicting references, unexpected identifiers/currency, and inconsistent settlement data remain visible for review.

A payment discovered after local cancellation/expiry or VIP reservation release is recorded and held for admin resolution. The system never silently drops the money or exceeds capacity. For a freshly verified, exact late payment, root admins can explicitly approve ticket issuance with a reason; VIP requires currently available capacity. Other mismatches require external investigation/repayment. An external-resolution note records how the organizer handled the issue without changing provider evidence or issuing tickets. Financial records stay visible.

Recording a manual refund does **not** initiate a bank transfer. Record its pending/completed/failed status, integer amount, reason and optional external reference after handling it externally. Completed refunds cannot cumulatively exceed verified settlement. Pending/failed entries remain as history; add the completed record once repayment is confirmed. Explicitly revoke each affected ticket if required. Revocation, payment status, refund history, fulfillment status and accepted check-ins remain separate.

Payment confirmation, all individual tickets, consumed VIP reservation, and the unique initial email job commit in one PostgreSQL transaction over Neon WebSockets. If the process fails before commit, none of these changes commit. If it fails after commit, a repeated webhook or reconciliation sees the fulfilled order and creates no extra tickets/jobs. Durable webhook receipts and retry schedules survive the interruption.

## Admission credentials and distribution

Codes contain 20 cryptographically random characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`: 32 symbols, 100 bits of entropy, no `0`, `1`, `I`, or `O`. A unique SHA-256 credential tombstone reserves every code inside the issuance transaction, with up to eight collision retries. Current codes also have a database uniqueness/format constraint. Replacement rotates the credential on the same individual ticket, keeps old hashes and audit history, and never resets check-in count. Old codes can never be reused and cannot admit an attendee.

The QR payload is **only** the code. Private PNG artwork has a black/white QR, four-module quiet zone, and separately placed event metadata, category, code, benefit and confidentiality warning. PNG is the initial image-delivery format; the renderer is isolated for later format changes. Downloads use authenticated, non-cacheable routes addressed by ticket UUID, not by code. Never upload these images to a public asset bucket or use admission codes in analytics, URLs, logs, activity inputs, or filenames. Analytics exclude ticket/admin/login routes and scrub URL parameters; lookup uses a POST mutation, database-backed rate limits, and redacted activity inputs.

Ticket pages follow the existing dashboard/admin design: shared UI controls, Castela headings, charcoal surfaces, ivory text, gold accents and square panels. Status colors match the existing admin badges. Ticket artwork and confirmation emails use the same palette and serif fallback; the admission QR retains a solid white surrounding area. Keep future styling changes aligned with the global theme and shared components.

Buyers retain account ownership of all purchased tickets and may share images only with intended attendees. `/my-tickets` groups orders while exposing each ticket individually. Every buyer query/action checks ownership on the server. Gifted tickets have no owner account; optional recipient name/phone/email is separate. Root admins can generate up to 100 tickets per idempotent batch, inspect/download them individually, prepare filtered printable sheets, or queue an optional recipient email. Internal titles/notes are not recipient-facing artwork/email data. Sheets wait for all private images to load; browser print or save-as-PDF provides bulk distribution.

Admission requires Internet access. Camera scanning uses ZXing with rear-camera preference, selection after permission where supported, explicit permission/unavailable states, and manual entry. It pauses after a detection. A lookup does not admit anyone. Explicit confirmation locks the ticket and uses a request key and server timestamp: two concurrent requests cannot both record the first admission. Rejected lookups/confirmations are separate from accepted admissions, and repeated camera detections cannot inflate accepted counts. Repeat admission requires a root-admin reason; revocation cannot be overridden. Local times use the ticket's event timezone.

The scanner retrieves recent accepted admissions separately from rejected attempts so repeated rejected scans cannot hide prior admission times. Buyer and root ticket views paginate retained history; root views also show staff identifiers, reasons and administrative actions.

## Manual verification checklist

Perform browser checks only after the user confirms suitably authenticated sessions, as required by `AGENTS.md`. Prepare separate buyer A/buyer B, root, professional, and entrance-staff sessions. Confirm the isolated database and receiving channel before any write or real payment. Do not add an automated payment-test script or framework. For non-provider edge cases, manually prepared/inspected fixtures on an explicitly approved disposable deployment are simulations; do not label them verified bank payments.

### Login, navigation and ownership

- [ ] From logged-out landing header, hero and footer, Buy tickets opens `/login?next=/tickets`; Google popup login lands on `/tickets`.
- [ ] Direct `/my-tickets` or an order URL preserves its destination through login and the popup callback. Closing/cancelling the popup leaves a recoverable login UI. The callback without an opener also preserves the validated destination.
- [ ] An already-authenticated login page honors `next`; missing or malicious `next` (absolute URL, protocol-relative URL, backslash, encoded control character, nested encoding, login/API loop) falls back to `/dashboard`.
- [ ] Google sign-in starts immediately without scrolling, accepting or opening the rulebook. Retained rulebook code still exists for future use. Both login languages explain tickets and optional competition participation.
- [ ] Dashboard has My tickets. A buyer with no competition/team registration can purchase tickets.
- [ ] Buyer B cannot fetch buyer A's order, list A's tickets, inspect history, download images, cancel checkout, or request verification. Changing IDs in API calls yields no other buyer's data. Gifted tickets never appear in either buyer's `/my-tickets`.

### Packages, prices, sales and reservations

- [ ] Silver, Golden, Platinum and VIP issue exactly 1, 2, 3 and 1 distinct ticket entities/codes respectively. Each order has one package. Repeat normal and VIP orders are allowed while purchased VIP availability remains.
- [ ] Buyer contact name/phone can both be blank and remain null. There is no required attendee-contact form. Gifts can omit every recipient field and require no account.
- [ ] Try a duplicate checkout/batch submission with the same request key, including concurrent requests: one local order/batch, one creation attempt, and the correct ticket quantity. A changed package/batch payload with that key is rejected.
- [ ] Root changes a package price: an existing unexpired link/order keeps its old snapshot; the next new order uses the new server price. Tampering with a browser amount cannot affect the payable total.
- [ ] Close sales while a checkout is active: new orders are blocked; an unexpired existing checkout can still complete. Reopen with the root toggle; no scheduled sales times exist.
- [ ] Set purchased VIP capacity to one available place, then submit two buyers concurrently: exactly one reserves it. Availability reflects held plus consumed orders. Confirmed cancellation/expiry releases a held place; gift VIP generation does not affect it.
- [ ] A root cannot reduce capacity below held plus consumed usage. Recording a refund/revoking a purchased VIP ticket does not automatically restore availability.

### PayOS evidence, recovery and financial states

- [ ] With separate explicit authorization for a real transfer, confirm the receiving channel/bank, server-only keys, exact VND amount, order code, link ID, and 15-minute provider/local expiry. Verify the payment in PayOS and the bank independently.
- [ ] Normal successful payment moves through Confirming payment to verified payment and issued tickets. Close the return page before verification: the webhook/worker still fulfills and queues confirmation.
- [ ] Replay the same valid notification sequentially and concurrently; the bank reference is recorded once, no extra tickets/initial email job appear, and duplicates do not trigger unbounded status calls.
- [ ] Delay notifications and then replay them; disable/miss a webhook on the authorized verification deployment and let the scheduled worker reconcile the same order through the same fulfillment transaction.
- [ ] Alter return/cancel/success query parameters: no payment or fulfillment state changes without server evidence. Send an invalid webhook signature: HTTP 400, no tickets or confirmation job. Confirm-channel sample creates only a sample receipt.
- [ ] Interrupt a creation response after the provider may have accepted it: the same local/provider identifier is recovered via lookup; no second blind creation POST occurs. Exercise explicit creation rejection, 429, timeout, pending and processing states; inspect diagnostics and persisted backoff.
- [ ] Confirm cancellation through PayOS; simulate a lost cancellation response, and verify capacity remains held until authenticated lookup/expiry. Allow expiry with provider unavailable: local reservation is released and the checkout becomes expired.
- [ ] Manually simulate underpayment, overpayment, additional transfers, duplicate/conflicting references, wrong currency/order/link ID, and a paid flag with missing/inconsistent transaction amounts. No unfulfilled order receives tickets on mismatched evidence. Review states and durable event history are visible to root admins.
- [ ] Discover payment after cancellation/expiry/released VIP reservation: money remains recorded and issuance is held. Root approval for an exact late payment requires fresh server evidence, a reason and free VIP capacity; no overselling occurs. Wrong amounts cannot be bypassed by that action.
- [ ] Interrupt fulfillment before transaction commit and again after commit/before response. Recovery produces the exact order quantity and one initial email job, with no partial fulfillment or extra admissions.
- [ ] Record pending/failed/completed manual refunds and an external-resolution note; confirm no bank-transfer API is invoked, totals remain bounded, records are retained, and ticket revocation is a separate per-ticket action.

### Permissions, credentials and gifts

- [ ] Professional admins receive no ticket-management/check-in permissions. Entrance staff can load only check-in admin navigation and procedures. Direct management routes, status/settings/refund/exports/batch calls, and other users' image URLs fail on the server.
- [ ] Grant/remove entrance-staff access by Google email. Sensitive requests reflect removal without waiting for cookie-cache expiry. Existing root/professional roles cannot be overwritten by the entrance-staff toggle.
- [ ] Generate Normal and VIP batches of 1 and 100 with title and optional note. Quantity 0/101 is rejected. Check every ticket, null ownership/contacts, unique codes, and exact batch counts. Internal notes do not appear on artwork or emails.
- [ ] Save individual PNGs and prepare a filtered print sheet; wait for complete image loading. Verify QR payload contains only its code, remains readable with whitespace, and all event/category/benefit information stays outside the QR. No public unauthenticated image access is possible.
- [ ] Replace a compromised credential: the old code fails, the new code works, accepted history/count remains, and no usable old credential is in audit inputs/logs/analytics. Revoke a named individual ticket and verify it is blocked.

### Mobile admission and email

- [ ] On authorized desktop/mobile sessions, check HTTPS camera permission granted/denied, unavailable/busy camera, rear preference, device selection, and Safari/Chrome guidance. Verify manual entry and offline/network-loss states.
- [ ] Scan/lookup a valid ticket without confirming: accepted count stays zero. Leave the QR in view after a result: scanner pauses and admissions do not increase. Only a server-confirmed accepted response shows successful admission.
- [ ] Confirm one first admission; two simultaneous staff confirmations for the same ticket yield one acceptance and one rejection. Retrying the same confirmation request key does not add another admission.
- [ ] Previously admitted/revoked/replaced/unknown codes have clearly differentiated outcomes. Previous accepted times and rejected attempts are separate. Entrance staff cannot override; root repeat admission needs a reason and retains audit/history. Root overrides cannot admit revoked tickets.
- [ ] Verify server timestamps and displayed local event timezone. VIP lunch appears as an entitlement, with no separate redemption state.
- [ ] One initial order email contains every individual code and attached QR PNG, purchase details, event metadata and confidentiality warning, with text fallback and no public credential image URL.
- [ ] Simulate email-provider failure on an approved deployment: payment/tickets stay committed, attempts/backoff persist, expired sending leases are recoverable, and failed jobs are inspectable. A root resend creates a separate recorded job rather than another initial job.
- [ ] Gift email works with an optional saved recipient address and needs no recipient account. Missing recipient email does not block gift generation; it blocks only email delivery.
- [ ] Check English and Vietnamese purchase, status, management, scanning, printable artwork and buyer-selected email content. Verify keyboard focus, labels, outcome announcements, responsive layouts and long confirmed event metadata after authenticated browser access is approved.

## Repository validation

Use Linux Node/pnpm and the repository-root preflight specified by `AGENTS.md`. Validation commands for this change are:

```sh
pnpm --filter web exec tsc --noEmit
pnpm --filter @masc-landing/api exec tsc --noEmit
pnpm --filter @masc-landing/db exec tsc --noEmit
pnpm --filter @masc-landing/env exec tsc --noEmit
CI=1 NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack
```

Run `pnpm db:generate` after schema changes and inspect SQL/metadata; generating does not apply migrations. The existing non-payment API test script can validate the touched activity-input sanitizer. Type checks/builds are not payment tests, authenticated browser verification, bank verification, or proof that a migration applies to a particular deployed database.
