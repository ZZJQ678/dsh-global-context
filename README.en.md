# dsh-global-context

Global context for DSH: a prompt injected at the **very top of every session's system prompt**, plus a
**Global Context** tab in the conversation view to edit, save and clear it.

[中文说明](README.md)

## What it does

1. **Injects a global context.** Your text becomes the first section of the system prompt — ahead of
   the built-in identity text — for every session, every model, subagents included.
2. **Adds a conversation-view tab.** A stock DSH conversation view has only one tab, `Chat`;
   `Trajectory` and `Context` appear only once plugins add them. This plugin's **Global Context**
   tab sorts itself after the existing tabs and holds a text box you can edit, save and clear.
3. **Applies immediately, no restart.** The text lives in a plain file that is re-read per prompt
   assembly, so your next message already carries the edit. Editing that file in Notepad works too.

## Install

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

The package declares `dsh.bundle.patch`, so it is appended to the profile's `dsh.profile.bundles`
automatically — no manual config editing. **Restart DSH once** so the browser-side half loads.

The package is distributed through GitHub only (it is not published to npm), so the command above is
the complete install instruction.

## How to find it in the plugin market

**Open the plugin market and search for `全局上下文` (or `dsh-global-context`).**

- A locally installed copy shows up under *Installed* with a `local` badge;
- once the public catalogue includes it, it is searchable in the main list too
  (see [PUBLISHING.md](PUBLISHING.md)).

Either keyword works. The detail page renders this repository's `README.md`, which is deliberately the
**Chinese** version ([English here](README.en.md)).

## Configuration

Override by `id` in the profile's `cordis.patch.yml`:

```yaml
- id: dsh-global-context
  config:
    enabled: true      # master switch; false injects nothing (the tab still reads/writes)
    order: -1100       # section order; defaults to the built-in identity section minus 100
    textPath: 'D:\somewhere\my-context.md'   # defaults to $DSH_HOME/global-context.md
    statusPath: 'D:\somewhere\status.json'   # defaults to $DSH_HOME/global-context.status.json
```

## Where the text lives

`$DSH_HOME/global-context.md` by default (on Windows usually
`C:\Users\<you>\AppData\Roaming\dsh-desktop\harness\global-context.md`). The tab shows the real path at
the bottom.

- Empty or missing file → nothing is injected.
- To switch it off temporarily, clear the box and save, or set `enabled: false`.

## Verifying a live install

```bash
node scripts/verify-live.mjs
```

It reads the address and token from the harness log by itself, then checks five things: the host half
loaded, the GUI route answers, saving really reaches disk (it backs up and restores your text;
`--no-write` skips that), the browser half is assembled into the page's `window.__DSH_BOOT__` and
fetchable from `/plugins`, and **which position the tab took** (`rank` should equal the number of
existing tabs plus one).

## Layout

| Half | File | Role |
| --- | --- | --- |
| Host | `lib/index.js` | Registers the `systemPrompt` section and an exact route `/api/dsh-global-context` (GET read / POST write) |
| Client | `lib/client.js` | Hand-written `window.__ModuleLoader__` artifact registering a `conversation.view` tab |

Two deliberate safety properties:

1. **`apply()` never throws.** The DSH loader settles every entry with `Promise.allSettled`, and one
   failure rolls the whole profile back — i.e. DSH would not start. Registration failures are logged
   and degraded instead.
2. **Injected text never contains a live `{{...}}`.** The renderer interpolates strictly and *throws*
   on an unknown variable, which would break every request. So `{{` is split into `{` + zero-width
   space + `{`: the renderer never sees a reference group while it still looks like `{{`.

The write endpoint enforces same-origin requests and a 256 KB cap.

## Test

```bash
DSH_HOME=<your harness dir> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

- `test/host.test.mjs` — mounts the **real** SystemPrompt service plus a fake webServer: injection
  position, live file edits, `{{}}` safety, and the route's read/write/refusal paths.
- `test/client.test.mjs` — loads the hand-written artifact in Node with **real React**: module-table
  shape, tab registration (including its order), component rendering and API calls.
- `test/manifest.test.mjs` — freezes the host's packaging/loading rules as assertions.

## Development note

**The host half, the browser half, the tests and this documentation were written entirely with
DSH (DeepSeek Harness).**

## License

MIT
