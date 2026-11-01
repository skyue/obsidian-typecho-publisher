import { TFile, Vault } from "obsidian";

export interface ImageRef {
  /** The full matched text, e.g. "![[image.png]]" or "![alt](path)" */
  fullMatch: string;
  /** Alt text for markdown images, or empty for wiki links */
  alt: string;
  /** The path part (inside [[]] or ()) */
  path: string;
  /** Whether this is a wiki-style link */
  isWikiLink: boolean;
}

/** Visit embeds outside fenced code blocks and inline code. */
function mapEmbeds(content: string, replace: (full: string, path: string, alt: string) => string): string {
  const tokens = /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\2[~`]*[ \t]*(?:\n|$))|(`+)[^`]*?\3|!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/gm;
  return content.replace(tokens, (full, fence, marker, inline, wiki, alt, target) => {
    if (fence || inline) return full;
    const parts = wiki?.split("|");
    return replace(full, parts ? parts[0].trim() : target.replace(/^<|>$/g, ""), parts ? (parts[1]?.trim() || parts[0].trim()) : alt);
  });
}

export function mediaKind(path: string): "image" | "video" | "audio" | "file" {
  const extension = path.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "";
  if (/^(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|avif)$/.test(extension)) return "image";
  if (/^(mp4|m4v|webm|ogv|mov|mkv)$/.test(extension)) return "video";
  if (/^(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/.test(extension)) return "audio";
  return "file";
}

export function extractImages(content: string): ImageRef[] {
  const refs: ImageRef[] = [];
  mapEmbeds(content, (fullMatch, path, alt) => {
    if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path)) {
      // Note transclusions are not publishable media attachments.
      if (!/\.md(?:#|$)/i.test(path) && (path.split("/").pop() || "").includes("."))
        refs.push({ fullMatch, path, alt, isWikiLink: fullMatch.startsWith("![[") });
    }
    return fullMatch;
  });
  return refs;
}

/**
 * Resolve an image path relative to the note file to an actual TFile.
 */
export function resolveImageFile(
  imagePath: string,
  noteFile: TFile,
  vault: Vault
): TFile | null {
  // Try as absolute path from vault root
  let file = vault.getAbstractFileByPath(imagePath);
  if (file instanceof TFile) return file;

  // Try relative to the note's directory
  const noteDir = noteFile.parent?.path ?? "";
  if (noteDir) {
    const relativePath = `${noteDir}/${imagePath}`;
    file = vault.getAbstractFileByPath(relativePath);
    if (file instanceof TFile) return file;
  }

  // Try in the vault root
  file = vault.getAbstractFileByPath(imagePath.replace(/^.*\//, ""));
  if (file instanceof TFile) return file;

  // Try common attachment folders
  for (const prefix of ["attachments", "images", "assets", "media"]) {
    file = vault.getAbstractFileByPath(
      `${prefix}/${imagePath.replace(/^.*\//, "")}`
    );
    if (file instanceof TFile) return file;
  }

  return null;
}

/**
 * Replace local image references with remote URLs.
 * urlMap is a map of original reference path → remote URL.
 */
export function replaceImageUrls(
  content: string,
  urlMap: Map<string, string>
): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return mapEmbeds(content, (full, path, alt) => {
    const url = urlMap.get(path) || (/^https?:\/\//i.test(path) ? path : undefined);
    if (!url || !/^https?:\/\//i.test(url)) return full;
    const kind = mediaKind(path);
    if (kind === "image") return `![${alt.replace(/[[\]]/g, "")}](${url})`;
    const link = `<a href="${escape(url)}">${escape(alt || path)}</a>`;
    if (kind === "file") return link;
    return `\n\n<${kind} controls preload="metadata"${kind === "video" ? ' playsinline style="max-width:100%"' : ''} src="${escape(url)}">${link}</${kind}>\n\n`;
  });
}

// ── Wiki-link conversion ────────────────────────────────────────────

export interface WikiLinkContext {
  vault: Vault;
  metadataCache: {
    getFirstLinkpathDest: (linktext: string, sourcePath: string) => TFile | null;
    getFileCache: (file: TFile) => { frontmatter?: Record<string, unknown> } | null;
  };
  sourcePath: string;
  dateCreatedKey: string;
  slugKey: string;
  slugDateFormat: string;
  titleKey: string;
  urlTemplate: string;
}

/**
 * Convert [[wikilinks]] to markdown blog links when the target note has
 * the dateCreated frontmatter field (indicating it's a published blog post).
 * Non-blog links become plain text (stripped brackets).
 * Image links (![[...]]) are left untouched — handled by replaceImageUrls().
 */
export function convertWikiLinks(content: string, ctx: WikiLinkContext): string {
  const linkRegex = /(?<!!)\[\[([^\]]+)\]\]/g;
  let result = content;

  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(content)) !== null) {
    const inner = m[1];
    const parts = inner.split("|");
    const linktext = parts[0].trim();
    const alias = parts.length > 1 ? parts.slice(1).join("|").trim() : "";

    let target: TFile | null = null;
    try {
      target = ctx.metadataCache.getFirstLinkpathDest(linktext, ctx.sourcePath);
    } catch {
      // Resolution failed
    }

    if (!target || target.extension !== "md") {
      result = result.replace(m[0], alias || linktext);
      continue;
    }

    const cache = ctx.metadataCache.getFileCache(target);
    const fm = cache?.frontmatter ?? {};

    if (!fm[ctx.dateCreatedKey]) {
      result = result.replace(m[0], alias || linktext);
      continue;
    }

    // --- Build the blog link ---

    let displayTitle = getFmString(fm, ctx.titleKey);
    if (!displayTitle) {
      const linkAliases = fm["aliases"];
      if (Array.isArray(linkAliases) && linkAliases.length > 0) {
        displayTitle = String(linkAliases[0]);
      }
    }
    if (!displayTitle) displayTitle = target.basename;

    let resolvedSlug = getFmString(fm, ctx.slugKey);
    if (!resolvedSlug) {
      const dateStr = getFmString(fm, ctx.dateCreatedKey);
      if (!dateStr) {
        throw new Error(
          `Wiki-link target "${target.path}" is missing dateCreated value.`
        );
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        throw new Error(
          `Failed to parse dateCreated "${dateStr}" in "${target.path}". Check the date format.`
        );
      }
      resolvedSlug = formatDateSlug(ctx.slugDateFormat, d);
    }

    const url = buildUrl(ctx.urlTemplate, {
      slug: resolvedSlug,
      postid: getFmString(fm, "typecho_postid") ?? "",
      dateValue: getFmString(fm, ctx.dateCreatedKey) ?? "",
    });
    const display = alias || displayTitle;

    result = result.replace(m[0], `[${display}](${url})`);
  }

  return result;
}

