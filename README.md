# dsh-global-context

Global context for DeepSeek Harness: inject a custom prompt at the **very top of every
session's system prompt**, and edit it from a dedicated **Global Context** tab in the
conversation view.

[中文说明](README.zh.md)

## What it does

1. Injects your text as the first system-prompt section, ahead of the built-in harness
   identity, for every session and model (subagents included).
2. Adds a fourth conversation-view tab (`Global Context`) next to Chat / Trajectory / Context.
3. Applies immediately on save — no restart. The text lives in a plain file
   (`$DSH_HOME/global-context.md` by default) that is re-read per assembly.

## Install

```bash
dsh plugin --profile web add -w <path-or-npm-name>
```

The package declares `dsh.bundle.patch`, so `reconcilePlugins()` appends it to the
profile's `dsh.profile.bundles` automatically. Restart DSH Desktop once afterwards so the
browser-side half loads.

## Layout

| Half | File | Role |
| --- | --- | --- |
| Host | `lib/index.js` | Registers the `systemPrompt` section and an exact route `/api/dsh-global-context` (GET read / POST write) |
| Client | `lib/client.js` | Hand-written `window.__ModuleLoader__` artifact registering a `conversation.view` tab |

Two deliberate safety properties: `apply()` never throws (a failed entry rolls back the
whole profile), and injected text never contains a live `{{...}}` reference (the prompt
renderer throws on unknown variables, which would break every request).

## Test

```bash
DSH_HOME=<your harness dir> node --test test/host.test.mjs test/client.test.mjs
```

## License

MIT
