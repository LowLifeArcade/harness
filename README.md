# LowLifeArcade

LowLifeArcade is an arcade-styled coding-agent TUI with Cloudflare permanently selected as its home turf. Ask it to make anything; when you do not specify an architecture, it builds the simplest suitable Cloudflare Workers app, validates the Worker path, and gets it ready to deploy.

There is no new-project wizard. Framework, storage, and Cloudflare product choices come from the request and the repository already open in your shell.

## Run

Prerequisites: [Bun](https://bun.sh/) and the Codex CLI, signed in with your ChatGPT/Codex account.

```bash
codex login
bun install
bun start
```

LowLifeArcade uses the saved Codex CLI login by default, so `OPENAI_API_KEY` is not required.
It runs Codex with `--ignore-user-config` so unrelated personal plugins, MCP servers, and model defaults cannot break the harness. Saved authentication and installed filesystem skills remain available.

Optional settings:

- `LOWLIFE_MODEL` — Codex CLI model, default `gpt-5.4`.
- `LOWLIFE_CONTEXT_WINDOW` — capacity used by the token meter, default `1050000`.

Run LowLifeArcade from the directory you want it to work in. Existing projects are changed in place. For a new app, start in an empty directory and describe what you want.

## Cloudflare behavior

- Cloudflare Workers is the default runtime and deployment target.
- Framework and data products are chosen from the actual requirements.
- The agent uses installed Cloudflare, Wrangler, and Workers best-practice skills.
- Bun and `bunx` are preferred for project commands.
- Meaningful app changes are checked against the Cloudflare build/runtime path, dry-run, and deployed by default when Wrangler is authenticated.
- Live deployments only count when Wrangler confirms them; missing auth or secrets produce an exact next command.

Commands:

- `/clear` — reset the coding conversation.
- `/debug` or `F2` — show or hide the in-TUI debug console.
- `/help` — display the command list in the transcript.
- `Ctrl+C` — quit.

Typing `/` opens the slash-command palette. Continue typing to filter, use ↑/↓ to select, press Tab to autocomplete, and press Enter to run the completed command.

## Inspect prompt errors

The in-TUI debug console is hidden by default. Toggle it at runtime with `F2` or `/debug`. To open it automatically at startup, run:

```bash
LOWLIFE_DEBUG=1 bun start
```

It shows raw Enter detection, input submission, Codex lifecycle events, stderr, tool activity, and final failures.

For a persistent log, run the debug build and redirect its diagnostic stream to a file so OpenTUI can keep control of the terminal:

```bash
bun run debug 2> lowlife-debug.log
```

In another terminal, follow the log:

```bash
tail -f lowlife-debug.log
```

Press Enter in LowLifeArcade. A working submission begins with `input submitted`, followed by `send`, `thread.started`, and `turn.started`. If `input submitted` is absent, the problem is keyboard/input handling. If it appears without `thread.started`, inspect the following Codex CLI error. Debug logs can include Codex warnings and command metadata, so review them before sharing publicly.

To bypass the interface and test the underlying login directly:

```bash
codex exec --json --ignore-user-config --sandbox read-only -m gpt-5.4 --skip-git-repo-check "Reply exactly PONG"
```

## Verify

```bash
bun test
bun run typecheck
bunx wrangler --version
```
