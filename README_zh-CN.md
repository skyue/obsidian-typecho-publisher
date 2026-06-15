# Typecho Publisher

通过 XML-RPC 将 Obsidian 笔记发布到 [Typecho](https://typecho.org) 博客，支持多种图床方案。

## 功能

- 一键发布新文章或更新已有文章
- 图片上传到 Cloudflare R2 或 Typecho 自带附件管理
- 图片上传缓存，避免重复上传
- 自定义 frontmatter 字段映射到 Typecho XML-RPC 字段
- 严格的 frontmatter 属性类型校验
- Wiki-Link 双链自动转换为博客链接
- 按标题截断正文（隐藏草稿、变更日志等段落）
- 发布进度弹窗，含成功/失败反馈及文章链接
- 自动检测 Obsidian 语言，支持简体中文和英文

## 配置

### Typecho 连接

填写 Typecho 站点的 XML-RPC 地址、用户名和密码。

### Frontmatter 字段映射

将自定义 frontmatter 键映射到 Typecho 字段。`dateCreated` 为必填字段，且必须使用 Obsidian 的「日期&时间」属性类型。每个字段都有类型要求，类型不匹配将拒绝发布。

示例：

```yaml
---
published: 2026-06-14 22:00
aliases: 我的第一篇文章
categories: [tech, obsidian]
tags: [obsidian, typecho]
slug: my-first-post
---
```

### Slug 回退策略

未设置 slug 时，使用发布日期按自定义格式自动生成。支持变量：`YYYY`、`YY`、`MM`、`DD`、`HH`、`mm`、`ss`。

### Wiki-Link 转换

启用后，当 `[[双链]]` 指向的笔记也包含 `dateCreated` 字段（即为已发布博客文章）时，自动转换为博客 URL 链接。非博客笔记退化为去括号的纯文本。需配置 URL 模板，变量：`{slug}`、`{postid}`、`{year}`、`{month}`、`{day}`。

### 内容截断

设置需要截断的标题（逗号分隔），发布时这些标题及之后的内容将被移除。适用于隐藏草稿、变更日志或私密笔记。

### 校验

可选择要求正文必须包含 `<!--more-->` 标签，否则发布失败。

### 图床

提供两种模式，通过开关切换：

- **关闭** — 图片上传到 Typecho 自带附件管理（通过 `metaWeblog.newMediaObject` 接口）。
- **开启** — 选择外部图床服务。当前支持 **Cloudflare R2**。

配置 Cloudflare R2：

1. 在 Cloudflare 控制台创建 R2 bucket
2. 生成 R2 API 令牌（R2 → 管理 R2 API 令牌）
3. 为 bucket 开启公开访问
4. 填写 Account ID、Access Key、Secret Key、Bucket 名称和公开访问 URL

上传路径前缀支持日期变量：`{YYYY}`、`{YY}`、`{MM}`、`{DD}`、`{HH}`、`{mm}`、`{ss}`（基于文章发布日期）。

## 使用

- 打开 Markdown 笔记，执行 `发布到 Typecho` 命令
- 在文件管理器中右键 `.md` 文件，选择 `发布到 Typecho`
- 使用编辑器右键菜单

首次发布时，如果笔记缺少 `typecho_postid`，插件会弹窗确认是否创建新文章。发布成功后自动将 `typecho_postid` 回写到 frontmatter。后续发布即自动更新该文章。

发布过程中会显示进度弹窗，展示图片上传状态和最终结果。若配置了双链 URL 模板，弹窗中还会显示文章的可点击链接。

## 开源协议

MIT
