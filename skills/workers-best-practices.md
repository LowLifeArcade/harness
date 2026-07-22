# Workers best practices

Use current docs: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/

- Use `wrangler.jsonc`, today's compatibility date for new Workers, and `nodejs_compat` when libraries need Node built-ins.
- Generate `Env` with `wrangler types`; do not hand-write binding interfaces.
- Stream large or unbounded bodies and enforce input size limits before buffering.
- Track every promise with await, return, or `ctx.waitUntil()`; do not destructure `ctx.waitUntil`.
- Do not keep request-scoped mutable state at module scope.
- Use bindings, service bindings, Hyperdrive, Queues, and Workflows where appropriate.
- Enable logs/traces for production and emit structured JSON logs.
- Use Web Crypto for security and explicit structured error handling.
