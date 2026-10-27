import { verifyWebhookRequest } from "../src/auth";
import { loadConfig } from "../src/config";
import { createApp } from "../src/app";
import { ApiError, SyncError } from "../src/errors";
import { readWebhookBody } from "../src/webhook-body";
import { logSync } from "../src/log";

export const maxDuration = 60;

const config = loadConfig();
const app = createApp(config);

/**
 * POST /api/webhook
 *
 * Airtable automation: Authorization: Bearer WEBHOOK_SECRET, or X-Webhook-Secret.
 * Body may be `{ "recordId": "rec..." }`. Profile fields in the body are ignored.
 *
 * Native Airtable webhook: set WEBHOOK_SECRET to macSecretBase64.
 * The ping is verified with X-Airtable-Content-MAC, then this route polls
 * Ready to publish and unstamped Archive rows. Response is empty 204.
 */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 100_000) {
    return new Response("Payload too large", { status: 413 });
  }
  if (!verifyWebhookRequest(request.headers, raw, config.webhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const mac = request.headers.get("x-airtable-content-mac");
  let recordId: string | undefined;
  if (raw.trim()) {
    try {
      const parsed = readWebhookBody(JSON.parse(raw) as unknown);
      if (parsed.baseId && parsed.baseId !== config.airtableBaseId) {
        return new Response("Unauthorized", { status: 401 });
      }
      recordId = parsed.recordId;
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  }

  try {
    const result = recordId ? await app.syncRecord(recordId) : await app.syncActionable();
    if (mac) return new Response(null, { status: 204 });
    return Response.json(result);
  } catch (error) {
    logSync({ action: "webhook", outcome: "error" });
    console.error(error instanceof ApiError || error instanceof SyncError ? error.message : "Sync failed");
    return new Response("Sync failed", { status: 500 });
  }
}
