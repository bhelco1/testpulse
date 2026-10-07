---
name: prod-ops
description: Run testpulse operations against the hosted (production) Supabase database safely and verify them. Use this whenever a migration must reach production, `projects:sync` or `project:add` or `project:rotate-key` must run against production, a production value needs checking, or the user says "push the migration", "sync the projects", "register the project", "is it live", even when "production" isn't said but the hosted database is meant.
---

# Production operations (testpulse)

Production is the hosted Supabase project behind the public site. Mistakes there are visible and some can't be undone, and the secret key must never appear in a terminal, log, file or commit. So every operation is: confirm it's approved, dry-run where possible, act with the key kept in a variable, then verify the effect the way a visitor sees it.

## Before anything

- **Approval.** Each production change needs Bobby's approval for that change (a standing "apply it after merge" counts). Reading production with the publishable key doesn't.
- **Order.** Only run what is merged on `main`. Pull first.
- **Compatibility.** The deployed app may be older than `main` (deploys can lag). Before a migration, confirm the deployed app keeps working against the migrated database, and push the migration first when the new app depends on it.

## Credentials (never print them)

- Hosted project ref: `hgdjmafltgrcuggrajku` (`https://hgdjmafltgrcuggrajku.supabase.co`).
- Database password, for `supabase db push`: `export SUPABASE_DB_PASSWORD=$(security find-generic-password -s testpulse-supabase-db-password -w)`, then `unset` it after.
- Admin key for the scripts: the CLI masks the new `sb_secret_` key, so use the legacy `service_role` key, held in a variable:
  `KEY=$(supabase projects api-keys --project-ref hgdjmafltgrcuggrajku -o json | jq -r '.[]|select(.name=="service_role")|.api_key')`
- Publishable key, for verifying as a visitor: the `sb_publishable_` entry from the same listing.
- Pipe any script output through `sed -E 's/(sb_|eyJ)[A-Za-z0-9._-]+/[redacted]/g'`, and `unset` keys when done.

## Migrations

1. `supabase db push --dry-run`: it must list exactly the migrations you expect, and nothing else.
2. If a migration redefines a function, diff its body against the previous definition before pushing (see the agent-pr-loop skill).
3. Capture a before-value that the migration should change (e.g. one run's `started_at`).
4. `supabase db push --yes`, then `supabase migration list --linked` to confirm it applied.
5. Verify with the publishable key through REST (`/rest/v1/<table or view>?select=…`): the new column or behaviour is visible to anon where the spec says, nothing private is exposed, and the before-value changed as intended. Also count rows that would show a mistake (e.g. nulls in a new NOT NULL column).

## projects:sync and registering projects

- Sync: `NEXT_PUBLIC_SUPABASE_URL=https://hgdjmafltgrcuggrajku.supabase.co SUPABASE_SECRET_KEY="$KEY" npm run -s projects:sync`, output redacted. It never touches API keys. Expect "updated" for changed files and "skipped" for a YAML with no row yet.
- Then check the live page shows the change (e.g. `curl` the project page and grep for the new value). The site may be cached or a deploy behind, so say which.
- `project:add <slug>` and `project:rotate-key <slug>` print a reporting key once. That key belongs only in the reporting repo's `TESTPULSE_TOKEN` Actions secret. Send it straight there without displaying it (pipe it into `gh secret set TESTPULSE_TOKEN -R <owner>/<repo>`), or have Bobby run the command with `! ` so the output lands only in his terminal. Never write it to a file.

## After

Record in memory what ran, when, and the verification result. Tell Bobby in plain words what changed on production and how you know.
