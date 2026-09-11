# SignMaster — Manual Auth / Activation Acceptance Pack

Manual acceptance test pack for the SignMaster activation, authentication, and
entitlement-aware protected-routing boundary (Tasks 1–8). This pack complements
the automated Vitest + Playwright suites and focuses on what **mocked Cloud E2E
cannot prove** — real Supabase callbacks, real HttpOnly cookies, real database
race/uniqueness behaviour, and real cross-device/cross-browser flows.

- **Environment:** a deployed preview/staging environment wired to a **non-production**
  Supabase project and non-production Amazon data fixtures. Do **not** use production Supabase.
- **Viewports:** run P0 flows at desktop (~1280px) and mobile (~375px, e.g. iPhone SE / Pixel).
- **Browsers:** Chrome, Edge, Firefox, Safari desktop; Safari iOS + Chrome Android for mobile P0.
- **Evidence:** capture screenshots/video, the URL bar, DevTools → Application (localStorage,
  sessionStorage, Cookies), and DevTools → Network (request URL, headers, body, response) where noted.

Automation status legend: **Automated** (covered by CI-runnable Playwright/Vitest),
**Partially automated** (mocked E2E covers the UI path; real backend behaviour is manual),
**Manual only** (no automated coverage is meaningful without real infrastructure).

---

## How to read this pack

Each scenario has: **ID**, **Priority** (P0/P1/P2), **Preconditions**, **Test data**,
**Steps**, **Expected result**, **Evidence to capture**, **Automation status**.

P0 = must pass before freezing the auth boundary. P1 = important. P2 = good to verify.

---

## A. Purchase verification

| ID | Pri | Scenario | Steps (abbrev.) | Expected | Evidence | Automation |
|----|-----|----------|-----------------|----------|----------|------------|
| PV-01 | P0 | Valid Order ID → eligible | Enter a seeded eligible Order ID → Check my order | "Your purchase is verified"; Continue to account setup | Screenshot; Network `verify`→`ELIGIBLE` | Partially automated (E2E mocks `verify`) |
| PV-02 | P1 | Invalid format | Enter `abc` / too short | Inline format error; no request sent | Screenshot | Automated (component + E2E entry) |
| PV-03 | P0 | Not found | Enter unseeded valid-format ID | "We can't verify that order" | Screenshot; real `NOT_FOUND` | Manual only (real DB) |
| PV-04 | P0 | Wrong product (non-target ASIN) | Seed order without ASIN `B0H8ZRL6DK` | Safe `NOT_FOUND` (no product enumeration) | Network response body | Manual only (real DB) |
| PV-05 | P1 | Not shipped | Seed order, `quantity_fulfilled=0` | "Your order is confirmed" / try after dispatch | Screenshot | Manual only (real DB) |
| PV-06 | P1 | Cancelled | Seed cancelled order | "That order was cancelled" | Screenshot | Manual only (real DB) |
| PV-07 | P1 | Returned (all retained = 0) | Seed order, returned = fulfilled | "That pack was returned" | Screenshot | Manual only (real DB) |
| PV-08 | P0 | Already claimed | Seed order claimed by another user | "This order has already been used" | Screenshot | Manual only (real DB) |
| PV-09 | P1 | Partial return, retained > 0 → eligible | Seed 2 fulfilled, 1 returned | `ELIGIBLE` | Network body; DB retained calc | Manual only (real DB) |
| PV-10 | P1 | Duplicate verify blocked while checking | Double-click Check my order | Exactly 1 request | Network count | Automated (E2E) |
| PV-11 | P1 | Verification service failure → retry | Force 500 | "We can't check your order right now"; retry works | Screenshot | Automated (E2E, mocked) |
| PV-12 | P1 | Connection failure → retry | Kill network mid-request | "We couldn't connect" | Screenshot | Automated (E2E, mocked) |
| PV-13 | P0 | No sensitive Order ID in URL/storage after verify | Verify then inspect | URL + storage carry no Order ID/token | DevTools App tab | Automated (privacy spec) |
| PV-14 | **DEFERRED — PRODUCTION HARDENING / TASK 10** | Server-side verify rate limiting / attempt caps. **Not implemented in Tasks 1–8 and not part of the Tasks 1–8 auth-boundary acceptance gate.** | When implemented: repeat verify rapidly → `429` / rate-limited state; server caps attempts per IP/order | Network 429; server logs | Not implemented (deferred to production hardening / Task 10) |
| PV-15 | P1 | Mobile 375px no overflow | Verify flow at 375px | No horizontal scroll; controls usable | Screenshot | Automated (mobile project) |
| PV-16 | P1 | Keyboard-only entry | Tab to field, type, Enter | Submits; verified | Screen recording | Automated (keyboard spec) |

