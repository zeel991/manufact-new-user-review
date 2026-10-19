# Building and publishing an MCP App with Manufact: what I hit, and fixes

**Zeel Darji** · 2026-10-20

I went through everything Manufact offers before signup, the way a new customer evaluating it would:
1. Followed the v2 quickstart.
2. Built a small real MCP App ([Perps Pulse](perps-pulse/): live Hyperliquid perp markets with a React view).
3. Ran it through the mcp-use Inspector, the CLI client and the tunnel.
4. Scored it with the free [MCP catalog report](https://manufact.com/mcp-catalog).
5. Fixed what I could in `mcp-use`.

Setup: macOS on Apple M5, Node 24.19.0, `create-mcp-use-app` 2.0.10, `mcp-use` 2.10.1, `@mcp-use/cli` 4.4.1, and `mcp-use/mcp-use` at `eec124c` (2026-10-18). No account was used at any step.

## What worked well

- **Scaffolding:** a working MCP App in 38 seconds.
- **Typecheck:** `mcp-use typecheck` covers views too. I checked by planting a type error in a view, and it was caught.
- **Tunnel:** `mcp-use start --tunnel` gave me a public URL in seconds with no account.
- **Free catalog report:** anonymous, clear "How to fix" text, and fast to re-run.
- **Result:** the app went from **92 to 96/100 (A+)** after two metadata fixes.

## Findings, most important first

### 1. A fresh `mcp-apps` app is missing two things your own ChatGPT check requires

My app followed the template's view setup, and its first score was 92. The **MCP Apps** section scored 77/100, for two reasons. The unmodified template also lacks both fields: I checked its `tools/list` and view config, but didn't score it separately.

| Check | Result | Why a new developer hits it |
|---|---|---|
| View resources declare a domain | **error** (ChatGPT) | The v2 docs never mention `view.domain`. OpenAI's reference says `_meta.ui.domain` is "required when submitting a plugin with UI". |
| Tool invocation metadata present | warning (ChatGPT) | The v2 migration guide removed `invoking`/`invoked` ("the native View configuration does not emit those OpenAI-specific overlay fields"). The checklist still asks for them. |

After I set `view.domain` and the two `openai/toolInvocation/*` keys, MCP Apps scored 100/100 and the overall score was 96.

The SDK's defaults and the checklist disagree, so every new MCP App developer gets an error the SDK steered them into. I know defaulting the domain was tried and dropped (#2050), and #2511 deliberately keeps "no domain unless set". So I see three options:

- **Docs.** Say it where people build. *Patch 03 adds a "Prepare for ChatGPT submission" section to the MCP Apps quickstart.*
- **Cloud.** When Manufact Cloud deploys an app, it already knows the gateway origin (`<slug>.run.mcp-use.com`). It could offer to set the view domain, or `mcp-use deploy` could warn when a view has none.
- **Labels.** Decide whether invocation labels matter. Either the checklist drops the warning, or the template sets them. *Patch 04 adds them to the template; take it only if you want that direction.*

### 2. The checklist's fix text for invocation labels reads like the wrong shape

The "How to fix" text says to "add openai/toolInvocation with string fields invoking and invoked". That reads like a nested object. OpenAI's reference uses flat keys: `"openai/toolInvocation/invoking"` and `"openai/toolInvocation/invoked"`, each up to 64 characters. Your checker accepts the flat keys (my re-run passed), so only the wording needs changing. This is in the hosted product, so there's no PR from me.

### 3. Tool documentation scores move between runs with no relevant change

Here are two reviews 3 minutes apart:

| Tool | What changed between runs | Inputs score | Tool score |
|---|---|---|---|
| `get-market` | Nothing | 82 → 86 | 86 → 88 |
| `market-overview` | Only `_meta` and `view.domain`; input schema identical | 88 → 75 | 90 → 87 |

Score history is the thing you ask people to sign up for. A 13-point swing on an unchanged input schema will make developers distrust it. You could cache grades by a hash of the tool definition, fix the grader's sampling, or show a range.

### 4. Step 4 of the quickstart fails on Node 24

`npx mcp-use client connect …` installs `@mcp-use/client` and then reports "@mcp-use/client is not installed". It happened on the first run in both projects I made; the second run works.

This is #2870, and the issue author had only reproduced it on Windows and WSL. I'm confirming it on macOS. The fix (#2871) has been open since 2026-10-19. The issue says CI runs on Node 22.23.1, so adding Node 24 to the CI matrix would catch this class of bug.

### 5. Scaffolding floods non-interactive output, including coding agents

Clack's spinner stops animating only when `CI=true`. When output is piped, or a coding agent runs the scaffolder, every frame is printed. With `--template mcp-apps --install` that was **382 frames (18 KB)** of output. That's context an agent spends on spinner frames, and your quickstart's first path is "Build with an agent".

*Patch 01:*
- **Change:** one plain line per update when stdout isn't a terminal.
- **Effect:** with the same flags, the published version printed 23 frames (2,690 bytes); the patched build prints one line (1,759 bytes total).
- **Tests:** 37/37 pass.

### 6. The template says "undefined"

Running `show-app` without `appName` returns "The MCP App starter for **undefined** is ready!". The getting-started quickstart shows a `?? "my project"` fallback. The MCP Apps quickstart documents the `undefined` output instead.

*Patch 02:* adds the fallback to the template and fixes the docs. Verified on a fresh scaffold.

### 7. Smaller things

- **Telemetry.** The local Inspector sends PostHog events (`eu.i.posthog.com`) when tools run. `MCP_USE_ANONYMIZED_TELEMETRY=false` turns it off, but the only notice I found is a debug log line, and the docs have a telemetry page for Python only. A TypeScript page and a one-line notice on first run would help with trust.
- **Model context in the Inspector's Tools tab.** The starter's `<ModelContext>` gets `-32601 Method not found` there. #2623 says this is by design. Even so, a read-only "what the model would see" panel would let people check model context without setting up Chat and an LLM key.
- **"Supports: Prompts".** The catalog lists Prompts for a server with zero prompts, because the SDK advertises the `prompts` capability by default.
- **Inspector console errors.** For a server without auth, the Inspector logs two OAuth discovery 404s as errors on every load. That's normal behaviour, but it looks like something broke.

## Patches

The four patches are in [`patches/`](patches/). Each is one commit with a changeset where the repo requires one, and all four apply together on `main` @ `eec124c`. I haven't opened PRs, so you can decide which ones you want. I'm happy to open any of them.

| Patch | What it changes | Checks run |
|---|---|---|
| `01-fix-scaffold-spinner-non-tty` | Plain progress lines off-TTY, plus 2 unit tests | vitest 37/37, `tsc`, `eslint`, Prettier, real piped scaffold |
| `02-fix-template-undefined-app-name` | Fallback app name in the template and docs | vitest 35/35, fresh scaffold + `tools/call`, typecheck |
| `03-docs-chatgpt-view-domain` | ChatGPT submission section in the MCP Apps quickstart | Docs only; wording checked against OpenAI's reference |
| `04-feat-template-invocation-labels` | Invocation labels on the template's view tool (optional, see finding 1) | vitest 35/35, fresh scaffold + `tools/list`, typecheck |

## What I'd test next

This covered the path before signup: SDK, Inspector, CLI, tunnel and the free catalog report. The next stretch of the journey is signed in:

- Deploying to Manufact Cloud.
- The dashboard checklist and autofix.
- The end-to-end ChatGPT and Claude checks.
- The submission pack.

I'd go through those the same way.
