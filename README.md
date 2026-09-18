# dsh-global-context（全局提示词配置）

装上以后，对话视图里会多出一个「全局提示词配置」标签页。写进去的内容会加在每个会话系统提示词的最前面，保存后下一条消息就生效，不用重启。

[English](README.en.md)

## 安装

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

装完重启一次 DSH。

正文默认存在 `$DSH_HOME/global-context.md`，标签页底部会显示实际路径，也可以用记事本直接改这个文件。清空保存就不再注入。

## 开发声明

本插件全程由 deepseek-v4.1-flash 完成。

## 许可

MIT
