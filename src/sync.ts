import {
  AIRTABLE_FIELDS,
  WRITEBACK_COLUMNS,
  buildLiveLink,
  toWebflowFieldData,
  type ProviderRecord,
} from "./fields";
import {
  HEADSHOT_WITHIN,
  headshotLimitForSize,
  type HeadshotLimit,
} from "./headshot";
import { slackableError, SyncError } from "./errors";
import { decidePublishAction, successWriteback, type PublishAction } from "./status";
import type { FailureNotice } from "./slack";
import { logSync } from "./log";

export interface SyncDeps {
  airtable: {
    listActionable(): Promise<ProviderRecord[]>;
    getRecord(id: string): Promise<ProviderRecord>;
    updateRecord(id: string, fields: Record<string, string | null>): Promise<void>;
  };
  webflow: {
    createLive(fieldData: Record<string, unknown>): Promise<{ id: string; slug?: string }>;
    updateLive(itemId: string, fieldData: Record<string, unknown>): Promise<{ id: string; slug?: string }>;
    unpublish(itemId: string): Promise<void>;
  };
  slack: (notice: FailureNotice) => Promise<void>;
  now?: () => Date;
  siteUrl?: string;
  resolveHeadshotBytes?: (url: string) => Promise<number>;
}

export interface SyncResult {
  processed: number;
  failed: number;
  skipped: number;
}

export async function syncActionable(deps: SyncDeps): Promise<SyncResult> {
  const records = await deps.airtable.listActionable();
  return syncRecords(records, deps);
}

export async function syncOne(deps: SyncDeps, recordId: string): Promise<SyncResult> {
  const record = await deps.airtable.getRecord(recordId);
  return syncRecords([record], deps);
}

export async function syncRecords(records: ProviderRecord[], deps: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = { processed: 0, failed: 0, skipped: 0 };
  for (const record of records) {
    const outcome = await processRecord(record, deps);
    result[outcome] += 1;
  }
  return result;
}

async function processRecord(
  record: ProviderRecord,
  deps: SyncDeps,
): Promise<"processed" | "failed" | "skipped"> {
  const initial = decidePublishAction({
    status: record.status,
    webflowId: record.webflowId,
    timeUnpublished: record.timeUnpublished,
  });
  if (initial.action === "skip") {
    logSync({ recordId: record.id, action: "skip", outcome: "skipped" });
    return "skipped";
  }

  try {
    await syncHeadshot(record, deps);
  } catch (error) {
    await notify(deps, record, "headshot check", error);
  }

  let current = record;
  if (initial.action === "create") {
    try {
      current = await deps.airtable.getRecord(record.id);
    } catch (error) {
      await notify(deps, record, "create", error);
      logSync({ recordId: record.id, action: "create", outcome: "error" });
      return "failed";
    }
  }

  const decision = decidePublishAction({
    status: current.status ?? record.status,
    webflowId: current.webflowId,
    timeUnpublished: current.timeUnpublished,
  });
  if (decision.action === "skip") {
    logSync({ recordId: record.id, action: "skip", outcome: "skipped" });
    return "skipped";
  }

  const action = decision.action;
  try {
    if ((action === "update" || action === "unpublish") && !current.webflowId?.trim()) {
      throw new SyncError(`Cannot ${action} without a Webflow ID`);
    }

    const publishedAt = (deps.now ?? (() => new Date()))().toISOString();
    if (action === "create") {
      const fieldData = toWebflowFieldData(current, "create");
      const created = await deps.webflow.createLive(fieldData);
      const slug = created.slug ?? readSlug(fieldData);
      try {
        await deps.airtable.updateRecord(
          current.id,
          successWriteback({
            action: "create",
            webflowId: created.id,
            liveLink: buildLiveLink(deps.siteUrl, slug),
            publishedAt,
            columns: WRITEBACK_COLUMNS,
          }),
        );
      } catch (error) {
        throw new SyncError(
          `Webflow item ${created.id} was created, but Airtable writeback failed: ${slackableError(error)}`,
        );
      }
    } else if (action === "update") {
      const fieldData = toWebflowFieldData(current, "update");
      const updated = await deps.webflow.updateLive(current.webflowId!.trim(), fieldData);
      const slug = updated.slug ?? current.explicitSlug?.trim() ?? readSlug(fieldData);
      await deps.airtable.updateRecord(
        current.id,
        successWriteback({
          action: "update",
          liveLink: buildLiveLink(deps.siteUrl, slug),
          publishedAt,
          columns: WRITEBACK_COLUMNS,
        }),
      );
    } else {
      await deps.webflow.unpublish(current.webflowId!.trim());
      await deps.airtable.updateRecord(
        current.id,
        successWriteback({
          action: "unpublish",
          publishedAt,
          columns: WRITEBACK_COLUMNS,
        }),
      );
    }

    logSync({ recordId: current.id, action, outcome: "ok" });
    return "processed";
  } catch (error) {
    await notify(deps, current, action, error);
    logSync({ recordId: current.id, action, outcome: "error" });
    return "failed";
  }
}

async function syncHeadshot(record: ProviderRecord, deps: SyncDeps): Promise<void> {
  const limit = await limitFor(record, deps);
  if (record.headshotLimit === limit) return;
  await deps.airtable.updateRecord(record.id, {
    [AIRTABLE_FIELDS.headshotLimit]: limit,
  });
}

async function limitFor(record: ProviderRecord, deps: SyncDeps): Promise<HeadshotLimit> {
  if (!record.headshot) return HEADSHOT_WITHIN;
  if (typeof record.headshot.size === "number") return headshotLimitForSize(record.headshot.size);
  if (!deps.resolveHeadshotBytes) throw new SyncError("Headshot size unavailable");
  const size = await deps.resolveHeadshotBytes(record.headshot.url);
  return headshotLimitForSize(size);
}

async function notify(
  deps: SyncDeps,
  record: ProviderRecord,
  action: FailureNotice["action"],
  error: unknown,
): Promise<void> {
  try {
    await deps.slack({
      providerName: record.name,
      action,
      error: slackableError(error),
    });
  } catch {
    logSync({ recordId: record.id, action, outcome: "slack-failed" });
  }
}

function readSlug(fieldData: Record<string, unknown>): string | undefined {
  return typeof fieldData.slug === "string" ? fieldData.slug : undefined;
}

export type { PublishAction };
