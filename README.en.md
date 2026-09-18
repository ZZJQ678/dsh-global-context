# dsh-global-context

Adds a "Global Prompt" tab to the conversation view. Whatever you write there is prepended to every session's system prompt, and saving takes effect on the next message — no restart needed.

[中文说明](README.md)

## Install

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

Restart DSH once afterwards.

The text is stored at `$DSH_HOME/global-context.md` by default. The tab shows the real path, and you can edit that file in any text editor instead. Clearing the box and saving stops the injection.

## Development note

Built entirely with deepseek-v4.1-flash.

## License

MIT