## B. Activation context

| ID | Pri | Scenario | Expected | Evidence | Automation |
|----|-----|----------|----------|----------|------------|
| CTX-01 | P0 | Eligible verification creates a secure server-side context (HttpOnly cookie) | `Set-Cookie` HttpOnly on `POST /context`; cookie not readable by JS | Network `Set-Cookie`; `document.cookie` empty of it | Partially automated (JS-unreadability in privacy spec; real HttpOnly manual) |
| CTX-02 | P0 | Context survives same-browser navigation | Navigate away/back → still VALID | Screenshot | Automated (E2E) |
| CTX-03 | P0 | Context survives refresh | Reload `/create-account` → VALID | Screenshot | Automated (E2E) |
| CTX-04 | P1 | Context survives browser restart (where cookie persists) | Reopen browser within TTL → VALID | Screenshot | Manual only (real cookie) |
| CTX-05 | P1 | Sliding expiry behaviour | Interact within window → expiry extends per policy | Server logs; timestamps | Manual only (real backend) |
| CTX-06 | P1 | Expired context UX | Expired context → restart notice | Screenshot | Automated (E2E, mocked) |
| CTX-07 | P1 | No-context UX | No cookie → missing-context notice | Screenshot | Automated (E2E, mocked) |
| CTX-08 | P0 | Context API transient failure → retry, not NONE | 500 on GET → retry notice; recovers to VALID | Screenshot | Automated (E2E, mocked) |
| CTX-09 | P0 | Browser cannot forge context authority | Craft/modify a fake `sm_activation_ctx` cookie value in JS | JS cannot set HttpOnly; forged value rejected server-side | DevTools; server logs | Manual only (real backend) |
| CTX-10 | P0 | Raw order/token/hash absent from browser storage/URL | Inspect after context creation | None present | DevTools App tab | Automated (privacy spec) |
| CTX-11 | P0 | Context not consulted for ACTIVE entitlement | ACTIVE user; context API down | `/app` grants; context never called | Network (no `/context` call) | Automated (E2E) |

## C. Create account

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| CA-01 | P0 | New account + valid context | Account created; activation continues via resolver | Automated (E2E, mocked) |
| CA-02 | P1 | Password validation (length, number/symbol) | Inline rules; submit blocked until valid | Automated (component) |
| CA-03 | P1 | Confirm mismatch | "Passwords don't match" | Automated (component) |
| CA-04 | P1 | Duplicate submit blocked | Exactly 1 signup request | Automated (component) |
| CA-05 | P0 | Existing email safe handling | Neutral "email already registered" + Sign in; no enumeration beyond that | Partially automated (mocked); real Supabase manual |
| CA-06 | P1 | Existing account → Sign in link | Routes to `/sign-in` | Automated |
| CA-07 | P0 | Unconfirmed account → confirmation state | Email-confirmation continuation shown | Automated (E2E, mocked) |
| CA-08 | P0 | Confirmed account continues activation | Resolver resumes claim | Automated (E2E, mocked) |
| CA-09 | P0 | Context failure does not produce a false success | Context down → no "account created + activated" illusion | Partially automated; verify with real backend |
| CA-10 | P1 | Change-email continuity | Change email in confirmation state resets cleanly | Automated (component) |
| CA-11 | P1 | Mobile 375px | Usable, no overflow | Automated (mobile) |
| CA-12 | P1 | Keyboard/focus order | Logical tab order; visible focus | Manual only |

