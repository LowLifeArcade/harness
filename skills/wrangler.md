# Wrangler CLI

Use current docs: https://developers.cloudflare.com/workers/wrangler/

- Prefer `wrangler.jsonc` and a current `compatibility_date`.
- Use Bun in this harness: `bunx wrangler ...`.
- Validate with `bunx wrangler types --check`, tests, and `bunx wrangler deploy --dry-run`.
- Deploy with `bunx wrangler deploy [--env NAME]` only after user approval.
- Wrangler 4.102+ supports `deploy --temporary` for a claimable deployment when auth is unavailable; this is still an external write and needs approval.
- Set secrets interactively with `bunx wrangler secret put NAME`; never put secret values in source, config, logs, or command arguments.
- Use distinct Wrangler environments deliberately; bindings and vars may be non-inheritable.
