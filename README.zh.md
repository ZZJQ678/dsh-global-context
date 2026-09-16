# dsh-global-context

给 DeepSeek Harness 用的**全局上下文**插件：把一段自定义提示词注入到**每个会话系统提示词的最顶部**，并在对话视图里加一个「全局上下文配置」标签页，随时可视化编辑。

## 它做什么

1. **注入全局上下文**
   你写的内容会排在整段系统提示词的第一节 —— 在内置身份（`You are an AI agent powered by DeepSeek Harness.`）之前，对所有会话、所有模型、包括子智能体生效。

2. **在对话视图里加一个标签页**
   在 `对话 / 轨迹 / 上下文` 之后多出第四个标签 `全局上下文配置`，里面是一个文本框，可以直接编辑、保存、清空。

3. **改完立刻生效，不用重启**
   文本存在一个普通文本文件里，每次组装提示词时按 mtime 重新读取。保存后**下一条消息**就带上新内容；你也可以直接用记事本改这个文件，效果一样。

## 安装

```bash
dsh plugin --profile web add -w <本包路径或 npm 包名>
```

包名声明了 `dsh.bundle.patch`，所以 `reconcilePlugins()` 会自动把它追加进 profile 的
`dsh.profile.bundles`，无需手工改配置。

装完**重启一次 DSH Desktop**：客户端半边（标签页）需要在启动时加载。

## 在插件市场里怎么看到它

两件事要分清：

- **本机已安装**：以 `link:` / `file:` 方式安装的插件，市场会认出来并在「已安装」列表里打上
  **`本地开发`** 标签（判定规则是市场客户端的 `/^(?:link|file):/i.test(spec)`）。
  用 `dsh plugin add <本地路径>` 装完重启后，这个插件就会出现在那里。
- **公开精选目录**：市场搜索列表来自公开精选列表
  [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（每日构建成
  `plugins.json`）。想出现在所有人能搜到的地方，需要把包放到公网仓库并给那个列表提 PR ——
  步骤与现成的收录描述见 [PUBLISHING.md](PUBLISHING.md)。

## 配置

在 profile 的 `cordis.patch.yml` 里可以覆盖：

```yaml
- id: dsh-global-context
  config:
    enabled: true      # 总开关；false 时完全不注入（标签页仍可读写）
    order: -1100       # 段顺序；默认取「内置身份段 - 100」
    textPath: 'D:\somewhere\my-context.md'   # 正文文件；默认 $DSH_HOME/global-context.md
    statusPath: 'D:\somewhere\status.json'   # 加载状态文件；默认 $DSH_HOME/global-context.status.json
```

## 文本放在哪

默认 `$DSH_HOME/global-context.md`（Windows 上一般是
`C:\Users\<你>\AppData\Roaming\dsh-desktop\harness\global-context.md`）。
标签页底部会显示实际路径。

- 文件为空或不存在 → 不注入任何内容
- 想临时停用 → 清空文本框保存，或把配置里的 `enabled` 改成 `false`

## 技术说明

| 半边 | 文件 | 说明 |
| --- | --- | --- |
| 宿主 | `lib/index.js` | 注册 `systemPrompt` 段 + 一个精确路由 `/api/dsh-global-context`（GET 读 / POST 写） |
| 客户端 | `lib/client.js` | 手写的 `window.__ModuleLoader__` 产物，往 `conversation.view` 插槽注册标签页 |

两个必须说明的安全设计：

1. **`apply()` 绝不抛错。** DSH 的加载器对所有条目做 `Promise.allSettled`，任何一个失败会让整个 profile 回滚 —— 等于 DSH 起不来。所以注册失败只记日志、只降级。
2. **提示词里绝不出现 `{{...}}`。** DSH 的系统提示词渲染器对 `{{变量}}` 做严格插值：未知引用会**抛错**，而这只会在每次请求组装提示词时炸掉。所以注入前会把 `{{` 拆成 `{` + 零宽空格 + `{`：渲染器再也看不到引用组，视觉上仍是 `{{`。

路由的写入端点做了同源校验（浏览器请求必须同源），并有体积上限（256 KB），避免误粘贴把每个请求撑爆。

## 装完怎么确认真的生效了

有一条命令把整条链路验一遍：

```bash
node scripts/verify-live.mjs
```

它会自己从 harness 日志里读地址与令牌，然后检查四件事：

1. **宿主半边加载了没有** —— 看 `$DSH_HOME/global-context.status.json`
2. **GUI 读写接口在不在** —— `GET /api/dsh-global-context` 应返回 200
3. **保存能不能真的落盘** —— POST 后再 GET 往返比对（会先备份、结束前还原原内容；加 `--no-write` 可跳过）
4. **浏览器半边会不会被送进浏览器** —— 首页 `window.__DSH_BOOT__` 里有没有本包名，以及
   `/plugins/dsh-global-context/client.js` 能不能取到

第 4 项是关键：本包名出现在首页的客户端模块图里，就等于「标签页一定会被注册」。

## 测试

```bash
DSH_HOME=<你的 harness 目录> node --test test/host.test.mjs test/client.test.mjs test/manifest.test.mjs
```

- `test/host.test.mjs`：装载**真实的** SystemPrompt 服务与一个假 webServer，验证注入位置、文件热更新、`{{}}` 安全、路由读写与拒绝逻辑。
- `test/client.test.mjs`：在 Node 里用**真实的 React** 加载手写产物，验证模块表形状、标签页注册、组件渲染、接口调用。
- `test/manifest.test.mjs`：把宿主的收录/加载规则固化成断言 —— `exports["./client"]` 的合法形式、`dsh.client` 各字段类型、产物模块 id 必须等于包名、零运行时依赖、补丁层里 `name` 必须等于包名。这几条任意一条不满足，轻则标签页不出现，重则 Web 层启动报错。

## 许可

MIT
