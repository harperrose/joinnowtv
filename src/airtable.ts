import { actionableFilterFormula } from "./status";
import {
  AIRTABLE_FIELDS,
  AIRTABLE_READ_FIELDS,
  parseProviderRecord,
  type ProviderRecord,
} from "./fields";
import { toApiError } from "./errors";
import type { AppConfig } from "./config";

export function airtableCollectionUrl(baseId: string, tableId: string, recordId?: string): string {
  const collection = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`;
  return recordId ? `${collection}/${encodeURIComponent(recordId)}` : collection;
}

export interface AirtableClient {
  listActionable(): Promise<ProviderRecord[]>;
  getRecord(recordId: string): Promise<ProviderRecord>;
  updateRecord(recordId: string, fields: Record<string, string | null>): Promise<void>;
}

export function createAirtable(config: AppConfig, fetchImpl: typeof fetch = fetch): AirtableClient {
  let includeSlug = true;

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchWithRetry(url, {
      ...init,
      headers: {
        authorization: `Bearer ${config.airtableToken}`,
        "content-type": "application/json",
      },
    }, fetchImpl);
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw toApiError("Airtable", response.status, body);
    }
    return body;
  }

  function fieldList(): string[] {
    return AIRTABLE_READ_FIELDS.filter((field) => includeSlug || field !== AIRTABLE_FIELDS.slug);
  }

  async function withSlugFallback<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const missingSlug = error instanceof Error
        && error.message.includes("UNKNOWN_FIELD_NAME")
        && error.message.includes(AIRTABLE_FIELDS.slug);
      if (!includeSlug || !missingSlug) {
        throw error;
      }
      includeSlug = false;
      return run();
    }
  }

  return {
    async listActionable() {
      return withSlugFallback(async () => {
        const records: ProviderRecord[] = [];
        let offset: string | undefined;
        for (let page = 0; page < 50; page += 1) {
          const url = new URL(airtableCollectionUrl(config.airtableBaseId, config.airtableTableId));
          url.searchParams.set(
            "filterByFormula",
            actionableFilterFormula({
              status: AIRTABLE_FIELDS.status,
              timeUnpublished: AIRTABLE_FIELDS.timeUnpublished,
            }),
          );
          url.searchParams.set("pageSize", "100");
          for (const field of fieldList()) url.searchParams.append("fields", field);
          if (offset) url.searchParams.set("offset", offset);

          const body = (await request(url.toString(), { method: "GET" })) as {
            records?: { id?: unknown; fields?: unknown }[];
            offset?: unknown;
          };
          for (const record of body.records ?? []) records.push(parseProviderRecord(record));
          offset = typeof body.offset === "string" ? body.offset : undefined;
          if (!offset) return records;
        }
        throw new Error("Too many actionable Airtable records");
      });
    },

    async getRecord(recordId: string) {
      return withSlugFallback(async () => {
        const url = new URL(airtableCollectionUrl(config.airtableBaseId, config.airtableTableId, recordId));
        for (const field of fieldList()) url.searchParams.append("fields", field);
        const body = (await request(url.toString(), { method: "GET" })) as { id?: unknown; fields?: unknown };
        return parseProviderRecord(body);
      });
    },

    async updateRecord(recordId: string, fields: Record<string, string | null>) {
      await request(airtableCollectionUrl(config.airtableBaseId, config.airtableTableId, recordId), {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      });
    },
  };
}

async function fetchWithRetry(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  const send = () =>
    fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
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
