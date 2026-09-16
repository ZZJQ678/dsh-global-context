# dsh-global-context（全局上下文配置）

给 DSH 加一个**全局上下文**：你写的一段提示词会自动注入到每个会话系统提示词的最顶部，
并在对话视图里新增一个「全局上下文配置」标签页，随时编辑、保存、清空。

[English](README.en.md)

## 它做什么

1. **注入全局上下文。** 你写的文字会成为系统提示词的第一段 —— 排在 DSH 内置的身份说明之前 ——
   对每个会话、每个模型都生效，子代理同样生效。
2. **在对话视图新增一个标签页。** 原装 DSH 的对话视图**只有「对话」一个标签页**，
   「轨迹」「上下文」等是后续装插件才有的；本插件新增「全局上下文配置」，里面是一个可以直接
   **编辑、保存、清空**的文本框。
   **位置是运行时自己找的**：读插槽里已有标签页的排序值，停在**第一个空位** —— 也就是紧跟在
   最后一个之后（已有对话/轨迹/上下文三个时，它就是第 4 个）；如果之后有插件插到它前面，
   它会自动往后让一位。插槽不提供探测接口时退回一个大值 `900`，效果同样是排在最后。
3. **保存即生效，不用重启。** 正文存在一个普通文本文件里，每次组装提示词时重新读取，
   所以保存后下一条消息就带上了。直接用记事本改那个文件也一样有效。

## 安装

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

本包声明了 `dsh.bundle.patch`，装完会自动写进 profile 的 `dsh.profile.bundles`，不需要手工改配置。
**装完重启一次 DSH**，浏览器半边的标签页才会加载。

> 本包的 npm 包名是 **`dsh-global-context`**（该名字在 npm 上尚未被占用）。
> 发布到 npm 之后，安装命令可以直接写成 `dsh plugin --profile web add -w dsh-global-context`。

## 在插件市场里怎么找到它

**打开插件市场，搜索 `全局上下文`（或 `dsh-global-context`）就能看到它。**

- 本机已经装好的，会出现在「已安装」列表里，并带一个「本地开发」标签；
- 被公开目录收录后，在搜索列表里同样能搜到（收录流程见 [PUBLISHING.md](PUBLISHING.md)）。

市场搜索会匹配 **包名、安装来源、描述（按界面语言）、作者** 四个字段，所以上面两个关键词都能命中。
进入插件详情页后，页面正文就是本文件 —— 也就是**中文**。

## 配置

在 profile 的 `cordis.patch.yml` 里按 `id` 覆盖：

```yaml
- id: dsh-global-context
  config:
    enabled: true      # 总开关；false 时什么都不注入（标签页仍可读写）
    order: -1100       # 段落序号；默认是内置身份段落序号减 100
    textPath: 'D:\somewhere\my-context.md'   # 默认 $DSH_HOME/global-context.md
    statusPath: 'D:\somewhere\status.json'   # 默认 $DSH_HOME/global-context.status.json
```

## 正文存在哪

默认 `$DSH_HOME/global-context.md`（Windows 上通常是
`C:\Users\<你>\AppData\Roaming\dsh-desktop\harness\global-context.md`）。标签页底部会显示真实路径。

- 文件为空或不存在 → 不注入任何内容；
- 想临时关掉：把文本框清空保存，或把 `enabled` 设为 `false`。

## 验证装好了没有

```bash
node scripts/verify-live.mjs
```

脚本会自己从 harness 日志里读到地址与令牌，然后检查五件事：宿主半边是否加载、GUI 路由是否应答、
保存是否真的落盘（会先备份再还原你的正文，加 `--no-write` 可跳过）、浏览器半边是否已进入
页面里的 `window.__DSH_BOOT__` 且能从 `/plugins` 取到，以及**标签页排到第几位**
（`rank` 应当等于已有标签页数量 + 1）。

## 目录结构

| 半边 | 文件 | 作用 |
| --- | --- | --- |
| 宿主 | `lib/index.js` | 注册 `systemPrompt` 段落，并提供精确路由 `/api/dsh-global-context`（GET 读 / POST 写） |
| 客户端 | `lib/client.js` | 手写的 `window.__ModuleLoader__` 产物，注册 `conversation.view` 标签页 |

两条刻意的安全约束：

1. **`apply()` 永不抛异常。** DSH 加载器用 `Promise.allSettled` 收敛每个条目，一个失败会回滚整个
   profile —— 也就是 DSH 起不来。所以注册失败只记日志并降级。
2. **注入的正文里不会出现活的 `{{...}}`。** 系统提示词渲染器做严格插值，遇到未知变量会**抛异常**，
   那会让每个请求都失败。因此正文里的 `{{` 会被拆成 `{` + 零宽空格 + `{`：渲染器看不到引用组，
   而肉眼看仍是 `{{`。

写入接口限制同源请求与 256 KB 上限，避免误粘贴把每个请求都撑大。

## 测试

```bash
DSH_HOME=<你的 harness 目录> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

- `test/host.test.mjs` —— 挂载**真实的** SystemPrompt 服务加一个假 webServer，验证注入位置、
  文件实时生效、`{{}}` 安全处理，以及路由的读 / 写 / 拒绝三条路径。
- `test/client.test.mjs` —— 在 Node 里用**真实 React** 加载手写产物，验证模块表结构、标签页注册
  （含排序）、组件渲染与接口调用。
- `test/manifest.test.mjs` —— 把宿主的打包与加载规则固化成断言（`exports["./client"]` 形式、
  `dsh.client` 字段类型、产物 id 必须等于包名、零运行时依赖、补丁 `name` 必须等于包名）。
  这些断言任何一条挂掉，轻则少一个标签页，重则整个 Web 层起不来。

## 开发声明

**本插件的宿主半边、浏览器半边、测试与文档，全程使用 DSH（DeepSeek Harness）编写完成。**

## 许可

MIT
