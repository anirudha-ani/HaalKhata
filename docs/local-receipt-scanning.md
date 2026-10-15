# Local receipt scanning and permission

Run `./dev.sh` (or `./dev.sh --mobile-ios` / `--mobile-android`). Startup applies
the new `receipt_consents` migration automatically. No additional secrets or
settings are needed for saved permission.

For real extraction, set `RECEIPT_AI_PROVIDERS=compatible`,
`COMPATIBLE_AI_BASE_URL=https://openrouter.ai/api/v1`,
`COMPATIBLE_AI_MODEL=google/gemini-3-flash-preview`,
`RECEIPT_AI_PROCESSORS=OpenRouter and Google (Gemini)` and
`COMPATIBLE_AI_ZDR=true` in the root `.env`, and supply your own
`COMPATIBLE_AI_API_KEY`. Restart after changes. Confirm the actual provider/account
retention settings before relying on them. Local `mock` parsing can exercise the
permission flow without a paid provider, but cannot verify real extraction.
Never add the mock provider to production routing.

1. Sign in normally, open Account → AI receipt scanning, and withdraw any existing
   permission. Sign in to the same account on web and mobile for cross-device tests.
2. Create an expense and select a photo: it is only prepared locally. Tap
   **Itemize with AI**. The first-use prompt names the processors and describes
   future scans on this account. **Enter manually**, close, and back/Escape all
   dismiss without granting permission or uploading a photo.
3. Request the scan again and select **Allow AI scanning**. Permission saves first,
   then the selected image is parsed into a draft. Review and save separately.
4. Create a new expense with another photo, reload, or use the other app: tapping
   **Itemize with AI** scans directly without another permission prompt.
5. Withdraw permission in Account. A scan from the other device, even with stale
   cached state, must ask again. This does not cancel an already-sent scan.
6. Change `RECEIPT_AI_PROCESSORS` locally and restart: the next scan must show the
   new disclosure. Restore it afterward. A routine model-version change within
   the same provider does not ask again. Changes to provider/routing/retention do.
7. Disconnect the backend: permission checks/saves/withdrawal must show an error;
   no new photo is uploaded without a successful permission check.

Browser network inspection should show GetProcessingInfo, then GrantConsent only
when you explicitly allow, then ParseReceipt. Later scans omit GrantConsent.
RevokeConsent changes only the authenticated account; the server checks the saved
permission before every provider call. Test with a different account to confirm
it starts without permission. Backend and client-hook tests cover these cases;
`pnpm test:parity` checks that both apps expose the same RPC entry points.
