# Cloudflare Agents SDK

Use current docs: https://developers.cloudflare.com/agents/

- Agents provide SQLite-backed state, WebSocket/RPC clients, schedules, queues, retries, workflows, and MCP integrations.
- Each Agent class needs a Durable Object binding and a new SQLite migration entry; never edit old migrations.
- Extend the platform Agent class and access bindings through `this.env`.
- Route standard requests with `routeAgentRequest` or use `getAgentByName` for custom routing.
- Do not enable legacy `experimentalDecorators` for callable methods.
- Validate current package APIs and Wrangler configuration against the latest docs before implementation.
