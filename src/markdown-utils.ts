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

/**
 * Extract all image references from markdown content.
 * Supports: ![[image.png]] and ![alt](path/to/image.png)
 */
export function extractImages(content: string): ImageRef[] {
  const images: ImageRef[] = [];

  // Wiki-style: ![[image.png]] or ![[folder/image.png]]
  const wikiRegex = /!\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = wikiRegex.exec(content)) !== null) {
    images.push({
      fullMatch: match[0],
      alt: "",
      path: match[1].split("|")[0].trim(), // handle |alias
      isWikiLink: true,
    });
  }

  // Standard markdown: ![alt](path)
  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = mdRegex.exec(content)) !== null) {
    // Skip external URLs
    if (/^https?:\/\//.test(match[2])) continue;
    images.push({
      fullMatch: match[0],
      alt: match[1],
      path: match[2],
      isWikiLink: false,
    });
  }

  return images;
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
  let result = content;

  // Wiki-style
  result = result.replace(/!\[\[([^\]]+)\]\]/g, (fullMatch, inner) => {
    const cleanPath = inner.split("|")[0].trim();
    const remoteUrl = urlMap.get(cleanPath);
    if (remoteUrl) {
      const alias = inner.includes("|") ? inner.split("|")[1].trim() : cleanPath;
      return `![${alias}](${remoteUrl})`;
    }
    return fullMatch;
  });

  // Standard markdown
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (fullMatch, alt, filePath) => {
      if (/^https?:\/\//.test(filePath)) return fullMatch;
      const remoteUrl = urlMap.get(filePath);
      if (remoteUrl) {
        return `![${alt}](${remoteUrl})`;
      }
      return fullMatch;
    }
  );

  return result;
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
 * Image links (![[...]]) are left untouched — they're handled by replaceImageUrls().
 */
export function convertWikiLinks(content: string, ctx: WikiLinkContext): string {
  // Match [[...]] but NOT ![[...]] (images handled upstream)
  const linkRegex = /(?<!!)\[\[([^\]]+)\]\]/g;

  return content.replace(linkRegex, (_full: string, inner: string) => {
    const parts = inner.split("|");
    const linktext = parts[0].trim();
    const alias = parts.length > 1 ? parts.slice(1).join("|").trim() : "";

    // Try to resolve the wikilink to a TFile
    let target: TFile | null = null;
    try {
      target = ctx.metadataCache.getFirstLinkpathDest(linktext, ctx.sourcePath);
    } catch {
      // Resolution failed
    }

    if (!target || target.extension !== "md") {
      // Unresolvable or non-md → strip brackets, keep display text
      return alias || linktext;
    }

    // Read target frontmatter (use cache for performance)
    const cache = ctx.metadataCache.getFileCache(target);
    const fm = cache?.frontmatter ?? {};

    // Check if target is a published blog post (has dateCreated field)
    if (!fm[ctx.dateCreatedKey]) {
      return alias || linktext;
    }

    // --- This is a blog post — build the link ---

    // Title: frontmatter title key → aliases[0] → basename
    let title = getFmString(fm, ctx.titleKey);
    if (!title) {
      const aliases = fm["aliases"];
      if (Array.isArray(aliases) && aliases.length > 0) {
        title = String(aliases[0]);
      }
    }
    if (!title) title = target.basename;

    // Slug: frontmatter slug key → fallback from dateCreated using format
    let slug = getFmString(fm, ctx.slugKey);
    if (!slug) {
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
      slug = formatDateSlug(ctx.slugDateFormat, d);
    }

    // Build URL from template
    const url = buildUrl(ctx.urlTemplate, {
      slug,
      postid: getFmString(fm, "typecho_postid") ?? "",
      dateValue: getFmString(fm, ctx.dateCreatedKey) ?? "",
    });
    const display = alias || title;

    return `[${display}](${url})`;
  });
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

  // {slug} and {postid}
  url = url.replace("{slug}", vars.slug);
  url = url.replace("{postid}", vars.postid);

  // {year}, {month}, {day} from dateValue
  // Try to parse as a Date; dateValue could be any format JS Date can parse
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

  // Build regex: /^#{2,3}\s+(Section1|Section2|...)\b/gim
  const names = sections
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape regex
    .join("|");

  if (!names) return content;

  const regex = new RegExp(`^#{1,3}\\s+(${names})\\b`, "gim");
  const match = regex.exec(content);

  if (match) {
    return content.slice(0, match.index).trim();
  }

  return content;
}
