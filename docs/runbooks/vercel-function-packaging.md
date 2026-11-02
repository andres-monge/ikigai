# Vercel function packaging check

Current check selection and target-bound evidence: [Verify Nami](nami-verification.md) and [scenario matrix](nami-verification-scenarios.md). Local/fixture results never substitute for actual auth-enabled integration.

Run from the linked `ikigai` checkout with Node 24 and the authenticated Vercel CLI. The local project link and pulled environment files stay in ignored `.vercel/`; keep them private. Confirm the project ID before building.

For a preview, run `vercel pull --yes --environment=preview` and `npm run verify:vercel-preview` with a process-scoped, approved HTTPS `BETTER_AUTH_URL` origin. The preview environment currently lacks this setting, so use a fixture origin for local package checks without changing remote configuration. This builds the actual Vercel function, removes non-runtime private roots from the prebuilt output, scans all of `.vercel/output` for private paths and selected configured secret values, checks that generated share URLs match `BETTER_AUTH_URL`, copies the function outside the checkout, imports it under a fixture-only environment, loads the five canonical Method skills, and checks the signed-out API boundary. Run `node scripts/check-vercel-function.mjs` again with the same process-scoped origin immediately before any separately authorized upload. **Startup-only fixture preview recipe (separate deployment authorization required):** The following intentionally disables app auth/agent/DB and cannot pass live Method/sign-in readiness. It is not the auth-enabled release recipe. Upload only checked prebuilt output:

```sh
vercel deploy --prebuilt --environment preview --yes \
  --env AGENT_ENABLED=false --env AUTH_SIGNUPS_ENABLED=false \
  --env DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture \
  --env BETTER_AUTH_DATABASE_URL= --env BETTER_AUTH_SECRET= --env BETTER_AUTH_URL= \
  --env GOOGLE_CLIENT_ID= --env GOOGLE_CLIENT_SECRET= \
  --env GEMINI_API_KEY=fixture-key-not-a-credential --env GEMINI_REASONING_MODEL=fixture-model \
  --env GROQ_API_KEY= --env OPENAI_API_KEY= --env YOUTUBE_API_KEY=
```

Probe only signed-out GET routes unless the preview database and auth environment have been separately proven isolated. Inspect deployment status and runtime logs for module errors.

For a production release candidate, run `vercel pull --yes --environment=production` and `npm run verify:vercel-production` with a process-scoped, approved HTTPS `BETTER_AUTH_URL` origin. This builds and checks the production-target artifact locally; it does **not** deploy it. Vercel may replace non-pullable secret values with `[SENSITIVE]` locally, so this check proves packaging under production build settings, not live auth or provider configuration. Production deployment requires the separate U10 release gates and founder authorization. Repeat the package check with the same origin immediately before any authorized prebuilt upload.

Plain `npm run build` does not verify Vercel's function output. A bare source or Git deployment bypasses the local preparation and package check; use the verified prebuilt path for this release. The preview smoke proves function startup and an unauthenticated response, not Google sign-in, database access, Method turns, or production recovery.

The preparation also removes `filePathMap` entries whose source or destination is rooted in `.claude`, `.context`, `docs`, or `scripts`. Vercel resolves these mapping values against the repository, rather than the function directory, and can upload referenced files separately. Physical directory removal alone is insufficient. Keep `.vercelignore` exclusions intact. The checker validates every function's mapping metadata, rejects private, missing and symlink references, and applies the current source exclusions (`*.test.ts` and nested `dist`, `tests`, `docs`, `scripts`) with the uploader's `node_modules` exception. Private/secret path checks still apply inside dependencies. It scans mapped source bytes for selected configured secrets and materializes allowed runtime references for the isolated import probe. This intentionally accepts only the current runtime roots and regular files; a future source-layout or ignore-policy change needs an explicit check update. Run the fictional metadata regression with `node --test scripts/vercel-file-path-map.test.mjs` under Node 24. A successful local check still requires a ready staged prebuilt deployment and actual routing verification before promotion.

The feedback boundary is included in the isolated import probe: malformed metadata must return403 before parsing, and a correctly tagged signed-out request under the fixture origin must return503 without database/email work. Email credentials are empty in that runtime. The audit includes `RESEND_API_KEY` from local pulled environment metadata and the checker process environment. Both package verification scripts also run `scripts/check-vercel-feedback.test.mjs`, which places a synthetic canary in the local output, proves the audit rejects it without echoing it, and removes it in a finally block. This is local package/guard proof, not email activation or production database access.
