# dsh-global-context（全局提示词配置）

一段你自己写的提示词，自动加在每个会话的最前面。

DSH 的系统提示词通常是固定内容，你想让每个会话都遵守某条规则时，只能反复复制粘贴。
这个插件把那段话存成一个文件，每次对话自动放在最前面；你还可以在对话视图里直接改它。

[English](README.en.md)

## 能做什么

**一段话，处处生效。** 你写的内容会排在系统提示词最前面（在 DSH 内置的身份说明之前），
对每个会话、每个模型都生效，子代理也一样。

**在对话视图里新增一个标签页。** 原装 DSH 的对话视图只有「对话」一个标签页，「轨迹」「上下文」
这些是后来装插件才有的。装上本插件后，标签栏最后会多出一个「全局提示词配置」，
里面就是那段话，可以随时改、保存、清空。

**改完立刻生效。** 内容存在普通文本文件里，每次发消息时重新读取 —— 保存后下一条消息就带上了，
不需要重启。你也可以直接用记事本改那个文件。

## 安装

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

装完重启一次 DSH 即可（浏览器里的标签页要重启才会加载）。

## 常见问题

**内容存在哪？**
默认是 `$DSH_HOME/global-context.md`，Windows 上一般在
`C:\Users\<你>\AppData\Roaming\dsh-desktop\harness\global-context.md`。标签页底部会显示实际路径。

**想临时关掉怎么办？**
把文本框清空保存就行，或者把配置里的 `enabled` 设成 `false`。文件为空时不会注入任何内容。

**会不会拖慢每个请求？**
不会。内容只有几 KB 的读写，而且写入接口限制 256 KB，粘错一大段也不会把每个请求都撑大。

**怎么确认它真的生效了？**
在仓库目录里跑 `node scripts/verify-live.mjs`，它会检查注入、保存和标签页是否都正常
（加 `--no-write` 可以跳过写入测试）。每项都会打印 PASS / FAIL。

**高级配置？**
在 profile 的 `cordis.patch.yml` 里按 `id: dsh-global-context` 覆盖，可调 `enabled`、`order`、
`textPath`、`statusPath` 四项。

## 给想改代码的人

| 半边 | 文件 | 作用 |
| --- | --- | --- |
| 宿主 | `lib/index.js` | 注册 `systemPrompt` 段落，并提供路由 `/api/dsh-global-context`（GET 读 / POST 写） |
| 客户端 | `lib/client.js` | 手写的 `window.__ModuleLoader__` 产物，注册 `conversation.view` 标签页 |

两条刻意的安全约束：

1. **`apply()` 永不抛异常。** DSH 加载器用 `Promise.allSettled` 收敛每个条目，一个失败会回滚整个
   profile —— 也就是 DSH 起不来。所以注册失败只记日志并降级。
2. **注入的正文里不会出现活的 `{{...}}`。** 系统提示词渲染器做严格插值，遇到未知变量会抛异常，
   那会让每个请求都失败。因此正文里的 `{{` 会被拆成 `{` + 零宽空格 + `{`：渲染器看不到引用组，
   而肉眼看仍是 `{{`。

跑测试：

```bash
DSH_HOME=<你的 harness 目录> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

宿主半边用**真实的 SystemPrompt 服务**验证注入位置与读写路由（含拒绝路径），客户端半边用
**真实 React** 加载手写产物验证标签页注册与渲染，另有一组断言把宿主的打包规则固定下来。

## 开发声明

本插件的宿主半边、浏览器半边、测试与文档，全程使用 DSH（DeepSeek Harness）编写完成。

## 许可

MIT
