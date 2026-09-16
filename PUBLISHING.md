# 发布到 dsh-market 的步骤

## 现状

这个包已经按市场的收录要求打包好了：
- `dsh.bundle.patch` —— 声明加载器补丁层，`dsh plugin add` 能直接装（这是精选列表的硬性门槛）
- `dsh.client` —— 声明浏览器半边与加载顺序
- `dsh.compatibility.dshReleases` —— 声明兼容的 DSH 版本
- 零运行时依赖（宿主半边只用 Node 内置模块，浏览器半边只 require react）

**但市场里现在看不到它，原因是市场不扫描本地包。**

市场目录是每次打开时实时从 `https://awesome-dsh-plugin.com/plugins.json` 拉取的，
那份文件由仓库 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 CI 每日构建。也就是说：**收录 = 在那个仓库提一个 PR 加一行**（市场本身不接受插件条目）。

所以前置条件只有一条：这个包得先有一个**公网地址**（GitHub 仓库最合适，npm 包也行）。

## 第 1 步：推到 GitHub

```bash
# 在 GitHub 上新建一个公开仓库（建议名 dsh-global-context），然后：
cd <本目录>
git remote add origin https://github.com/<你的用户名>/dsh-global-context.git
git branch -M main
git push -u origin main
```

## 第 2 步：验证「能被装上」

这一步是精选列表的评审依据 —— 他们会照着自己的源检查描述是否属实。

```bash
dsh plugin --profile web add -w github:<你的用户名>/dsh-global-context
```

## 第 3 步：给精选列表提 PR

在 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 `README.md` 里找到合适分类（建议 **Sessions & Messages**，其次是 **UI Enhancements**），
在分类列表里按字母序插入一行：

```markdown
- [<你的用户名>/dsh-global-context](https://github.com/<你的用户名>/dsh-global-context) - Global context for DeepSeek Harness: injects a custom prompt at the very top of every session's system prompt and adds a dedicated "Global Context" conversation-view tab to edit it live, applied on the next request without a restart.
```

同时在 `README.zh.md` 的对应分类加中文一行：

```markdown
- [<你的用户名>/dsh-global-context](https://github.com/<你的用户名>/dsh-global-context) - 全局上下文：把一段自定义提示词注入到每个会话系统提示词的最顶部，并在对话视图新增「全局上下文配置」标签页随时编辑，保存后下一条消息即生效、无需重启。
```

评审要点（来自官方 `contributing.md`）：能用 `dsh plugin add` 安装、行为与那一行描述一致、分类正确、有人在维护。
收录通常一天内生效，站点与市场会自动跟进。

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
