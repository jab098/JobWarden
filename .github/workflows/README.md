# Continuous integration

`verify.yml` runs the same gate a human runs locally, on every pull request and
every push to `main`.

It requests only `contents: read` and holds **no configured secrets**. The one
token it uses, `GITHUB_TOKEN`, is provisioned automatically by GitHub and is
required by the secret scanner to read a pull request's commits. Every check is
either static or runs against fixtures, so CI needs no Supabase project, no API
key, and no deployed environment.

The checks that _do_ need a real database — `supabase db reset`, the database
lint, and the pgTAP suite — are not here, because they cannot run without
Docker and a project. Run them with `pnpm verify:live` after completing
[the production setup guide](../../docs/setup/production-setup.md). That script
fails rather than skipping when Docker is unavailable, so a database check can
never be recorded as passed when it did not run.