function formatDateSlug(format: string, d: Date): string {
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
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
}

function getFmString(fm: Record<string, unknown>, key: string): string | undefined {
  if (!key) return undefined;
  const val = fm[key];
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (Array.isArray(val) && val.length > 0) return String(val[0]);
  return undefined;
}

function buildUrl(
  template: string,
  vars: { slug: string; postid: string; dateValue: string }
): string {
  let url = template;

  url = url.replace("{slug}", vars.slug);
  url = url.replace("{postid}", vars.postid);

  if (/\{(year|month|day)\}/.test(url) && vars.dateValue) {
    const d = new Date(vars.dateValue);
    if (!isNaN(d.getTime())) {
      url = url.replace("{year}", String(d.getFullYear()));
      url = url.replace("{month}", String(d.getMonth() + 1).padStart(2, "0"));
      url = url.replace("{day}", String(d.getDate()).padStart(2, "0"));
    }
  }

  return url;
}

// ── Content cutoff ──────────────────────────────────────────────────

/**
 * Strip content starting from the first occurrence of any configured
 * heading (## or ###). Section names are matched case-insensitively.
 */
export function stripCutoffSections(content: string, sections: string[]): string {
  if (!sections.length) return content;

  const names = sections
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  if (!names) return content;

  const regex = new RegExp(`^#{1,3}\\s+(${names})\\b`, "gim");
  const match = regex.exec(content);

  if (match) {
    return content.slice(0, match.index).trim();
  }

  return content;
}
