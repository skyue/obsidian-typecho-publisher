import { requestUrl } from "obsidian";

export interface PostContent {
  title: string;
  description: string;
  categories?: string[];
  mt_keywords?: string;
  slug?: string;
  mt_allow_comments?: number;
  mt_excerpt?: string;
  post_status?: string;
  wp_post_type?: string;  // "post" or "page"
  dateCreated?: Date;
}

/** Wrapper to signal that a string value should be serialized as <base64>. */
export class Base64Value {
  constructor(public data: string) {}
}

function serializeValue(val: unknown): string {
  if (val === null || val === undefined) {
    return "<value><nil/></value>";
  }

  if (val instanceof Base64Value) {
    return `<value><base64>${val.data}</base64></value>`;
  }

  switch (typeof val) {
    case "number":
      return Number.isInteger(val)
        ? `<value><int>${val}</int></value>`
        : `<value><double>${val}</double></value>`;
    case "boolean":
      return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
    case "string":
      return `<value><string>${escapeXml(val)}</string></value>`;
  }

  if (val instanceof Date) {
    // XML-RPC spec: YYYYMMDDTHH:MM:SS (no dashes, no ms)
    // Use local time, not UTC — Typecho stores/renders as-is.
    const formatted =
      String(val.getFullYear()) +
      String(val.getMonth() + 1).padStart(2, "0") +
      String(val.getDate()).padStart(2, "0") +
      "T" +
      String(val.getHours()).padStart(2, "0") +
      ":" +
      String(val.getMinutes()).padStart(2, "0") +
      ":" +
      String(val.getSeconds()).padStart(2, "0");
    return `<value><dateTime.iso8601>${formatted}</dateTime.iso8601></value>`;
  }

  if (Array.isArray(val)) {
    const items = val.map((v) => serializeValue(v)).join("");
    return `<value><array><data>${items}</data></array></value>`;
  }

  if (typeof val === "object") {
    const members = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `<member><name>${escapeXml(k)}</name>${serializeValue(v)}</member>`)
      .join("");
    return `<value><struct>${members}</struct></value>`;
  }

  return `<value><string>${escapeXml(String(val))}</string></value>`;
}

function serializeParams(params: unknown[]): string {
  return params.map((p) => `<param>${serializeValue(p)}</param>`).join("");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseValue(node: Element): unknown {
  const typeNode = node.firstElementChild;
  if (!typeNode) return "";
  const tag = typeNode.tagName;

  switch (tag) {
    case "string":
    case "text":
      return typeNode.textContent ?? "";
    case "int":
    case "i4":
      return parseInt(typeNode.textContent ?? "0", 10);
    case "double":
      return parseFloat(typeNode.textContent ?? "0");
    case "boolean":
      return typeNode.textContent === "1";
    case "dateTime.iso8601":
      return typeNode.textContent ?? "";
    case "nil":
      return null;
    case "base64":
      return typeNode.textContent ?? "";
    case "array": {
      const data = typeNode.firstElementChild;
      if (!data) return [];
      return Array.from(data.children).map(parseValue);
    }
    case "struct": {
      const result: Record<string, unknown> = {};
      for (const member of typeNode.children) {
        const name = member.querySelector("name")?.textContent ?? "";
        const value = member.querySelector("value");
        if (value) result[name] = parseValue(value);
      }
      return result;
    }
    default:
      return typeNode.textContent ?? "";
  }
}

export class XmlRpcClient {
  constructor(
    private endpoint: string,
    private username: string,
    private password: string
  ) {}

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${escapeXml(method)}</methodName>
  <params>${serializeParams(params)}</params>
</methodCall>`;

    const response = await requestUrl({
      url: this.endpoint,
      method: "POST",
      contentType: "text/xml",
      body,
      headers: {
        "User-Agent": "Obsidian-Typecho/1.0",
      },
    });

    // Strip PHP deprecation warnings and HTML noise from the response.
    // Typecho under PHP 8.x outputs <br />, <b>Deprecated</b>, etc. before
    // the XML body, which breaks DOMParser.
    let cleanXml = response.text
      // Strip HTML tags used by PHP error output
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?b>/gi, "")
      // Remove PHP deprecation/warning lines
      .replace(
        /^(Deprecated|Warning|Notice|Fatal error|Parse error):.*$/gm,
        ""
      )
      .trim();

    // If the cleaned text still doesn't start with XML, find where XML begins
    const xmlStart = cleanXml.indexOf("<?xml");
    const mrStart = cleanXml.indexOf("<methodResponse");
    const startIdx =
      xmlStart === -1 ? mrStart : mrStart === -1 ? xmlStart : Math.min(xmlStart, mrStart);
    if (startIdx !== -1) {
      cleanXml = cleanXml.slice(startIdx);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanXml, "text/xml");

    const faultNode = doc.querySelector("methodResponse > fault > value");
    if (faultNode) {
      const fault = parseValue(faultNode) as Record<string, unknown>;
      throw new Error(
        `XML-RPC Fault ${fault.faultCode}: ${fault.faultString}`
      );
    }

    const paramNode = doc.querySelector(
      "methodResponse > params > param > value"
    );
    if (!paramNode) return null;
    return parseValue(paramNode);
  }

  private buildStruct(content: PostContent): Record<string, unknown> {
    const struct: Record<string, unknown> = {
      title: content.title,
      description: content.description,
    };
    if (content.categories?.length) struct.categories = content.categories;
    if (content.mt_keywords) struct.mt_keywords = content.mt_keywords;
    if (content.slug) struct.slug = content.slug;
    if (content.mt_allow_comments !== undefined)
      struct.mt_allow_comments = content.mt_allow_comments;
    if (content.mt_excerpt) struct.mt_excerpt = content.mt_excerpt;
    if (content.post_status) struct.post_status = content.post_status;
    if (content.wp_post_type) struct.post_type = content.wp_post_type;
    if (content.dateCreated) struct.dateCreated = content.dateCreated;
    return struct;
  }

  async newPost(
    content: PostContent,
    publish: boolean = true
  ): Promise<string> {
    const struct = this.buildStruct(content);
    const result = await this.call("metaWeblog.newPost", [
      "",
      this.username,
      this.password,
      struct,
      publish,
    ]);
    return String(result ?? "");
  }

  async editPost(
    postId: string,
    content: PostContent,
    publish: boolean = true
  ): Promise<boolean> {
    const struct = this.buildStruct(content);
    const result = await this.call("metaWeblog.editPost", [
      postId,
      this.username,
      this.password,
      struct,
      publish,
    ]);
    return Boolean(result);
  }

  async uploadMedia(
    name: string,
    mimeType: string,
    bits: string // base64-encoded
  ): Promise<string> {
    const struct: Record<string, unknown> = {
      name,
      type: mimeType,
      bits: new Base64Value(bits),
    };
    const result = await this.call("metaWeblog.newMediaObject", [
      "",
      this.username,
      this.password,
      struct,
    ]);
    const obj = result as Record<string, unknown> | null;
    return String(obj?.url ?? "");
  }
}
