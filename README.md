# Verity

A claim-checking app for text, article images and recorded voice, with a calm sage-and-teal interface and browser-local history.

**Live app:** [Open Verity](https://verity-fact-studio.forgivingtide2.chatgpt.site)

## Run locally

Use Node.js 22 or later (development and checks use Node.js 24). The local server needs no package installation.

```sh
npm start
```

Open the local address printed by the server. To use another port, copy `.env.example` to `.env` and change `PORT`.

On Windows, open `/settings` at the same local address to connect your own research-service key. The key is encrypted for the current Windows account and stored in the ignored `.verity-connection` file. The local settings route requires same-origin access and its temporary page token. Environment variables can also supply a server-side key. Never put a key in frontend JavaScript or commit `.env`.

The existing deployed app uses hosted secrets; cloning this repository does not copy its credentials or grant access to its deployment.

## Features

- Separate text, image-upload and recorded-voice inputs.
- Voice transcription with transcript review before checking; audio-file upload fallback.
- Direct True and False verdicts when the retrieved evidence supports them.
- Misleading, Mixed findings, Unverified and Needs context results when appropriate.
- Full reference passages, relevant recent news, and a focused follow-up lookup for inconclusive assessments.
- Quotations checked against retrieved source text, with supporting sources collapsed by default.
- Evidence coverage percentage, downloadable JSON reports, and the latest 50 checks saved in this browser.
- Private server-side provider configuration and three branded interface choices: Verity Swift, Scout and Lens.

Branded choices map to Gemini models; they are not independently trained models. Availability, free allowances and any charges depend on the connected provider account. The application does not enable billing or evade quotas.

## Evidence and limitations

For broad web and news research, configure `TAVILY_API_KEY` in the ignored local `.env` or in hosted runtime secrets. Without this key, the interface identifies coverage as limited. Tavily search uses basic depth with automatic upgrades disabled and accepts full article text as evidence. A generated search answer or headline snippet is insufficient. Search terms go to Tavily, and retrieved passages go to the assessment provider. Quota and connection failures are shown as unavailable research, rather than a completed unverified check. Provider account limits and terms apply.

Verity retrieves Wikipedia reference passages and recent public news text from BBC, The Guardian, NPR, The Indian Express, The Hindu and the Indian Prime Minister's public feed. It checks dates, people and claim context, and rejects some unsupported conclusions such as using a general public greeting to disprove a same-day arrest claim. There are also narrow public-record checks for USD/INR exchange-rate claims and Google's CEO listing.

This is a prototype with limited source coverage. No general accuracy percentage has been established. The displayed evidence percentage counts claims with a decisive verdict and a citation; it is not the probability that a verdict is correct. Sources and model reasoning can be wrong. Missing evidence cannot establish False, and image text extraction does not establish image authenticity. Article-URL fetching is not implemented.

Text, images and voice clips go to the configured AI provider; search terms go to reference sources. Relevant public passages are sent for assessment. Provider data-use terms apply. API keys stay on the server. History stores submitted text and reports in browser storage, and never stores uploaded images or audio. Clear it in the History view or the browser's site settings.

## Tests

```sh
npm test
```

The tests cover input isolation, recording lifecycle, credential handling, source retrieval, citation membership, claim identity, evidence percentages, history and API validation. Test fixtures use mocked external services and do not require a real API key.

## Hosted version

`hosted-verity/` contains the Cloudflare-compatible Worker source used by the hosted app. See its README for the build steps. Runtime secrets and the current Site identity are deliberately excluded from this repository. GitHub stores the source; GitHub Pages alone cannot run this backend.

## Project layout

```text
public/                 Interface, original artwork, fonts and browser modules
test/                   Automated verification tests
server.mjs              Local HTTP server
reference-research.mjs   Evidence retrieval and claim assessment
reference-sources.mjs    Full-reference passage selection
live-news.mjs           Publisher-feed and article retrieval
hosted-verity/          Portable Worker and build scripts
```

Font licenses are included beside the font files in `public/assets/`.
