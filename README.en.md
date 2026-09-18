# dsh-global-context

A prompt you write once, prepended to every session.

DSH's system prompt is fixed. When you want every session to follow one particular rule, you end up
copy-pasting it. This plugin keeps that text in a file, puts it at the very top of every prompt, and
gives you a tab in the conversation view to edit it.

[中文说明](README.md)

## What it does

**One text, applied everywhere.** Your text leads the system prompt (ahead of DSH's built-in identity
text) for every session, every model, subagents included.


**Takes effect immediately.** The text lives in a plain file that is re-read per message, so saving is
enough — no restart. Editing that file in Notepad works just as well.

## Install

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

Restart DSH once afterwards (the browser-side tab loads on restart).

## FAQ

**Where is the text stored?**
`$DSH_HOME/global-context.md` by default — on Windows usually
`C:\Users\<you>\AppData\Roaming\dsh-desktop\harness\global-context.md`. The tab shows the real path.

**How do I turn it off?**
Clear the box and save, or set `enabled: false` in the config. An empty file injects nothing.

**Does it slow down every request?**
No. It reads and writes a few KB, and the write endpoint caps input at 256 KB, so a bad paste cannot
bloat every request.

**How do I confirm it works?**
Run `node scripts/verify-live.mjs` in the repository. It checks injection, saving and the tab, and
prints PASS / FAIL per item (`--no-write` skips the write test).

**Advanced configuration?**
Override by `id: dsh-global-context` in the profile's `cordis.patch.yml`: `enabled`, `order`,
`textPath`, `statusPath`.

## For contributors

| Half | File | Role |
| --- | --- | --- |
| Host | `lib/index.js` | Registers the `systemPrompt` section and the route `/api/dsh-global-context` (GET read / POST write) |
| Client | `lib/client.js` | Hand-written `window.__ModuleLoader__` artifact registering a `conversation.view` tab |

Two deliberate safety properties:

1. **`apply()` never throws.** The DSH loader settles every entry with `Promise.allSettled`, and one
   failure rolls the whole profile back — i.e. DSH would not start. Registration failures are logged
   and degraded instead.
2. **Injected text never contains a live `{{...}}`.** The renderer interpolates strictly and throws on
   an unknown variable, which would break every request. So `{{` is split into `{` + zero-width space
   + `{`: the renderer never sees a reference group while it still looks like `{{`.

Run the tests:

```bash
DSH_HOME=<your harness dir> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

The host half runs against the **real SystemPrompt service** (injection position, read/write route,
refusal paths); the client half loads the hand-written artifact with **real React** (tab registration
and rendering); a third suite freezes the host's packaging rules as assertions.

## Development note

The host half, the browser-side half, the tests and this documentation were written entirely with
DSH (DeepSeek Harness).

## License

MIT
