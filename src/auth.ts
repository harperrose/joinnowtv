import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

/**
 * Airtable signs the raw notification body.
 * WEBHOOK_SECRET is the macSecretBase64 returned when the webhook was created.
 * Header value: `hmac-sha256=` plus the hex HMAC-SHA256 of the raw body,
 * keyed with the base64-decoded secret.
 */
export function verifyAirtableMac(rawBody: string, header: string, macSecretBase64: string): boolean {
  const key = Buffer.from(macSecretBase64, "base64");
  if (key.length === 0 || !header.trim()) return false;
  const digest = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  return safeEqual(`hmac-sha256=${digest}`, header.trim());
}

export function verifyBearer(authorization: string | null, secret: string): boolean {
  if (!authorization || !secret) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) return false;
  return safeEqual(match[1], secret);
}

export function verifyWebhookRequest(headers: Headers, rawBody: string, secret: string): boolean {
  const mac = headers.get("x-airtable-content-mac");
  if (mac) return verifyAirtableMac(rawBody, mac, secret);
  if (verifyBearer(headers.get("authorization"), secret)) return true;
  const custom = headers.get("x-webhook-secret");
  if (custom && safeEqual(custom, secret)) return true;
  return false;
}
