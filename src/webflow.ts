import { toApiError } from "./errors";
import type { AppConfig } from "./config";

export interface WebflowItem {
  id: string;
  slug?: string;
}

export interface WebflowClient {
  createLive(fieldData: Record<string, unknown>): Promise<WebflowItem>;
  updateLive(itemId: string, fieldData: Record<string, unknown>): Promise<WebflowItem>;
  unpublish(itemId: string): Promise<void>;
}

export function webflowLiveUrls(collectionId: string, itemId?: string): {
  createLive: string;
  updateLive: string;
  unpublishLive: string;
} {
  const base = `https://api.webflow.com/v2/collections/${encodeURIComponent(collectionId)}`;
  return {
    createLive: `${base}/items/live?skipInvalidFiles=true`,
    updateLive: `${base}/items/${encodeURIComponent(itemId ?? "")}/live?skipInvalidFiles=true`,
    unpublishLive: `${base}/items/live`,
  };
}

/**
 * Create/update live item responses put `id` on the item.
 * Bulk responses use `items[0]`. Only id and slug are returned.
 */
export function readWebflowItem(body: unknown): WebflowItem {
  if (!body || typeof body !== "object") {
    throw new Error("Webflow response missing item id");
  }
  const root = body as Record<string, unknown>;
  const item = typeof root.id === "string"
    ? root
    : Array.isArray(root.items) && root.items[0] && typeof root.items[0] === "object"
      ? (root.items[0] as Record<string, unknown>)
      : undefined;
  if (!item || typeof item.id !== "string" || !item.id.trim()) {
    throw new Error("Webflow response missing item id");
  }
  const fieldData = item.fieldData;
  const slug = fieldData && typeof fieldData === "object" && typeof (fieldData as { slug?: unknown }).slug === "string"
    ? (fieldData as { slug: string }).slug
    : undefined;
  return { id: item.id, slug };
}

export function createWebflow(config: AppConfig, fetchImpl: typeof fetch = fetch): WebflowClient {
  const urls = webflowLiveUrls(config.webflowCollectionId);

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchWithRetry(url, {
      ...init,
      headers: {
        authorization: `Bearer ${config.webflowToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
    }, fetchImpl);
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw toApiError("Webflow", response.status, body);
    }
    return body;
  }

  return {
    async createLive(fieldData) {
      const body = await request(urls.createLive, {
        method: "POST",
        body: JSON.stringify({ isArchived: false, isDraft: false, fieldData }),
      });
      return readWebflowItem(body);
    },

    async updateLive(itemId, fieldData) {
      const body = await request(webflowLiveUrls(config.webflowCollectionId, itemId).updateLive, {
        method: "PATCH",
        body: JSON.stringify({ fieldData }),
      });
      return readWebflowItem(body);
    },

    async unpublish(itemId) {
      await request(urls.unpublishLive, {
        method: "DELETE",
        body: JSON.stringify({ items: [{ id: itemId }] }),
      });
    },
  };
}

async function fetchWithRetry(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  const send = () => fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const first = await send();
  if (first.status !== 429 && first.status < 500) return first;
  await first.arrayBuffer().catch(() => undefined);
  await delay(400);
  return send();
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
