/**
 * Headshot size is independent of publish.
 * Over 4MB sets "Exceeds Limit" and does not block create, update, or unpublish.
 * A file that is 4MB or smaller, or no file at all, sets "Within Limit".
 *
 * 4MB here is 4 * 1024 * 1024 bytes. Exactly that size is still Within Limit.
 */

export const HEADSHOT_WITHIN = "Within Limit";
export const HEADSHOT_EXCEEDS = "Exceeds Limit";
export const HEADSHOT_MAX_BYTES = 4 * 1024 * 1024;

export type HeadshotLimit = typeof HEADSHOT_WITHIN | typeof HEADSHOT_EXCEEDS;

export function headshotLimitForSize(sizeBytes: number): HeadshotLimit {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error("Headshot size is not a valid byte count");
  }
  return sizeBytes > HEADSHOT_MAX_BYTES ? HEADSHOT_EXCEEDS : HEADSHOT_WITHIN;
}

/**
 * Airtable attachment records include `size`. When they do not, look up
 * Content-Length with HEAD. Only Airtable's own attachment host is contacted.
 * The error text never includes the URL.
 */
export async function lookupAttachmentBytes(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Headshot size unavailable");
  }

  const host = parsed.hostname.toLowerCase();
  const airtableHost = host === "airtableusercontent.com" || host.endsWith(".airtableusercontent.com");
  if (parsed.protocol !== "https:" || !airtableHost) {
    throw new Error("Headshot size unavailable");
  }

  const response = await fetchImpl(parsed.toString(), {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error("Headshot size unavailable");
  }

  const length = response.headers.get("content-length");
  await response.arrayBuffer().catch(() => undefined);
  if (!length || !/^\d+$/.test(length)) {
    throw new Error("Headshot size unavailable");
  }
  return Number(length);
}
