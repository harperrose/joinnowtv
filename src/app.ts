import { createAirtable } from "./airtable";
import { createWebflow } from "./webflow";
import { createSlack } from "./slack";
import { lookupAttachmentBytes } from "./headshot";
import { syncActionable, syncOne, type SyncResult } from "./sync";
import type { AppConfig } from "./config";

export interface App {
  syncActionable(): Promise<SyncResult>;
  syncRecord(recordId: string): Promise<SyncResult>;
}

export function createApp(config: AppConfig, fetchImpl: typeof fetch = fetch): App {
  const deps = {
    airtable: createAirtable(config, fetchImpl),
    webflow: createWebflow(config, fetchImpl),
    slack: createSlack(config.slackWebhookUrl, fetchImpl),
    siteUrl: config.siteUrl,
    resolveHeadshotBytes: (url: string) => lookupAttachmentBytes(url, fetchImpl),
  };
  return {
    syncActionable: () => syncActionable(deps),
    syncRecord: (recordId: string) => syncOne(deps, recordId),
  };
}
