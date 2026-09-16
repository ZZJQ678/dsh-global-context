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

## 配置

在 profile 的 `cordis.patch.yml` 里可以覆盖：

```yaml
- id: dsh-global-context
  config:
    enabled: true      # 总开关；false 时完全不注入（标签页仍可读写）
    order: -1100       # 段顺序；默认取「内置身份段 - 100」
    textPath: 'D:\somewhere\my-context.md'   # 正文文件；默认 $DSH_HOME/global-context.md
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

## 测试

```bash
DSH_HOME=<你的 harness 目录> node --test test/host.test.mjs test/client.test.mjs
```

- `test/host.test.mjs`：装载**真实的** SystemPrompt 服务与一个假 webServer，验证注入位置、文件热更新、`{{}}` 安全、路由读写与拒绝逻辑。
- `test/client.test.mjs`：在 Node 里用**真实的 React** 加载手写产物，验证模块表形状、标签页注册、组件渲染、接口调用。

## 许可

MIT
