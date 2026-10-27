import { verifyBearer } from "../src/auth";
import { loadConfig } from "../src/config";
import { createApp } from "../src/app";
import { ApiError, SyncError } from "../src/errors";
import { logSync } from "../src/log";

export const maxDuration = 60;

const config = loadConfig();
const app = createApp(config);

/** Vercel Cron calls GET /api/cron with Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request): Promise<Response> {
  if (!verifyBearer(request.headers.get("authorization"), config.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await app.syncActionable();
    return Response.json(result);
  } catch (error) {
    logSync({ action: "cron", outcome: "error" });
    console.error(error instanceof ApiError || error instanceof SyncError ? error.message : "Sync failed");
    return new Response("Sync failed", { status: 500 });
  }
}
