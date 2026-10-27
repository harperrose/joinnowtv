const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export interface WebhookBody {
  recordId?: string;
  baseId?: string;
}

/**
 * Reads only a record id and, for a native Airtable ping, the base id.
 * Profile fields on the body are ignored. The sync re-fetches the row.
 */
export function readWebhookBody(body: unknown): WebhookBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Webhook body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  const recordId = firstRecordId(record.recordId, record.record_id, record.id);
  if (recordId === "invalid") {
    throw new Error("Webhook record id is invalid");
  }

  let baseId: string | undefined;
  const base = record.base;
  if (base && typeof base === "object" && !Array.isArray(base)) {
    const id = (base as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) baseId = id.trim();
  }

  return { recordId, baseId };
}

function firstRecordId(...values: unknown[]): string | undefined | "invalid" {
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    return RECORD_ID.test(trimmed) ? trimmed : "invalid";
  }
  return undefined;
}