## D. Same-device email confirmation

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| SDC-01 | P0 | Confirmation-required state | "Check your email" continuation UI | Automated (E2E, mocked) |
| SDC-02 | P1 | Re-check before confirmation (B3A') | "Not seen yet" state on early re-check | Automated (E2E, mocked) |
| SDC-03 | P0 | Successful confirmation resumes activation | After real email click → session confirmed → resume claim | Manual only (real Supabase email) |
| SDC-04 | P1 | Confirmation after context expiry | Expired context → safe restart, no false activation | Manual only (real Supabase + expiry) |
| SDC-05 | P1 | Malformed callback safe failure | Tampered callback hash → safe state, no crash | Manual only (real callback) |
| SDC-06 | P0 | No order/context authority leaked in URL | Confirmation URL carries only opaque ref | URL inspection | Partially automated (redirect builder unit); real link manual |

## E. Cross-device email confirmation (continuation reference)

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| XDC-01 | P0 | Opaque continuation ref minted | `POST /continuation` returns opaque ref only | Manual only (real RPC); unit covers shape |
| XDC-02 | P0 | Correct email consumes → resume | Confirming device without cookie resumes + claims | Automated (E2E, mocked) |
| XDC-03 | P0 | Wrong email → INVALID, no enumeration | Safe recovery state; no account/order leak | Automated (E2E, mocked) |
| XDC-04 | P1 | Expired ref | Safe "link can't be used" | Manual only (real TTL); view covered |
| XDC-05 | P0 | Replay rejected (single-use) | Already-consumed → safe recovery | Automated (E2E, mocked) |
| XDC-06 | P0 | Concurrent consume → exactly one success | Two devices consume same ref simultaneously | Manual only (real DB `FOR UPDATE`) |
| XDC-07 | P0 | Rollback does not burn link | Context insert fails → ref stays unconsumed, retryable | Manual only (real transaction) |
| XDC-08 | P0 | Fresh HttpOnly context issued on consume | `Set-Cookie` HttpOnly on confirming device | Network; DevTools | Partially automated (flow); real cookie manual |
| XDC-09 | P0 | No raw order/context token returned | Response is status enum only | Network body | Manual only (real RPC) |
| XDC-10 | P1 | Transient failure retryable | 5xx → "couldn't finish"; retry recovers | Automated (E2E, mocked) |

## F. Claim

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| CL-01 | P0 | Valid auth+confirmed+context+eligible → SUCCESS | Claim succeeds; `data-claim-outcome=success` | Automated (E2E, mocked) |
| CL-02 | P0 | Lost-success retry idempotent | Repeat claim → still SUCCESS, 1 entitlement | Partially automated (mocked 1 attempt); real DB manual |
| CL-03 | P1 | Same user active existing → SUCCESS | Idempotent SUCCESS | Manual only (real DB) |
| CL-04 | P1 | Same user revoked → NOT_ELIGIBLE | Safe not-eligible | Manual only (real DB) |
| CL-05 | P0 | Other user active claim → ALREADY_CLAIMED | Conflict recovery, no other-account leak | Automated (E2E, mocked) |
| CL-06 | P1 | Other user revoked historical → ALREADY_CLAIMED | Conflict recovery | Manual only (real DB) |
| CL-07 | P1 | Became cancelled before claim → NOT_ELIGIBLE | Re-check at claim time | Manual only (real DB) |
| CL-08 | P1 | Became returned before claim → NOT_ELIGIBLE | Re-check at claim time | Manual only (real DB) |
| CL-09 | P0 | Concurrent claim → one entitlement | `UNIQUE(amazon_order_id)` enforced | Manual only (real DB race) |
| CL-10 | P0 | Missing auth | Claim rejected (no session) | Manual only (real endpoint); unit covers |
| CL-11 | P0 | Email not confirmed | Claim blocked / confirmation recovery | Partially automated; real Supabase manual |
| CL-12 | P1 | No context | Claim blocked with safe copy | Automated (component/E2E) |
| CL-13 | P1 | Expired context | Claim blocked; restart | Automated (E2E) |
| CL-14 | P1 | Dependency failure → retry | Transient → retryable, purchase unchanged | Automated (component) |
| CL-15 | P0 | Browser cannot choose user/order authority | `user_id` derived server-side; body ignored | Network; server logs | Manual only (real endpoint) |
| CL-16 | P0 | Success does not prematurely destroy recovery before completion | Context stays valid post-SUCCESS for retry | Manual only (real backend) |

## G. Completion

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| CO-01 | P0 | Claim success → completion → activated | `COMPLETED`; "access is active"; cookie cleared | Partially automated (flow); real cookie manual |
| CO-02 | P0 | Same owner + active entitlement required | Ownership re-checked at finalisation | Manual only (real DB) |
| CO-03 | P0 | Context invalidated / cookie cleared | `Set-Cookie` Max-Age=0 on COMPLETED | Network | Manual only (real cookie) |
| CO-04 | P0 | Repeat completion safe (NO_CONTEXT) | Stays activated, no side effects | Automated (E2E, mocked) |
| CO-05 | P1 | Already-finalised NO_CONTEXT recovery | Activated view retained | Automated (E2E, mocked) |
| CO-06 | P0 | NOT_ELIGIBLE never shows activated | Safe failure, no internal reason | Automated (E2E, mocked) |
| CO-07 | P1 | UNAUTHENTICATED recovery | Sign-in recovery | Automated (component) |
| CO-08 | P1 | EMAIL_NOT_CONFIRMED recovery | Confirm-email recovery | Automated (component) |
| CO-09 | P1 | Dependency/network failure retry | Access stays active; cleanup retryable | Automated (component) |
| CO-10 | P0 | No raw authority in completion request | No body; Bearer + HttpOnly cookie only | Network | Automated (asserts no body); real cookie manual |

## H. Sign in

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| SI-01 | P0 | Returning user sign-in | Authenticates; routes via `/app` | Automated (E2E, mocked) |
| SI-02 | P1 | Invalid credentials | Safe generic error | Automated (component) |
| SI-03 | P1 | Duplicate submit blocked | 1 request | Automated (component) |
| SI-04 | P0 | Sign-in independent of activation-context availability | Context API down → sign-in still works | Automated (E2E) |
| SI-05 | P0 | ACTIVE → /app | Access granted | Automated (E2E) |
| SI-06 | P0 | NONE + VALID → resume activation | Routes to `/create-account`, claims | Automated (E2E) |
| SI-07 | P0 | NONE + NONE → B10 | Activation-required state | Automated (E2E) |
| SI-08 | P0 | Entitlement API failure → safe retry | Fail-closed retry screen | Automated (E2E) |
| SI-09 | P0 | Context matters only after entitlement NONE | Ordering enforced | Automated (E2E) |
| SI-10 | P0 | Single post-auth resolver | No competing redirects | Automated (E2E) |
| SI-11 | P1 | Mobile 375px | Usable, no overflow | Automated (mobile) |
| SI-12 | P1 | Keyboard/focus | Keyboard-only sign-in works | Automated (keyboard spec) |

## I. Forgot / reset password

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| PR-01 | P0 | Generic anti-enumeration confirmation | Same message regardless of account existence | Automated (E2E, mocked) |
| PR-02 | P0 | Unknown email → same generic confirmation | No signal | Partially automated; real Supabase manual |
| PR-03 | P1 | Reset-request transient failure | Neutral "try again", no account signal | Automated (component) |
| PR-04 | P0 | Genuine PASSWORD_RECOVERY → reset form | Form appears only on recovery event | Partially automated (mocked hash); real link manual |
| PR-05 | P0 | Normal auth session cannot use reset route | Safe "can't be used" state | Automated (E2E) |
| PR-06 | P0 | Missing/expired/used link | Safe recovery state | Automated (E2E, mocked) + Manual (real expiry) |
| PR-07 | P1 | Validation / mismatch | Inline errors | Automated (component) |
| PR-08 | P1 | Duplicate submit blocked | 1 update request | Automated (E2E) |
| PR-09 | P0 | Successful reset → authenticated session | Password updated; session valid | Manual only (real Supabase) |
| PR-10 | P0 | Reset + ACTIVE → /app | Access granted after Continue | Automated (E2E) |
| PR-11 | P0 | Reset + NONE + VALID → resume | Resumes activation | Automated (E2E) |
| PR-12 | P0 | Reset + NONE + no context → B10 | Activation-required | Automated (E2E) |
| PR-13 | P0 | Hard reload safe fallback | Recovery not re-derived → safe state | Automated (E2E) |
| PR-14 | P0 | Reset does not transfer activation authority cross-device | Reset link carries no order/context | Manual only (real link) |

## J. Protected routing

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| RT-01 | P0 | Signed-out /app → sign-in, no flash | Redirect; no protected content flash | Automated (E2E) |
| RT-02 | P0 | ACTIVE → access | "SignMaster access is active." | Automated (E2E) |
| RT-03 | P0 | NONE + VALID → resume | Resume activation | Automated (E2E) |
| RT-04 | P0 | NONE + NONE/EXPIRED → B10 | Activation-required | Automated (E2E) |
| RT-05 | P0 | Revoked denied | Revoked → NONE → B10/resume | Partially automated (ACTIVE→NONE flip); real revoke manual |
| RT-06 | P0 | Entitlement dependency fail closed | 500 → retry screen, no access | Automated (E2E) |
| RT-07 | P0 | Malformed entitlement response fail closed | Garbled 200 → retry screen, no access | Automated (E2E) |
| RT-08 | P0 | Context dependency fail closed | Context error in NONE path → retry | Automated (component/E2E) |
| RT-09 | P1 | Retry recovers | Transient → Try again → access | Automated (E2E) |
| RT-10 | P0 | No protected-content flash | Loading only while resolving | Automated (E2E) |
| RT-11 | P0 | No B10 flash while ACTIVE still resolving | Loading only; no B10 | Automated (E2E) |
| RT-12 | P0 | Fresh entitlement re-check on remount/navigation | Re-queried each navigation | Automated (E2E) |
| RT-13 | P0 | True logout/login persistence | Access restored after re-login | Automated (E2E) + Manual (real session) |
| RT-14 | P0 | No browser entitlement cache | Re-queried; nothing cached | Automated (E2E) |
| RT-15 | P0 | Browser cannot choose another user | Bearer only; no user id in request | Automated (privacy spec) |
| RT-16 | P0 | Minimal API response only | `{status}` enum only | Network body | Manual only (real endpoint); unit covers |

## K. B10 (activation-required)

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| B10-01 | P0 | Exact frozen copy | Heading/body/actions match spec | Automated (component + E2E) |
| B10-02 | P0 | Verify my order → /activate | Navigates | Automated (E2E) |
| B10-03 | P0 | Use another account → sign out then sign-in | Signs out; `/sign-in` | Automated (E2E) |
| B10-04 | P1 | Get support | mailto link present | Automated (component) |
| B10-05 | P0 | No internal revocation reason | No reason text leaked | Automated (component) |
| B10-06 | P1 | Mobile no overflow | 375px clean | Automated (E2E mobile) |
| B10-07 | P1 | Keyboard focus order | Primary focusable + Enter activates | Automated (keyboard spec) |

## L. Navigation / resilience

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| NAV-01 | P1 | Back/forward does not duplicate actions | No duplicate claims/entitlements | Manual only |
| NAV-02 | P1 | Refresh after verification result | Safe re-resolve | Partially automated (context refresh) |
| NAV-03 | P1 | Refresh during account creation | No duplicate account | Manual only (real Supabase) |
| NAV-04 | P1 | Refresh while waiting confirmation | Waiting state re-derived safely | Manual only (real Supabase) |
| NAV-05 | P0 | Refresh after claim before completion | Safe; claim idempotent, completion still available | Manual only (real backend) |
| NAV-06 | P1 | Refresh after activated success | Stays activated (NO_CONTEXT recovery) | Partially automated |
| NAV-07 | P2 | Deep link /create-account | Renders; resolves context | Automated |
| NAV-08 | P2 | Deep link /sign-in | Renders | Automated |
| NAV-09 | P2 | Deep link /reset-password | Safe recovery without event | Automated |
| NAV-10 | P2 | Deep link /activation/continue | Working/needs-sign-in/recovery views | Automated |
| NAV-11 | P0 | Deep link /app | Guarded; redirect if signed out | Automated |
| NAV-12 | P0 | Multiple tabs do not create duplicate entitlements | `UNIQUE` protects | Manual only (real DB) |
| NAV-13 | P1 | Stale tab after activation resolves safely | Stale tab re-checks backend, no stale grant | Manual only (real backend) |

## M. Privacy / security browser audit

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| SEC-01 | P0 | No raw Order ID in URL after verify | Absent | Automated (privacy spec) |
| SEC-02 | P0 | No activation token in localStorage/sessionStorage | Absent | Automated (privacy spec) |
| SEC-03 | P0 | No entitlement authority in browser storage | Absent; re-queried each time | Automated (privacy spec + not-cached) |
| SEC-04 | P0 | No service-role secret in frontend bundle/config | `grep` built `dist/` for service-role markers → none | Build artifact grep | Manual only (build inspection) |
| SEC-05 | P0 | No DB IDs / revocation reasons in browser responses | Status enums only | Network bodies | Manual only (real endpoints); unit covers |
| SEC-06 | P0 | No raw Supabase/backend errors shown | Safe categorised copy only | Screenshots | Partially automated (unit categories) |
| SEC-07 | P0 | HttpOnly context cookie unreadable by JS | `document.cookie` lacks it | DevTools | Automated (JS-unreadability) + Manual (real HttpOnly flag) |
| SEC-08 | P0 | Continuation ref single-use | Replay rejected | Automated (E2E) + Manual (real RPC) |
| SEC-09 | P0 | Account enumeration prevented | Generic messages throughout | Partially automated; real Supabase manual |
| SEC-10 | P0 | Protected page never renders on entitlement error | Fail-closed | Automated (E2E) |

## N. Responsive / accessibility smoke

| ID | Pri | Scenario | Expected | Automation |
|----|-----|----------|----------|------------|
| A11Y-01 | P0 | 375×667 happy path | No overflow/clipping | Automated (mobile project) |
| A11Y-02 | P0 | Desktop happy path | Clean layout | Automated (desktop project) |
| A11Y-03 | P0 | Keyboard-only sign-in/create/reset/B10 | Completable via keyboard | Partially automated (sign-in, activation entry, B10 primary) |
| A11Y-04 | P1 | Visible focus indicators | Focus ring on all interactive controls | Manual only |
| A11Y-05 | P1 | Labels associated with inputs | Programmatic label association | Partially automated (getByLabel) |
| A11Y-06 | P1 | Alerts/statuses use roles/live regions | `role="alert"` / `role="status"` `aria-live` | Partially automated |
| A11Y-07 | P1 | No major mobile overflow/clipping | Clean at 375px on all screens | Partially automated (B10 overflow) |
| A11Y-08 | P2 | Reduced-motion does not break core flow | `prefers-reduced-motion` honoured | Manual only |
| A11Y-09 | P1 | Screen-reader pass (VoiceOver/NVDA) on P0 flows | Announcements sensible | Manual only |

---

## P0 MANUAL ACCEPTANCE — MUST RUN BEFORE AUTH FREEZE

Run each on a preview environment backed by a **non-production** Supabase project. Capture evidence.

| # | ID(s) | Scenario | Key expected outcome | Evidence |
|---|-------|----------|----------------------|----------|
| 1 | PV-01→CL-01→CO-01 | Eligible purchase → activation context → account → claim → completion → `/app` | Full happy path lands on activated `/app`; cookie cleared on completion | Video; Network `verify/context/claim/complete`; cookie cleared |
| 2 | SI-01/SI-05 | Existing account + ACTIVE entitlement sign-in | Signs in → `/app` access | Video; Network `entitlement/me`→ACTIVE |
| 3 | SI-07/RT-04 | No entitlement → B10 | Activation-required frozen copy | Screenshot |
| 4 | SI-06/RT-03 | Valid context existing user → resume | Routes to `/create-account`, claims | Video |
| 5 | SDC-03 | Same-device email confirmation | Real email link confirms, resumes activation | Video; real inbox |
| 6 | XDC-02 | Cross-device email confirmation | Phone confirms; desktop/other device resumes | Video (two devices) |
| 7 | XDC-05 | Continuation replay rejection | Reusing a consumed link → safe recovery | Screenshot; server logs |
| 8 | PR-04/PR-09 | Real password-reset email link | Reset form appears only via real recovery; password updates | Video; real inbox |
| 9 | PR-10 | Reset then ACTIVE access | Continue → `/app` granted | Video |
| 10 | RT-13 | Logout/login persistence | Sign out, direct `/app` denied, re-login restores access | Video |
| 11 | RT-05 | Revoked entitlement denial | Revoke in DB → next `/app` denied (B10) | Video; DB change |
| 12 | CTX-06/CL-13 | Expired activation context | Expired context → restart, no false activation | Screenshot |
| 13 | CL-02/CL-09 | Claim retry / idempotency + concurrency | Retry safe; concurrent claims → exactly one entitlement | DB row count; server logs |
| 14 | CTX-01/CTX-04/CO-03 | Context cookie persistence / expiry / clear | HttpOnly cookie set, survives restart in TTL, cleared on completion | DevTools Cookies |
| 15 | RT-10/RT-11 | No protected-content / B10 flash | Only loading shows while resolving | Slow-network video |
| 16 | A11Y-01 | Mobile happy path (real device) | Clean on Safari iOS + Chrome Android | Device video |
| 17 | SEC-01→SEC-07 | Browser privacy/storage inspection | No order id/token/entitlement in URL/storage; HttpOnly cookie | DevTools App tab |
| 18 | NAV-12 | Multi-tab race | Two tabs claiming same order → one entitlement | DB row count |
| 19 | SEC-04 | Service-role secret not in bundle | `grep -R` built assets → no server secret | grep output |
| 20 | CL-15/RT-15 | Browser cannot assert identity | Tampering `user_id` in requests has no effect | Network; server logs |

> **Note:** Server-side verify rate limiting (PV-14) is intentionally **deferred to production hardening / Task 10** and is **not** part of this Tasks 1–8 auth-boundary acceptance gate, so it is deliberately excluded from the P0 must-run shortlist above (20 scenarios).

---

## Real-Supabase / local-only gaps (mocks cannot prove)

Mocked Cloud E2E stubs every `/api/*` and Supabase Auth endpoint, so the following are **not**
proven by automation and MUST be covered manually on a non-production environment.

> Note on rate limiting: this is a different category. It is **not** "implemented but unprovable by
> mocks" — server-side verify rate limiting is **intentionally not implemented yet** (deferred to
> production hardening / Task 10). It is a **pre-production hardening requirement**, not a Tasks 1–8
> auth-boundary acceptance item, and therefore is excluded from the P0 gate above. See item 10 below.

