# 发布记录

插件已推到 <https://github.com/ZZJQ678/dsh-global-context>（公开，MIT，带 `dsh-plugin` topic）。

## 收录状态

已向精选列表提交 PR：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5385>，CI 通过，等维护者合并。合并后网站自动重建，市场里搜 `全局提示词` 或 `dsh-global-context` 即可看到。

市场目录不由市场自己维护，它每次打开时从 `https://awesome-dsh-plugin.com/plugins.json` 实时拉取，那份文件由 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 仓库的 CI 构建。所以**收录只能靠给那个仓库提 PR**，加一个 `data/plugins/<owner>__<repo>.yml`，市场本身不接受投稿。

## 收录门槛

- `package.json` 里声明 `dsh.bundle.patch`（只声明 `dsh.client` 不可安装）
- 仓库根目录有 `cordis.patch.yml`，内容是 `- insert:` 列表
- 仓库创建满 1 天
- 带 `dsh-plugin` topic
- 有真实可用的代码
- 描述必须属实，评审会拿它对着源码核

## 本地安装与公开列表的区别

以 `link:` 或 `file:` 装的插件，市场会在「已安装」里显示并标一个 `本地开发`，但**公开搜索列表里没有它**——那部分只来自精选目录。
