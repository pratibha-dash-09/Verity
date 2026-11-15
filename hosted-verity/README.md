# Verity

Full hosted version of the Verity fact checker. Uses a Cloudflare-compatible Worker to serve the interface and handle text, article images and voice transcription. Check history stays in each visitor's browser.

## Build and check

`npm ci`, then `npm run build` and `node scripts/check-worker.mjs`.

Runtime secrets are configured through Sites, never committed: `GEMINI_API_KEY`, `VERITY_MODELS` (a JSON array of available model IDs), and optionally `TAVILY_API_KEY` for broad web/news search. Without the search key, the interface identifies coverage as limited. The public site exposes only Verity model names and has no credential-management route. Keep provider accounts on their free plans to avoid paid usage.

Search uses basic depth with automatic parameter upgrades disabled. Only retrieved full article text is treated as source evidence; a generated search answer or headline snippet is insufficient. Search failures become a service-unavailable result when no conclusion can be established. Secrets and raw provider error messages are never returned to the browser.

The source modules in `worker/lib` are portable copies of the local application's checking pipeline. `scripts/sync-local.mjs` refreshes only explicitly allowed public files and server modules from the parent local app; review and rebuild after syncing. The production build contains only the Worker and hosting manifest.

Evidence can be insufficient. Verity must preserve Unverified or Check unavailable results instead of guessing a true/false verdict. Public API limits are best-effort per isolate, not a global quota guarantee.
