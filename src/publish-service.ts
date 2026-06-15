import { App, Modal, Notice, Setting, TFile, Vault } from "obsidian";
import { XmlRpcClient, type PostContent } from "./xmlrpc-client";
import { createImageUploader } from "./image-uploader";
import { extractImages, resolveImageFile, replaceImageUrls, convertWikiLinks, stripCutoffSections } from "./markdown-utils";
import type { FieldMapping, TypechoSettings } from "./settings";
import { t } from "./i18n";

export const FRONTMATTER_POST_ID_KEY = "typecho_postid";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsTypeToObsidian(jsType: string): string {
  switch (jsType) {
    case "string": return "文本";
    case "number": return "数字";
    case "boolean": return "复选框";
    case "array": return "列表";
    default: return jsType;
  }
}

class PublishProgressModal extends Modal {
  private statusEl!: HTMLElement;
  private closeBtnEl!: HTMLElement;
  private spinnerEl!: HTMLElement;
  private resolved = false;

  constructor(app: App) {
    super(app);
    this.modalEl.addClass("typecho-progress-modal");
  }

  onOpen() {
    this.titleEl.setText(t("progress_title"));

    // Spinner / progress indicator
    this.spinnerEl = this.contentEl.createEl("div", {
      cls: "typecho-progress-spinner",
    });

    this.statusEl = this.contentEl.createEl("p", {
      cls: "typecho-progress-status",
      text: "",
    });

    // Close button — hidden until resolved
    this.closeBtnEl = this.contentEl.createEl("button", {
      cls: "typecho-progress-close",
      text: t("modal_close"),
    });
    this.closeBtnEl.style.display = "none";
    this.closeBtnEl.addEventListener("click", () => this.close());
  }

  setStatus(text: string) {
    if (!this.resolved && this.statusEl) {
      this.statusEl.setText(text);
    }
  }

  /**
   * Show final result (success or error) and add a close button.
   * Auto-closes after `autoCloseMs` (pass 0 to disable).
   */
  resolve(title: string, message: string, isError: boolean, autoCloseMs = 0) {
    if (this.resolved) return;
    this.resolved = true;

    this.titleEl.setText(title);
    this.statusEl.innerHTML = message.replace(/\n/g, "<br>");
    if (isError) {
      this.statusEl.addClass("typecho-progress-error");
    }

    // Handle clicks on article links — open in browser
    this.statusEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "A" && target.getAttribute("href")) {
        e.preventDefault();
        window.open(target.getAttribute("href")!, "_blank");
      }
    });

    // Hide spinner, show close button
    if (this.spinnerEl) this.spinnerEl.style.display = "none";
    if (this.closeBtnEl) this.closeBtnEl.style.display = "";

    // Auto-close after delay
    if (autoCloseMs > 0) {
      setTimeout(() => {
        if (!this.containerEl.parentNode) return; // already closed manually
        this.close();
      }, autoCloseMs);
    }
  }

  onClose() {}
}

