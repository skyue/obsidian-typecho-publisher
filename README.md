# Typecho Publisher

> 中文用户请阅读 [简体中文版说明](https://github.com/skyue/obsidian-typecho-publisher/blob/main/README_zh-CN.md)。

Publish Obsidian notes to [Typecho](https://typecho.org) blog via XML-RPC, with configurable image hosting.

## Features

- One-click publish new posts or update existing ones
- Image upload to Cloudflare R2 or Typecho's built-in media library
- Image upload cache to avoid re-uploading
- Custom frontmatter field mapping to Typecho XML-RPC fields
- Strict frontmatter property type validation
- Wiki-link to blog URL conversion
- Content cutoff by section headings (e.g., hide draft sections)
- Progress modal with success/error feedback and article URL link
- Auto-detect Obsidian language, supports English and Simplified Chinese

## Configuration

### Typecho Connection

Fill in your Typecho site XML-RPC URL, username, and password.

### Frontmatter Field Mapping

Map your custom frontmatter keys to Typecho fields. The `dateCreated` field is mandatory and must use Obsidian's "Date & Time" property type. Each field has a type requirement — publishing will fail if the type doesn't match.

Example:

```yaml
---
published: 2026-06-14 22:00
aliases: My First Post
categories: [tech, obsidian]
tags: [obsidian, typecho]
slug: my-first-post
---
```

### Slug Fallback

When no slug is set in frontmatter, it's auto-generated from the publish date using a configurable format string (tokens: `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm`, `ss`).

### Wiki-Link Conversion

Enable to convert `[[wikilinks]]` to blog post URLs when the target note is also a published blog post (has the `dateCreated` frontmatter field). Non-blog notes are converted to plain text. Configure a URL template with variables: `{slug}`, `{postid}`, `{year}`, `{month}`, `{day}`.

### Content Cutoff

Specify section headings (comma-separated) that mark content to be excluded from publishing. Sections after (and including) these headings are stripped. Useful for hiding drafts, changelogs, or private notes.

### Validation

Optionally require the `<!--more-->` tag in post body. Publish will fail if missing.

### Image Hosting

Toggle between two modes:

- **Disabled** — Images are uploaded to Typecho's built-in media library via `metaWeblog.newMediaObject`.
- **Enabled** — Select an external hosting provider. Currently supports **Cloudflare R2**.

To set up Cloudflare R2:

1. Create an R2 bucket in Cloudflare Dashboard
2. Generate R2 API tokens (R2 → Manage R2 API Tokens)
3. Enable public access for your bucket
4. Fill in Account ID, Access Key, Secret Key, Bucket name, and Public URL

The upload path prefix supports date variables: `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{HH}`, `{mm}`, `{ss}` (based on publish date).

## Usage

- Open a Markdown note and run the `Publish to Typecho` command
- Right-click a `.md` file in the file explorer and select `Publish to Typecho`
- Use the editor context menu

On first publish, the plugin checks if the note lacks `typecho_postid` and asks for confirmation to create a new post. The `typecho_postid` field is automatically added to the frontmatter after publishing. Subsequent publishes update the existing post.

A progress modal shows upload status and the final result, including a clickable link to the published article (if a wiki-link URL template is configured).

## License

MIT
