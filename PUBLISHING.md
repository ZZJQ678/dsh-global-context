# 发布到 dsh-market 的步骤

## 现状

**已发布：<https://github.com/ZZJQ678/dsh-global-context>**（公开，MIT，已带 `dsh-plugin` topic）

这个包已经按市场的收录要求打包好了：
- `dsh.bundle.patch` —— 声明加载器补丁层，`dsh plugin add` 能直接装（这是精选列表的硬性门槛）
- `dsh.client` —— 声明浏览器半边与加载顺序
- `dsh.compatibility.dshReleases` —— 声明兼容的 DSH 版本
- 零运行时依赖（宿主半边只用 Node 内置模块，浏览器半边只 require react）

**但公开搜索列表里还没有它，原因是那份列表不由市场自己维护。**

市场目录是每次打开时实时从 `https://awesome-dsh-plugin.com/plugins.json` 拉取的，
那份文件由仓库 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 CI 每日构建。也就是说：**收录 = 去那个仓库提一个 PR 加一个 YAML 文件**（市场本身不接受插件条目）。

前置条件「有个公网地址」已经满足，剩下的是第 3 步。

## 在市场里怎么看到它（读市场源码实测）

**打开插件市场，搜索 `全局上下文` 或 `dsh-global-context` 就能看到。**

从已安装的 `dshmarket` 源码里核到的三条行为：

1. **搜索匹配四个字段**：包名、安装来源（spec）、描述（按界面语言取 `description[lang] || description.en`）、
   作者名（`client/client.js` 第 9890–9895 行）。所以中文描述写进精选目录后，搜中文词也能命中。
2. **详情页只抓 `README.md`**，没有语言分支
   （`client/client.js` 第 1999 行：`…/HEAD/README.md`）。**因此 `README.md` 必须是中文**，
   进去后默认页面才是中文。本仓库已按此调整：`README.md` = 中文，`README.en.md` = 英文。
3. 本机用 `link:` / `file:` 装过的插件，会在「已安装」列表里带一个 **`本地开发`** 标签。

## 第 1 步：推到 GitHub ✅ 已完成

```bash
git remote add origin https://github.com/ZZJQ678/dsh-global-context.git
git branch -M main
git push -u origin main
```

## 第 2 步：验证「能被装上」

这一步是精选列表的评审依据 —— 他们会照着自己的源检查描述是否属实。

```bash
dsh plugin --profile web add -w github:ZZJQ678/dsh-global-context
```

本包只通过 GitHub 分发（没有发布到 npm），评审照这条命令就能装上。

## 第 3 步：给精选列表提 PR（**新增一个 YAML 文件，不要改 README**）

精选列表的两个 README 都是**脚本生成**的，手工编辑会被打回。列表数据在
[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 `data/plugins/` 目录里，**一个插件一个文件**（这样不同人的 PR 永不冲突）。

新增一个文件 `data/plugins/<owner>__<repo>.yml`：

```yaml
url: https://github.com/<owner>/dsh-global-context
name: <owner>/dsh-global-context
category: session
description:
  en: 'Global context for DeepSeek Harness: injects a custom prompt at the very top of every session system prompt, and adds a Global Context tab in the conversation view to edit it live.'
  zh: '全局上下文：把自定义提示词注入到每个会话系统提示词的最顶部，并在对话视图新增「全局上下文配置」标签页随时编辑，保存后下一条消息即生效。'
```

⚠️ 描述里出现半角冒号加空格（`: `）时**必须加引号**，否则 YAML 会当成嵌套键解析失败。

可用分类：`agi` `ui` `usage` `theme` `model` `identity` `session` `memory` `tools`
`wsl` `browser` `vision` `voice` `docs` `skill` `workflow` `git` `notify` `dev`
`security` `remote` `market` `fun`。本插件选 **`session`** 最贴切（它改的是会话系统提示词）。

### 收录的硬性门槛（CI 自动检查）

- 仓库的 `package.json` 声明 **`dsh.bundle`** —— 只声明 `dsh.client` **不可安装**，会在这一步失败
- 仓库根目录有 `cordis.patch.yml`，内容形如 `- insert: [{id, name}]`
- 仓库**创建满 1 天**（这一条是自动检查的，专门过滤「提 PR 前几分钟才建好」的仓库）
- 仓库带上 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic
- 有真实可用的代码，不是占位/纯 README 仓库
- 描述必须**属实**，且不带营销词——评审会拿它对着源码核

不满足仓库年龄时**先别提交**：等满 1 天再提，重新提交不会有任何负面影响（这是官方
`contributing.md` 的明确说法）。

还有一项可选：在仓库里放一个 `screenshots.json` 列出 1–8 张截图，让市场详情页像 App Store 那样展示。
（本包不发布到 npm，所以不需要 npm 相关准备。）

## 关于「本地已装」与「公开目录」的区别

这两件事不是一回事，别混起来：

- **本机已安装的会被市场识别出来。** 市场客户端对安装来源做了判定
  （`lib` 侧 `localDev`：`/^(?:link|file):/i.test(spec) || status?.kind === "linked"`），
  以 `link:` / `file:` 装的插件会在「已安装」列表里带一个 **`本地开发`** 标签。
  也就是说：`dsh plugin add <本地路径>` 装完重启后，市场里**看得到**这个插件，
  并且会尝试按包名去精选目录匹配、提供「改用线上版本」的入口。
- **但公开搜索列表里没有它。** 那部分只来自精选目录，必须走上面的第 1~3 步。

装完后 `dsh --profile web --dump-config` 里会出现带归属信息的条目，可用来确认 dsh 真的认了这个包：

```yaml
- id: dsh-global-context
  name: dsh-global-context
  __dshPluginOwner:
    packageName: dsh-global-context
    version: 1.0.0
```