1. **Real Supabase email-confirmation callback** (SDC-03) — actual `detectSessionInUrl` handling and session establishment.
2. **Real Supabase `PASSWORD_RECOVERY` callback** (PR-04/PR-09) — genuine recovery event + `updateUser`.
3. **Actual HttpOnly cookie behaviour** (CTX-01, CTX-04, CO-03, SEC-07) — HttpOnly/SameSite/Secure flags, persistence, clearing.
4. **Activation-context persistence across browser restart** (CTX-04).
5. **DB uniqueness / race behaviour** (CL-09, NAV-12) — `UNIQUE(amazon_order_id)` under concurrency.
6. **Continuation RPC transaction** (XDC-06, XDC-07) — `consume_activation_continuation` atomicity, `FOR UPDATE`, rollback-not-burn.
7. **Real entitlement query** (RT-16, SEC-05) — service-role query + response minimality end-to-end.
8. **Service-role / RLS interaction** — RLS on `app_entitlements`, service-role boundaries.
9. **Actual logout/login session persistence** (RT-13) — real Supabase session lifecycle.
10. **Server-side rate limiting / attempt caps** (PV-14) — **intentionally not implemented yet**; deferred to production hardening / Task 10. This is a pre-production hardening requirement, **not** a Tasks 1–8 auth-boundary acceptance gate item (and not merely "unprovable by mocks").
11. **Verify against real order fixtures** (PV-03→PV-09) — eligibility/retained-quantity math against real DB rows.
