# Vercel function packaging check

Run from the linked `ikigai` checkout with Node 24 and the authenticated Vercel CLI. The local project link and pulled environment files stay in ignored `.vercel/`; keep them private. Confirm the project ID before building.

For a preview, run `vercel pull --yes --environment=preview` and `npm run verify:vercel-preview`. This builds the actual Vercel function, removes non-runtime private roots from the prebuilt output, scans all of `.vercel/output` for private paths and selected configured secret values, copies the function outside the checkout, imports it under a fixture-only environment, loads the five canonical Method skills, and checks the signed-out API boundary. Run `node scripts/check-vercel-function.mjs` again immediately before uploading. Deploy only the checked prebuilt output with fixture runtime overrides:

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

For a production release candidate, run `vercel pull --yes --environment=production` and `npm run verify:vercel-production`. This builds and checks the production-target artifact locally; it does **not** deploy it. Vercel may replace non-pullable secret values with `[SENSITIVE]` locally, so this check proves packaging under production build settings, not live auth or provider configuration. Production deployment requires the separate U10 release gates and founder authorization. Repeat the package check immediately before any authorized prebuilt upload.

Plain `npm run build` does not verify Vercel's function output. A bare source or Git deployment bypasses the local preparation and package check; use the verified prebuilt path for this release. The preview smoke proves function startup and an unauthenticated response, not Google sign-in, database access, Method turns, or production recovery.