export class PublishService {
  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: {
      getFileCache: (file: TFile) => { frontmatter?: Record<string, unknown> } | null;
      getFirstLinkpathDest: (linktext: string, sourcePath: string) => TFile | null;
    },
    private getSettings: () => TypechoSettings,
    private saveSettings: () => Promise<void>,
    private processFrontMatter: (file: TFile, fn: (fm: Record<string, unknown>) => void) => Promise<void>
  ) {}

  async publish(noteFile: TFile): Promise<void> {
    const settings = this.getSettings();

    // Validate settings
    if (!settings.xmlrpcUrl || !settings.username || !settings.password) {
      new Notice(t("config_first"));
      return;
    }

    // Read file content and parse frontmatter from disk (not from cache)
    const content = await this.vault.read(noteFile);
    const frontmatter = this.parseFrontmatter(content);

    // Validation: required frontmatter fields
    const fm = this.fieldMapping;
    const missingFields: string[] = [];
    for (const field of Object.keys(settings.fieldRequired) as (keyof FieldMapping)[]) {
      if (!settings.fieldRequired[field]) continue;
      const fmKey = fm[field];
      if (!fmKey) continue;
      // title and dateCreated have fallbacks, skip required check
      if (field === "title" || field === "dateCreated") continue;
      if (!(fmKey in frontmatter)) {
        const label = t(`f_${field}_label`);
        missingFields.push(label);
      }
    }
    if (missingFields.length > 0) {
      new Notice(`${t("missing_required")}${missingFields.join(", ")}`);
      return;
    }

    // Validation: require <!--more--> tag
    if (settings.requireMoreTag && !content.includes("<!--more-->")) {
      new Notice(t("more_required"));
      return;
    }

    // dateCreated: REQUIRED. User must provide a valid date in frontmatter.
    if (!fm.dateCreated) {
      new Notice(t("date_mapping_required"));
      return;
    }
    const dateStr = this.getFmValue(frontmatter, fm.dateCreated);
    if (!dateStr) {
      new Notice(t("date_required"));
      return;
    }
    const pubDate = new Date(dateStr);
    if (isNaN(pubDate.getTime())) {
      new Notice(t("date_invalid", { value: dateStr }));
      return;
    }

    // Validate property types using metadata cache (has proper JS types)
    if (!this.validateFieldTypes(noteFile, fm)) {
      return;
    }

    // title: frontmatter > first # heading > filename
    const title =
      this.getFmValue(frontmatter, fm.title) ||
      this.extractFirstHeading(content) ||
      noteFile.basename;

    // categories: fallback empty
    const categories = this.getFmList(frontmatter, fm.categories);

    // mt_keywords: fallback empty
    const tags = this.getFmList(frontmatter, fm.mt_keywords);

    // wp_slug: frontmatter > fallback from dateCreated
    let slug = this.getFmValue(frontmatter, fm.slug);
    if (!slug) {
      slug = this.formatDate(settings.slugDateFormat, pubDate);
    }

    // wp_post_type: frontmatter > fallback "post"
    const postType = this.getFmValue(frontmatter, fm.post_type) || "post";

    // mt_allow_comments: frontmatter > fallback 1 (allow)
    const allowComments = this.getFmValue(frontmatter, fm.mt_allow_comments) || "1";

    // mt_excerpt: fallback empty
    const excerpt = this.getFmValue(frontmatter, fm.mt_excerpt) || undefined;

    // post_status: frontmatter > default "publish"
    const status = this.getFmValue(frontmatter, fm.post_status) || "publish";

    // Step 0: Check typecho_postid early — before any network I/O
    const existingPostId = frontmatter[FRONTMATTER_POST_ID_KEY] as string | undefined;

    if (!existingPostId) {
      const confirmed = await this.confirmNewPost();
      if (!confirmed) {
        return;
      }
    }

    // Open progress modal before any network I/O
    const progressModal = new PublishProgressModal(this.app);
    progressModal.open();

    try {
      // Step 1: Extract and upload images
      let processedContent = content;
      const images = extractImages(content);
    let imgStats: { total: number; cached: number; uploaded: number } = {
      total: 0, cached: 0, uploaded: 0,
    };

    const xmlrpc = new XmlRpcClient(
      settings.xmlrpcUrl,
      settings.username,
      settings.password
    );

    if (images.length > 0) {
      const uploader = createImageUploader(settings, xmlrpc);

      if (uploader) {
        const cache = settings.imageCache ?? {};
        const urlMap = new Map<string, string>();
        let cacheChanged = false;
        let uploadedCount = 0;

        for (const img of images) {
          const imgFile = resolveImageFile(img.path, noteFile, this.vault);
          if (!imgFile) continue;
          imgStats.total++;

          // Check cache by vault-relative path
          const cacheKey = imgFile.path;
          if (cache[cacheKey]) {
            urlMap.set(img.path, cache[cacheKey]);
            imgStats.cached++;
            continue;
          }

          try {
            progressModal.setStatus(
              t("uploading_images", { current: uploadedCount + 1, total: images.length })
            );
            const imgData = await this.vault.readBinary(imgFile);
            const mimeType = this.getMimeType(imgFile.extension);
            const uploadedUrl = await uploader.uploadImage(imgData, imgFile.name, mimeType, pubDate);
            urlMap.set(img.path, uploadedUrl);
            cache[cacheKey] = uploadedUrl;
            cacheChanged = true;
            imgStats.uploaded++;
            uploadedCount++;
          } catch (e) {
            new Notice(
              `${t("img_upload_failed")}"${imgFile.name}": ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }

        if (cacheChanged) {
          settings.imageCache = cache;
          await this.saveSettings();
        }

        if (imgStats.uploaded > 0 || imgStats.cached > 0) {
          processedContent = replaceImageUrls(content, urlMap);
        }
      } else if (settings.useImageHost) {
        // External image host is enabled but not configured
        new Notice(t("img_stats_no_r2", { total: images.length }));
      }
      // else: useImageHost disabled but no uploader — shouldn't happen since
      // TypechoUploader is always available with valid xmlrpc credentials
    }

    // Step 1.5: Convert wiki-links to blog post links
    if (settings.linkConversionEnabled && settings.linkUrlTemplate) {
      processedContent = convertWikiLinks(processedContent, {
        vault: this.vault,
        metadataCache: this.metadataCache,
        sourcePath: noteFile.path,
        dateCreatedKey: fm.dateCreated,
        slugKey: fm.slug || "slug",
        slugDateFormat: settings.slugDateFormat,
        titleKey: fm.title || "title",
        urlTemplate: settings.linkUrlTemplate,
      });
    }

    // Step 1.6: Strip cutoff sections (Draft, ChangeLog, PrivateNote, etc.)
    if (settings.cutoffSections) {
      const sections = settings.cutoffSections
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      processedContent = stripCutoffSections(processedContent, sections);
    }

    // Strip frontmatter for the published content
    const bodyOnly = this.stripFrontmatter(processedContent);

    // Build post content with mapped fields + fallbacks
    const postContent: PostContent = {
      title,
      description: bodyOnly,
      categories: categories.length > 0 ? categories : undefined,
      mt_keywords: tags.length > 0 ? tags.join(",") : undefined,
      slug,
      mt_allow_comments: parseInt(allowComments, 10) || 1,
      mt_excerpt: excerpt,
      post_status: status,
      wp_post_type: postType,
      dateCreated: pubDate,
    };

    // Step 2: Check if article exists and publish
    progressModal.setStatus(t("publishing_to"));

    if (existingPostId) {
      await xmlrpc.editPost(existingPostId, postContent, true);
      progressModal.resolve(
        t("publish_success"),
        this.buildNotice(existingPostId, title, slug, pubDate, settings.linkUrlTemplate, imgStats, false),
        false
      );
    } else {
      const newPostId = await xmlrpc.newPost(postContent, true);
      await this.savePostId(noteFile, newPostId);
      progressModal.resolve(
        t("publish_success"),
        this.buildNotice(newPostId, title, slug, pubDate, settings.linkUrlTemplate, imgStats, true),
        false
      );
    }
  } catch (e) {
    console.error("[TypechoPlugin] publish() UNCAUGHT ERROR:", e);
    progressModal.resolve(
      t("publish_error"),
      e instanceof Error ? e.message : String(e),
      true
    );
  }
  }

  /**
   * Validate that each mapped frontmatter field uses the correct Obsidian property type.
   * Returns true if all fields pass, false if any type mismatch is found.
   */
  private validateFieldTypes(
    noteFile: TFile,
    fm: FieldMapping
  ): boolean {
    const cache = this.metadataCache.getFileCache(noteFile);
    const cacheFm = cache?.frontmatter;
    if (!cacheFm) return true;

    const rules: Record<string, { jsTypes: string[]; label: string }> = {
      dateCreated: { jsTypes: ["string"], label: "日期&时间" },
      title: { jsTypes: ["string", "array"], label: "文本 / 列表" },
      categories: { jsTypes: ["array"], label: "列表" },
      mt_keywords: { jsTypes: ["array"], label: "列表" },
      slug: { jsTypes: ["string"], label: "文本" },
      post_type: { jsTypes: ["string"], label: "文本" },
      mt_allow_comments: { jsTypes: ["number"], label: "数字" },
      mt_excerpt: { jsTypes: ["string"], label: "文本" },
      post_status: { jsTypes: ["string"], label: "文本" },
    };

    for (const [field, rule] of Object.entries(rules)) {
      const fmKey = fm[field as keyof FieldMapping];
      if (!fmKey) continue;

      const val = cacheFm[fmKey];
      if (val === undefined || val === null) continue;

      const jsType = Array.isArray(val) ? "array" : typeof val;
      if (!rule.jsTypes.includes(jsType)) {
        new Notice(
          t("type_error", {
            field: fmKey,
            expected: rule.label,
            actual: jsTypeToObsidian(jsType),
          })
        );
        return false;
      }
    }

    return true;
  }

  /** Show a confirm dialog warning about missing typecho_postid. */
  private confirmNewPost(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText(t("confirm_new_title"));

      const content = modal.contentEl.createEl("p", {
        text: t("confirm_new_message"),
      });

      new Setting(modal.contentEl)
        .addButton((btn) =>
          btn
            .setButtonText(t("confirm_new_confirm"))
            .setCta()
            .onClick(() => {
              modal.close();
              resolve(true);
            })
        )
        .addButton((btn) =>
          btn
            .setButtonText(t("confirm_new_cancel"))
            .onClick(() => {
              modal.close();
              resolve(false);
            })
        );

      modal.open();
    });
  }

  private buildNotice(
    postId: string,
    title: string,
    slug: string,
    pubDate: Date,
    urlTemplate: string,
    imgStats: { total: number; cached: number; uploaded: number },
    isNew: boolean
  ): string {
    const header = isNew
      ? t("article_new", { postid: postId })
      : t("article_updated", { postid: postId });
    const lines: string[] = [`<b>${escHtml(header)}</b>`];
    lines.push(escHtml(t("article_detail_title", { title })));
    lines.push(escHtml(t("article_detail_slug", { slug })));

    // Build article URL from template
    if (urlTemplate) {
      const url = urlTemplate
        .replace("{slug}", slug)
        .replace("{postid}", postId)
        .replace("{year}", String(pubDate.getFullYear()))
        .replace("{month}", String(pubDate.getMonth() + 1).padStart(2, "0"))
        .replace("{day}", String(pubDate.getDate()).padStart(2, "0"));
      lines.push(`<a href="${escHtml(url)}" target="_blank">${escHtml(t("article_detail_more"))}</a>`);
    }

    if (imgStats.total > 0) {
      lines.push(escHtml(t("img_stats", {
        total: imgStats.total,
        cached: imgStats.cached,
        new: imgStats.uploaded,
      })));
    }

    return lines.join("\n");
  }

  private get fieldMapping() {
    return this.getSettings().fieldMapping;
  }

  /** Read a single string value from frontmatter using the mapped key. */
  private getFmValue(
    fm: Record<string, unknown>,
    fmKey: string
  ): string | undefined {
    if (!fmKey) return undefined;
    const val = fm[fmKey];
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
    if (Array.isArray(val) && val.length > 0) return String(val[0]);
    return undefined;
  }

  /** Read a list value from frontmatter using the mapped key. */
  private getFmList(
    fm: Record<string, unknown>,
    fmKey: string
  ): string[] {
    if (!fmKey) return [];
    const val = fm[fmKey];
    if (Array.isArray(val)) return val.map((v) => String(v));
    if (typeof val === "string") return val.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    return [];
  }

  private extractFirstHeading(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /** Parse frontmatter from actual file content, avoiding stale cache. */
  private parseFrontmatter(content: string): Record<string, unknown> {
    if (!/^---\n/.test(content)) return {};
    const endIdx = content.indexOf("\n---", 4);
    if (endIdx === -1) return {};
    const yaml = content.slice(4, endIdx);
    const result: Record<string, unknown> = {};
    let currentKey = "";

    for (const line of yaml.split("\n")) {
      // YAML list item: "  - value" — appends to the current key
      const listMatch = line.match(/^\s+-\s+(.+)$/);
      if (listMatch && currentKey) {
        const item = listMatch[1].trim().replace(/^["']|["']$/g, "");
        const existing = result[currentKey];
        if (Array.isArray(existing)) {
          existing.push(item);
        } else {
          result[currentKey] = [item];
        }
        continue;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;

      currentKey = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();

      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (value.startsWith("[") && value.endsWith("]")) {
        // Inline array: [a, b, c]
        result[currentKey] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      } else if (value !== "") {
        // Plain scalar value
        result[currentKey] = value;
      }
      // If value is empty, don't set anything yet — might be a YAML list
    }

    return result;
  }

  private stripFrontmatter(content: string): string {
    // Remove YAML frontmatter if present
    if (/^---\n/.test(content)) {
      const endIdx = content.indexOf("\n---", 4);
      if (endIdx !== -1) {
        return content.slice(endIdx + 4).trim();
      }
    }
    return content.trim();
  }

  private async savePostId(noteFile: TFile, postId: string): Promise<void> {
    await this.processFrontMatter(noteFile, (fm) => {
      fm[FRONTMATTER_POST_ID_KEY] = postId;
    });
  }


  /** Format a date using a pattern with tokens:
   *  YYYY=year, YY=2-digit-year, MM=month, DD=day, HH=hour, mm=minute, ss=second */
  private formatDate(format: string, d: Date): string {
    const tokens: Record<string, string> = {
      YYYY: String(d.getFullYear()),
      YY: String(d.getFullYear()).slice(-2),
      MM: String(d.getMonth() + 1).padStart(2, "0"),
      DD: String(d.getDate()).padStart(2, "0"),
      HH: String(d.getHours()).padStart(2, "0"),
      mm: String(d.getMinutes()).padStart(2, "0"),
      ss: String(d.getSeconds()).padStart(2, "0"),
    };
    let result = format;
    // Replace long tokens first to avoid partial matches (YYYY before YY)
    for (const [token, value] of Object.entries(tokens)) {
      result = result.replace(token, value);
    }
    return result;
  }

  private getMimeType(extension: string): string {
    const map: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
      ico: "image/x-icon",
      tiff: "image/tiff",
      tif: "image/tiff",
      avif: "image/avif",
    };
    return map[extension.toLowerCase()] || "application/octet-stream";
  }
}
