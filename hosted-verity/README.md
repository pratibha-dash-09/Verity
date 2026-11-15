# Verity

Full hosted version of the Verity fact checker. Uses a Cloudflare-compatible Worker to serve the interface and handle text, article images and voice transcription. Check history stays in each visitor's browser.

## Build and check

Use Node.js 24. Run `npm ci`, then copy `.openai/hosting.example.json` to `.openai/hosting.json`. The example is sufficient for a local build check; set the exact project ID returned by Sites before publishing. The real manifest stays ignored.

Run `npm run build`, `npm run validate` and `node scripts/check-worker.mjs`. The build emits `dist/server/index.js` and `dist/.openai/hosting.json`.

Runtime secrets are configured through Sites, never committed: `GEMINI_API_KEY` and `VERITY_MODELS` (a JSON array of available model IDs). The public site exposes only Verity model names and has no credential-management route. Keep the shared API account on its free allowance to avoid paid usage.

The source modules in `worker/lib` are portable copies of the local application's checking pipeline. `scripts/sync-local.mjs` refreshes only explicitly allowed public files and server modules from the parent local app; review and rebuild after syncing. The production build contains only the Worker and hosting manifest.

Evidence can be insufficient. Verity preserves Unverified, Needs context or Check unavailable results instead of guessing a true/false verdict. Public API limits are best-effort per isolate, not a global quota guarantee. Production publication is managed separately from GitHub; the included GitHub Actions workflow tests and builds but does not deploy or access live secrets.
