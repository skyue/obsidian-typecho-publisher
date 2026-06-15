/**
 * Image uploader interface and built-in implementations.
 * Cloudflare R2 upload uses AWS Signature V4 with Web Crypto API.
 */

import { requestUrl } from "obsidian";
import type { TypechoSettings } from "./settings";
import type { XmlRpcClient } from "./xmlrpc-client";

// ── Interface ────────────────────────────────────────────────────────

export interface ImageUploader {
  uploadImage(
    imageData: ArrayBuffer,
    fileName: string,
    contentType: string,
    publishDate: Date
  ): Promise<string>;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(
  key: ArrayBuffer,
  data: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const encoded = new TextEncoder().encode(data);
  return crypto.subtle.sign("HMAC", cryptoKey, encoded.buffer as ArrayBuffer);
}

async function getSigningKey(
  secretKey: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode("AWS4" + secretKey).buffer as ArrayBuffer,
    date
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signRequest(
  method: string,
  url: string,
  region: string,
  service: string,
  headers: Record<string, string>,
  bodyHash: string,
  accessKeyId: string,
  signingKey: ArrayBuffer,
  amzDate: string,
  dateStamp: string
): Promise<string> {
  const parsedUrl = new URL(url);
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .join("\n");

  const signedHeaders = Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(";");

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    parsedUrl.search.slice(1),
    canonicalHeaders + "\n",
    signedHeaders,
    bodyHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = Array.from(
    new Uint8Array(await hmacSha256(signingKey, stringToSign))
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function resolveDateVars(template: string, d: Date): string {
  const tokens: [string, string][] = [
    ["{YYYY}", String(d.getFullYear())],
    ["{YY}", String(d.getFullYear()).slice(-2)],
    ["{MM}", String(d.getMonth() + 1).padStart(2, "0")],
    ["{DD}", String(d.getDate()).padStart(2, "0")],
    ["{HH}", String(d.getHours()).padStart(2, "0")],
    ["{mm}", String(d.getMinutes()).padStart(2, "0")],
    ["{ss}", String(d.getSeconds()).padStart(2, "0")],
  ];
  let result = template;
  for (const [token, value] of tokens) {
    result = result.replace(token, value);
  }
  return result;
}

// ── R2 Uploader ──────────────────────────────────────────────────────

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrlPrefix: string;
  pathPrefix?: string;
}

class R2Uploader implements ImageUploader {
  constructor(private config: R2Config) {}

  async uploadImage(
    imageData: ArrayBuffer,
    fileName: string,
    contentType: string,
    publishDate: Date
  ): Promise<string> {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate =
      dateStamp +
      "T" +
      now.toISOString().slice(11, 19).replace(/:/g, "") +
      "Z";

    const rawPrefix = this.config.pathPrefix || "blog-images";
    const pathPrefix = resolveDateVars(rawPrefix, publishDate).replace(/\/$/, "");
    const key = `${pathPrefix}/${fileName}`;

    const region = "auto";
    const service = "s3";
    const host = `${this.config.accountId}.r2.cloudflarestorage.com`;
    const url = `https://${host}/${this.config.bucket}/${key}`;

    const bodyHash = await sha256Hex(imageData);

    const signingHeaders: Record<string, string> = {
      Host: host,
      "Content-Type": contentType,
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": amzDate,
    };

    const signingKey = await getSigningKey(
      this.config.secretAccessKey,
      dateStamp,
      region,
      service
    );

    const authorization = await signRequest(
      "PUT",
      url,
      region,
      service,
      signingHeaders,
      bodyHash,
      this.config.accessKeyId,
      signingKey,
      amzDate,
      dateStamp
    );

    const headers: Record<string, string> = {
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    };

    try {
      await requestUrl({
        url,
        method: "PUT",
        contentType,
        body: imageData,
        headers,
      });
    } catch (e) {
      throw new Error(
        `R2 upload failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const publicUrl = this.config.publicUrlPrefix.replace(/\/$/, "");
    return `${publicUrl}/${key}`;
  }
}

// ── Typecho Media Uploader ───────────────────────────────────────────

class TypechoUploader implements ImageUploader {
  constructor(private xmlrpc: XmlRpcClient) {}

  async uploadImage(
    imageData: ArrayBuffer,
    fileName: string,
    contentType: string,
    _publishDate: Date
  ): Promise<string> {
    const bytes = new Uint8Array(imageData);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const bits = btoa(binary);
    return this.xmlrpc.uploadMedia(fileName, contentType, bits);
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createImageUploader(
  settings: TypechoSettings,
  xmlrpcClient?: XmlRpcClient
): ImageUploader | null {
  if (!settings.useImageHost) {
    // Upload to Typecho's built-in media library
    return xmlrpcClient ? new TypechoUploader(xmlrpcClient) : null;
  }

  // External image hosting — R2
  if (
    settings.imageHostType === "r2" &&
    settings.r2AccountId &&
    settings.r2AccessKeyId &&
    settings.r2SecretAccessKey &&
    settings.r2Bucket &&
    settings.r2PublicUrlPrefix
  ) {
    return new R2Uploader({
      accountId: settings.r2AccountId,
      accessKeyId: settings.r2AccessKeyId,
      secretAccessKey: settings.r2SecretAccessKey,
      bucket: settings.r2Bucket,
      publicUrlPrefix: settings.r2PublicUrlPrefix,
      pathPrefix: settings.r2PathPrefix,
    });
  }

  // Future: add more uploaders here
  // if (settings.imageHostType === "s3") { ... }
  // if (settings.imageHostType === "oss") { ... }

  return null;
}
