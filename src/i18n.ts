function getLang(): "zh-cn" | "en" {
  const lang = (window.localStorage.getItem("language") || "en").toLowerCase();
  return lang.startsWith("zh") ? "zh-cn" : "en";
}

const lang = getLang();

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let text = entry ? (entry[lang] || entry.en || key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

const STRINGS: Record<string, Record<string, string>> = {
  // === Typecho Connection ===
  "connection": {
    "zh-cn": "Typecho 连接",
    en: "Typecho Connection",
  },
  "xmlrpc_url": {
    "zh-cn": "XML-RPC 地址",
    en: "XML-RPC URL",
  },
  "xmlrpc_url_desc": {
    "zh-cn": "Typecho XML-RPC 接口地址，例如 https://example.com/index.php/action/xmlrpc",
    en: "Your Typecho XML-RPC endpoint, e.g. https://example.com/index.php/action/xmlrpc",
  },
  "xmlrpc_url_placeholder": {
    "zh-cn": "https://example.com/index.php/action/xmlrpc",
    en: "https://example.com/index.php/action/xmlrpc",
  },
  "username": {
    "zh-cn": "用户名",
    en: "Username",
  },
  "username_desc": {
    "zh-cn": "Typecho 登录用户名",
    en: "Your Typecho login username",
  },
  "username_placeholder": {
    "zh-cn": "用户名",
    en: "username",
  },
  "password": {
    "zh-cn": "密码",
    en: "Password",
  },
  "password_desc": {
    "zh-cn": "Typecho 登录密码",
    en: "Your Typecho login password",
  },
  "password_placeholder": {
    "zh-cn": "密码",
    en: "password",
  },

  // === Field Mapping ===
  "field_mapping": {
    "zh-cn": "Frontmatter 字段映射",
    en: "Frontmatter Field Mapping",
  },
  "field_mapping_desc": {
    "zh-cn": "将你的 frontmatter 键名映射到 Typecho XML-RPC 字段。留空则使用默认值或不发送该字段。右侧开关控制该字段是否必填——如果必填字段缺失则发布失败。dateCreated 为必须字段，不允许关闭。",
    en: "Map your frontmatter keys to Typecho XML-RPC fields. Leave blank to use the default or skip the field. The toggle controls whether the key is required — publishing will fail if a required key is missing. dateCreated is mandatory and cannot be disabled.",
  },
  "always_required": {
    "zh-cn": "始终必填",
    en: "Always required",
  },
  "require_field": {
    "zh-cn": "是否必填",
    en: "Require this field",
  },

  // Field labels & descriptions
  "f_dateCreated_label": {
    "zh-cn": "dateCreated",
    en: "dateCreated",
  },
  "f_dateCreated_desc": {
    "zh-cn": '文章发布日期。REQUIRED（映射和值都必须配置）。\n类型：日期&时间。\n接受 JavaScript Date 可解析的任意格式。',
    en: "Post creation date. REQUIRED (both mapping and value are mandatory).\nType: Date & Time.\nAccepts any format JavaScript Date can parse.",
  },
  "f_title_label": {
    "zh-cn": "title",
    en: "title",
  },
  "f_title_desc": {
    "zh-cn": "文章标题。\n类型：文本 / 列表（列表时取第一个值）。\n为空时 → 正文第一个 # 标题 → 文件名。",
    en: "Post title.\nType: Text / List (first item used if list).\nEmpty → first # heading in body → filename.",
  },
  "f_categories_label": {
    "zh-cn": "categories",
    en: "categories",
  },
  "f_categories_desc": {
    "zh-cn": "文章分类。\n类型：列表。\n为空时 → 无分类。",
    en: "Post categories.\nType: List.\nEmpty → no categories.",
  },
  "f_mt_keywords_label": {
    "zh-cn": "mt_keywords",
    en: "mt_keywords",
  },
  "f_mt_keywords_desc": {
    "zh-cn": "文章标签。\n类型：列表。\n为空时 → 无标签。",
    en: "Post tags.\nType: List.\nEmpty → no tags.",
  },
  "f_slug_label": {
    "zh-cn": "slug",
    en: "slug",
  },
  "f_slug_desc": {
    "zh-cn": "文章 URL 别名。\n类型：文本。\n为空时 → 使用发布日期按自定义格式生成。",
    en: "URL slug for the post.\nType: Text.\nEmpty → generated from publish date using custom format.",
  },
  "f_post_type_label": {
    "zh-cn": "post_type",
    en: "post_type",
  },
  "f_post_type_desc": {
    "zh-cn": "内容类型。\n类型：文本。\npost = 文章\npage = 页面\n为空时 → post。",
    en: "Content type.\nType: Text.\npost = blog article\npage = standalone page\nEmpty → post.",
  },
  "f_mt_allow_comments_label": {
    "zh-cn": "mt_allow_comments",
    en: "mt_allow_comments",
  },
  "f_mt_allow_comments_desc": {
    "zh-cn": "评论状态。\n类型：数字。\n0 = 关闭\n1 = 允许\n为空时 → 1（允许）。",
    en: "Comment status.\nType: Number.\n0 = closed\n1 = open\nEmpty → 1 (open).",
  },
  "f_mt_excerpt_label": {
    "zh-cn": "mt_excerpt",
    en: "mt_excerpt",
  },
  "f_mt_excerpt_desc": {
    "zh-cn": "文章摘要。显示在文章列表和 SEO 描述中。\n类型：文本。\n为空时 → 无摘要。",
    en: "Post excerpt / summary. Shown in post lists and SEO descriptions.\nType: Text.\nEmpty → no excerpt.",
  },
  "f_post_status_label": {
    "zh-cn": "post_status",
    en: "post_status",
  },
  "f_post_status_desc": {
    "zh-cn": "发布状态。\n类型：文本。\npublish = 已发布\ndraft = 草稿\npending = 待审核\nprivate = 私有\nfuture = 定时发布\n为空时 → publish。",
    en: "Publication status.\nType: Text.\npublish = published\ndraft = draft\npending = pending review\nprivate = private\nfuture = scheduled\nEmpty → publish.",
  },
  "f_description_label": {
    "zh-cn": "description",
    en: "description",
  },
  "f_description_desc": {
    "zh-cn": "文章正文。自动从 Markdown 内容填充（经图片上传和双链转换后）。不可映射。",
    en: "Post body content. Auto-filled from markdown body (after image upload and wiki-link conversion). Cannot be mapped.",
  },

  // === Slug Fallback ===
  "slug_fallback": {
    "zh-cn": "Slug 回退策略",
    en: "Slug Fallback",
  },
  "slug_fallback_desc": {
    "zh-cn": "当 frontmatter 中未设置 slug 时，使用发布日期（dateCreated）按以下格式自动生成。",
    en: "When slug is not set in frontmatter, it is generated from the publish date (dateCreated) using the format below.",
  },
  "date_format": {
    "zh-cn": "日期格式",
    en: "Date format",
  },
  "date_format_desc": {
    "zh-cn": "自定义格式。变量：YYYY（年）、YY（两位年）、MM（月）、DD（日）、HH（时）、mm（分）、ss（秒）",
    en: "Custom format. Tokens: YYYY (year), YY (2-digit year), MM (month), DD (day), HH (hour), mm (minute), ss (second)",
  },

  // === Wiki-Link Conversion ===
  "wiki_link": {
    "zh-cn": "Wiki-Link 转换",
    en: "Wiki-Link Conversion",
  },
  "wiki_link_desc": {
    "zh-cn": "当 [[双链]] 指向的笔记也包含 dateCreated 字段（即为已发布博客文章）时，自动转换为博客链接。",
    en: "Convert [[wikilinks]] to blog post links when the target note has the dateCreated frontmatter field (indicating it's also a published blog post).",
  },
  "enable_wiki_link": {
    "zh-cn": "启用 Wiki-Link 转换",
    en: "Enable wiki-link conversion",
  },
  "enable_wiki_link_desc": {
    "zh-cn": "开启后，指向已发布博客文章的 [[双链]] 会被转换为完整 URL 链接。",
    en: "When enabled, [[links]] to published blog posts will be converted to full URLs.",
  },
  "link_url_template": {
    "zh-cn": "博客链接 URL 模板",
    en: "Blog link URL template",
  },
  "link_url_template_desc": {
    "zh-cn": "生成的链接格式。变量：{slug}、{postid}、{year}、{month}、{day}。示例：https://www.example.com/{slug}.html",
    en: "Template for generated blog links. Variables: {slug}, {postid}, {year}, {month}, {day}. Example: https://www.example.com/{slug}.html",
  },
  "link_url_template_placeholder": {
    "zh-cn": "https://www.example.com/{slug}.html",
    en: "https://www.example.com/{slug}.html",
  },

  // === Content Cutoff ===
  "cutoff": {
    "zh-cn": "内容截断",
    en: "Content Cutoff",
  },
  "cutoff_desc": {
    "zh-cn": "正文中遇到以下标题（含该标题）之后的内容将在发布时截断。适用于隐藏草稿、变更日志或私密笔记。",
    en: "Sections after (and including) these headings will be stripped before publishing. Useful for hiding drafts, changelogs, or private notes.",
  },
  "cutoff_sections": {
    "zh-cn": "截断标题",
    en: "Cutoff sections",
  },
  "cutoff_sections_desc": {
    "zh-cn": "逗号分隔的标题名称（不含 # 前缀）。示例：Draft,ChangeLog,PrivateNote",
    en: "Comma-separated section names (without # prefix). Example: Draft,ChangeLog,PrivateNote",
  },
  "cutoff_placeholder": {
    "zh-cn": "Draft,ChangeLog,PrivateNote",
    en: "Draft,ChangeLog,PrivateNote",
  },

  // === Validation ===
  "validation": {
    "zh-cn": "校验",
    en: "Validation",
  },
  "require_more": {
    "zh-cn": "要求 <!--more--> 标签",
    en: "Require <!--more--> tag",
  },
  "require_more_desc": {
    "zh-cn": "开启后，正文中必须包含 <!--more--> 标签，否则发布失败。",
    en: "When enabled, the <!--more--> tag must be present in the body. Publish will fail if missing.",
  },

  // === Image Hosting ===
  "image_host": {
    "zh-cn": "图床",
    en: "Image Hosting",
  },
  "use_image_host": {
    "zh-cn": "使用外部图床",
    en: "Use external image hosting",
  },
  "use_image_host_desc": {
    "zh-cn": "开启后将图片上传到 Cloudflare R2。关闭时图片上传到 Typecho 自带的附件管理。",
    en: "Upload images to Cloudflare R2. When disabled, images are uploaded to Typecho's built-in media library.",
  },
  "image_host_type": {
    "zh-cn": "图床服务",
    en: "Provider",
  },
  "image_host_type_desc": {
    "zh-cn": "选择要使用的图床服务。",
    en: "Choose an image hosting provider.",
  },
  "image_host_type_r2": {
    "zh-cn": "Cloudflare R2",
    en: "Cloudflare R2",
  },
  "r2_account_id": {
    "zh-cn": "Account ID",
    en: "Account ID",
  },
  "r2_account_id_desc": {
    "zh-cn": "Cloudflare 账户 ID（在 R2 概览页面可找到）",
    en: "Your Cloudflare Account ID (found in R2 overview)",
  },
  "r2_access_key": {
    "zh-cn": "Access Key ID",
    en: "Access Key ID",
  },
  "r2_access_key_desc": {
    "zh-cn": "R2 API Access Key ID（在 R2 → 管理 R2 API 令牌 中创建）",
    en: "R2 API Access Key ID (create in R2 → Manage R2 API Tokens)",
  },
  "r2_secret_key": {
    "zh-cn": "Secret Access Key",
    en: "Secret Access Key",
  },
  "r2_secret_key_desc": {
    "zh-cn": "R2 API Secret Access Key",
    en: "R2 API Secret Access Key",
  },
  "r2_bucket": {
    "zh-cn": "Bucket 名称",
    en: "Bucket name",
  },
  "r2_bucket_desc": {
    "zh-cn": "用于存储图片的 R2 bucket 名称",
    en: "R2 bucket name for image storage",
  },
  "r2_public_url": {
    "zh-cn": "公开访问 URL 前缀",
    en: "Public URL prefix",
  },
  "r2_public_url_desc": {
    "zh-cn": "Bucket 的公开访问地址，例如 https://pub-xxx.r2.dev 或你的自定义域名",
    en: "Public access URL for your bucket, e.g. https://pub-xxx.r2.dev or your custom domain",
  },
  "r2_path_prefix": {
    "zh-cn": "上传路径前缀",
    en: "Upload path prefix",
  },
  "r2_path_prefix_desc": {
    "zh-cn": "Bucket 中存储图片的文件夹路径。支持变量：{YYYY}、{YY}、{MM}、{DD}、{HH}、{mm}、{ss}（基于文章发布日期）。最终路径为：前缀/原始文件名。",
    en: "Folder path within bucket. Variables: {YYYY}, {YY}, {MM}, {DD}, {HH}, {mm}, {ss} (based on publish date). Final path: prefix/filename.",
  },

  // === Notices ===
  "no_md_file": {
    "zh-cn": "当前没有打开 Markdown 文件。",
    en: "No markdown file is open.",
  },
  "config_first": {
    "zh-cn": "请先配置 Typecho 连接信息。",
    en: "Please configure Typecho connection settings first.",
  },
  "date_mapping_required": {
    "zh-cn": "发布失败：dateCreated 字段需要配置映射。请在插件设置中设置。",
    en: "Publish failed: dateCreated field requires a frontmatter mapping. Set it in plugin settings.",
  },
  "date_required": {
    "zh-cn": "发布失败：dateCreated 未填写。请在 frontmatter 中添加有效的发布日期。",
    en: "Publish failed: dateCreated is empty. Add a valid publish date to the frontmatter.",
  },
  "type_error": {
    "zh-cn": '发布失败："{field}" 类型不正确，要求使用 {expected} 类型，当前为 {actual} 类型。请在 Obsidian 属性中修改该字段的类型。',
    en: 'Publish failed: "{field}" has wrong type. Expected {expected}, got {actual}. Please change the property type in Obsidian.',
  },

  "date_invalid": {
    "zh-cn": "发布失败：无法解析 dateCreated \"{value}\"，请使用有效的日期格式。",
    en: "Publish failed: Unable to parse dateCreated \"{value}\". Use a valid date format.",
  },
  "missing_required": {
    "zh-cn": "发布失败：缺少必填 frontmatter 字段：",
    en: "Publish failed: missing required frontmatter key(s): ",
  },
  "more_required": {
    "zh-cn": "发布失败：正文中未找到 <!--more--> 标签。",
    en: "Publish failed: <!--more--> tag is required but not found in content.",
  },

  // Image upload stats
  "img_stats": {
    "zh-cn": "图片：共 {total} 张，复用缓存 {cached} 张，新上传 {new} 张",
    en: "Images: {total} total, {cached} cached, {new} newly uploaded",
  },
  "img_stats_no_r2": {
    "zh-cn": "笔记包含 {total} 张图片但 R2 未配置，图片使用本地路径。",
    en: "Note contains {total} images but R2 is not configured. Images will use local paths.",
  },
  "img_upload_failed": {
    "zh-cn": "图片上传失败：",
    en: "Failed to upload image: ",
  },

  // Article publish/update feedback
  "article_new": {
    "zh-cn": '新建文章 # {postid}',
    en: 'New post # {postid}',
  },
  "article_updated": {
    "zh-cn": '更新文章 # {postid}',
    en: 'Updated post # {postid}',
  },
  "article_detail_title": {
    "zh-cn": "标题：{title}",
    en: "Title: {title}",
  },
  "article_detail_slug": {
    "zh-cn": "Slug：{slug}",
    en: "Slug: {slug}",
  },
  "article_detail_more": {
    "zh-cn": "点击查看详情",
    en: "Click for details",
  },

  // Confirm dialog for missing postid
  "confirm_new_title": {
    "zh-cn": "创建新文章？",
    en: "Create new post?",
  },
  "confirm_new_message": {
    "zh-cn":
      "当前笔记没有 typecho_postid，点击「确认」将创建新文章。若你希望更新已有文章，请点击「取消」，为笔记补全 typecho_postid 后再发布。",
    en: 'No typecho_postid found. Click "Confirm" to create a new post. If you want to update an existing post, click "Cancel" and add the typecho_postid to the frontmatter.',
  },
  "confirm_new_confirm": {
    "zh-cn": "确认",
    en: "Confirm",
  },
  "confirm_new_cancel": {
    "zh-cn": "取消",
    en: "Cancel",
  },

  // Progress modal
  "progress_title": {
    "zh-cn": "发布进度",
    en: "Publishing",
  },
  "modal_close": {
    "zh-cn": "关闭",
    en: "Close",
  },
  "publish_success": {
    "zh-cn": "发布成功",
    en: "Publish successful",
  },
  "publish_error": {
    "zh-cn": "发布失败",
    en: "Publish failed",
  },

  "uploading_images": {
    "zh-cn": "正在上传图片 ({current}/{total})...",
    en: "Uploading images ({current}/{total})...",
  },
  "publishing_to": {
    "zh-cn": "正在发布到 Typecho...",
    en: "Publishing to Typecho...",
  },

  "publish_failed": {
    "zh-cn": "发布失败：",
    en: "Publish failed: ",
  },
};
