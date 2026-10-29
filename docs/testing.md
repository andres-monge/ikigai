# Deterministic tests

Use Node24 and PostgreSQL15. The complete local suite includes unit/component tests, all four real storage suites, and the four legacy route suites. It does not call a live model or Google. Its database work requires an explicit disposable target; it never falls back to the application or auth database.

## Local PostgreSQL prerequisite

Use a task-owned local cluster and an empty admin database named `ikigai_u4_test_admin_*`. A role with `CREATEDB` permission must own it. The admin is a provisioning connection only: do not migrate, clear or run application tests in it. `server/storage.test-database.ts` creates random child databases from `template0`, applies the existing reviewed public migrations and drops only its registered children on teardown.

For a new disposable cluster, an example on macOS with Homebrew PostgreSQL15 is:

```sh
mkdir -p .context/testing
/opt/homebrew/opt/postgresql@15/bin/initdb -D .context/testing/postgres -A trust --no-locale
/opt/homebrew/opt/postgresql@15/bin/pg_ctl -D .context/testing/postgres -l .context/testing/postgres.log -o '-h 127.0.0.1 -p 55432' start
/opt/homebrew/opt/postgresql@15/bin/createdb -h 127.0.0.1 -p 55432 ikigai_u4_test_admin_local
```

Choose an unused local PostgreSQL port; do not take over another cluster. Before reusing a directory, verify its ownership, PostgreSQL version and `pg_ctl status` and inspect the port's listener. Do not start a second server over an existing data directory. This setup is separate from the app on5173 and experiment lab on5174. The example trust authentication is restricted to a disposable cluster bound to loopback, never a shared/application service.

## Run the full suite

Supply the explicit opt-in and the designated local admin URL. Replace `YOUR_LOCAL_ROLE` with the local PostgreSQL role; keep credentials out of committed files and output.

```sh
U4_STORAGE_TEST_DATABASE=1 \
U4_STORAGE_TEST_DATABASE_URL='postgresql://YOUR_LOCAL_ROLE@127.0.0.1:55432/ikigai_u4_test_admin_local' \
npm run test:all -- --run
```

`test:all` validates the local admin namespace before Vitest starts, enters `NODE_ENV=test`, supplies nonsecret required model placeholders and removes inherited application/provider/auth credentials and Node preload options. It does not read `.env`, install or start PostgreSQL, or modify global settings. It forwards Vitest arguments, failures and cancellation signals. A missing/unsafe target fails, rather than skipping database tests. To run a focused file, append its source path after `--run`. `npm run test:storage` remains available with the same designated admin URL and its explicit opt-in, but the complete safe environment entrypoint is `test:all`.

Canonical test discovery is rooted in `server/`, `client/` and `shared/`; ignored `.context` and archived worktree copies are not test suites. Vitest file isolation is explicit. Each database test file owns its migrated child/module lifetime, so whole-table fixture resets cannot touch other suites or concurrent test processes. Legacy route modules and their test assertions receive the same real child before the storage singleton initializes. Cleanup errors fail the suite; there is no swallowed missing-schema success.

The equivalent direct Vitest invocation must provide `NODE_ENV=test`, both U4 variables, a harmless local `DATABASE_URL`, required nonsecret Gemini placeholders, and empty optional provider/auth settings before module imports. Prefer `test:all` so `.env` and inherited personal credentials cannot fill those settings accidentally. Do not run a migration CLI against the application URL to prepare tests.

After the tests, inspect task-owned child cleanup and stop only the disposable cluster you started:

```sh
/opt/homebrew/opt/postgresql@15/bin/pg_ctl -D .context/testing/postgres stop -m fast
```

The admin and data directory may remain for the next local run. After an interrupted run, inspect leftover `ikigai_u4_test_*` children and their ownership before any manual cleanup; never drop by a broad prefix or target an unregistered application database.

`npm run check` and `npm run build` remain separate required gates. Database test success does not establish browser authentication, real-account isolation, live-model quality or founder acceptance.
