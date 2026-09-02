# SignMaster Pre-Production Checklist

## Security
- [ ] Production secrets configured only as server-side environment variables
- [ ] No server secrets use VITE_ prefixes
- [ ] No credentials or tokens committed to Git
- [ ] Verify Supabase RLS and grants
- [ ] Verify activation endpoints expose no internal database information
- [ ] Add rate limiting to the public /api/activation/verify endpoint
- [ ] Add failed verification attempt limiting
- [ ] Add request body size limits for activation endpoints

Do not deploy `/api/activation/verify` to a publicly reachable production environment until the rate limiting, failed-attempt limiting, and request body size controls above are completed.

## Amazon
- [ ] Replace local test TARGET_ASIN with production SignMaster ASIN
- [ ] Configure production SP-API credentials
- [ ] Add authenticated production order-sync job endpoint
- [ ] Configure production sync schedule
- [ ] Verify GMT/BST scheduling
- [ ] Perform production order-sync smoke test

## Activation
- [ ] Production Order ID verification tested
- [ ] NOT_FOUND behaviour tested
- [ ] NOT_SHIPPED behaviour tested
- [ ] ALREADY_CLAIMED behaviour tested
- [ ] CANCELLED behaviour tested
- [ ] RETURNED behaviour tested after Returns sync is implemented
- [ ] Verify activation never calls Amazon SP-API live
- [ ] Verify entitlement claiming is atomic
- [ ] Final activation E2E test completed

## Authentication
- [ ] Account creation tested
- [ ] Sign-in tested
- [ ] Password reset tested
- [ ] Entitlement/account relationship verified

## Logging
- [ ] Review all console.log / console.error usage
- [ ] Remove unnecessary development logging
- [ ] Keep production logs concise and structured
- [ ] Confirm Amazon credentials/tokens are never logged
- [ ] Confirm Supabase secrets are never logged
- [ ] Confirm Amazon Order IDs are not logged
- [ ] Confirm customer information is not logged

## Application
- [ ] Learn/Quiz flow tested
- [ ] Progress tracking tested
- [ ] Desktop Chrome/Edge/Firefox/Safari checked
- [ ] Mobile Safari and Chrome checked
- [ ] Error and empty states checked

## Deployment
- [ ] Production Supabase configured
- [ ] Production Vercel environment variables verified
- [ ] Full unit test suite passes
- [ ] Playwright E2E suite passes
- [ ] Production build passes
- [ ] Production smoke test completed
- [ ] Final launch review completed
