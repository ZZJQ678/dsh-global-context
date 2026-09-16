# dsh-global-context

Global context for DeepSeek Harness: inject a custom prompt at the **very top of every
session's system prompt**, and edit it from a dedicated **Global Context** tab in the
conversation view.

[中文说明](README.zh.md)

## What it does

1. **Injects a global context.** Your text becomes the first section of the system prompt —
   ahead of the built-in harness identity — for every session, every model, subagents included.
2. **Adds a conversation-view tab.** A fourth tab, `Global Context`, appears next to
   Chat / Trajectory / Context: a text box you can edit, save and clear.
3. **Applies immediately, no restart.** The text lives in a plain file, re-read per prompt
   assembly, so the next message already carries your edit. Editing the file in Notepad works
   exactly the same.

## Install

```bash
dsh plugin --profile web add -w <path-or-npm-name>
```

The package declares `dsh.bundle.patch`, so `reconcilePlugins()` appends it to the
profile's `dsh.profile.bundles` automatically — no manual config editing.

Restart DSH Desktop once afterwards: the browser-side half (the tab) loads at startup.

## How it shows up in the plugin market

Two different things:

- **Installed locally.** A package installed with `link:` / `file:` is recognised by
  dsh-market and listed under *Installed* with a **`local`** badge (the client-side rule is
  `/^(?:link|file):/i.test(spec)`). `dsh plugin add <local path>` plus a restart is enough.
- **Public catalogue.** The market's search list comes from the curated
  [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) list (built
  into `plugins.json` daily). To be searchable by everyone, publish the package publicly and
  send that list a PR — see [PUBLISHING.md](PUBLISHING.md) for the steps and a ready-made entry.

## Configuration

Override in the profile's `cordis.patch.yml`:

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
`C:\Users\<you>\AppData\Roaming\dsh-desktop\harness\global-context.md`). The tab shows the
real path at the bottom.

- Empty or missing file → nothing is injected.
- To switch it off temporarily, clear the box and save, or set `enabled: false`.

## Verifying a live install

```bash
node scripts/verify-live.mjs
```

It reads the address and token from the harness log by itself, then checks four things:
the host half loaded, the GUI route answers, saving really reaches disk (it backs up and
restores your text; `--no-write` skips that), and the browser half is assembled into the
page's `window.__DSH_BOOT__` and fetchable from `/plugins`.

## Layout

| Half | File | Role |
| --- | --- | --- |
| Host | `lib/index.js` | Registers the `systemPrompt` section and an exact route `/api/dsh-global-context` (GET read / POST write) |
| Client | `lib/client.js` | Hand-written `window.__ModuleLoader__` artifact registering a `conversation.view` tab |

Two deliberate safety properties:

1. **`apply()` never throws.** The DSH loader settles every entry with `Promise.allSettled`,
   and one failure rolls the whole profile back — i.e. DSH would not start. Registration
   failures are logged and degraded instead.
2. **Injected text never contains a live `{{...}}`.** The system-prompt renderer interpolates
   strictly and *throws* on an unknown variable, which would break every request. So `{{` is
   split into `{` + zero-width space + `{`: the renderer never sees a reference group while it
   still looks like `{{`.

The write endpoint enforces same-origin requests and a 256 KB cap, so a stray paste cannot
bloat every request.

## Test

```bash
DSH_HOME=<your harness dir> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

- `test/host.test.mjs` — mounts the **real** SystemPrompt service plus a fake webServer, and
  checks injection position, live file edits, `{{}}` safety, and the route's read/write/refusal paths.
- `test/client.test.mjs` — loads the hand-written artifact in Node with **real React**, checking
  the module-table shape, tab registration, component rendering and API calls.
- `test/manifest.test.mjs` — freezes the host's packaging/loading rules as assertions
  (`exports["./client"]` form, `dsh.client` field types, artifact id must equal the package
  name, zero runtime dependencies, patch `name` must equal the package name). Failing any of
  them costs at worst a missing tab and at best a Web layer that refuses to start.

## License

MIT
