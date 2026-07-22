# Cloudflare platform

Use current Cloudflare documentation as the source of truth: https://developers.cloudflare.com/

- Workers: serverless edge compute.
- Pages: full-stack/static sites with Git-based deployment.
- D1: relational SQLite; KV: globally distributed key/value; R2: object storage.
- Durable Objects: strongly consistent per-entity state and coordination.
- Queues: buffered async work; Workflows: durable multi-step execution.
- Workers AI: inference; Vectorize: vector search; Agents SDK: stateful AI agents.
- Prefer bindings from Workers instead of calling Cloudflare REST APIs at runtime.
- Never guess current limits, prices, API signatures, or binding shapes; retrieve current docs or installed types.
