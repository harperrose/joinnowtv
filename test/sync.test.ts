import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIRTABLE_FIELDS, type ProviderRecord } from "../src/fields";
import { HEADSHOT_EXCEEDS, HEADSHOT_MAX_BYTES, HEADSHOT_WITHIN } from "../src/headshot";
import { failureSlackText } from "../src/errors";
import { STATUS } from "../src/status";
import { syncRecords, type SyncDeps } from "../src/sync";
import type { FailureNotice } from "../src/slack";

const BIO = "BIO_SENTINEL_do_not_leak";
const PHOTO = "https://v5.airtableusercontent.com/headshot-secret.jpg";

function provider(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    id: "recAAAAAAAAAAAAAA",
    name: "Lazzuly Mello",
    status: STATUS.ready,
    credential: "LMFT",
    pronouns: "she/her",
    bio: BIO,
    focus: "Anxiety",
    population: "Adults",
    headshotLimit: HEADSHOT_WITHIN,
    ...overrides,
  };
}

function harness(options?: {
  record?: ProviderRecord;
  getRecord?: ProviderRecord;
  failCreate?: boolean;
  failWriteback?: boolean;
  failHeadshotWrite?: boolean;
  resolveHeadshotBytes?: (url: string) => Promise<number>;
}) {
  const updates: { id: string; fields: Record<string, string | null> }[] = [];
  const created: Record<string, unknown>[] = [];
  const updated: { id: string; fieldData: Record<string, unknown> }[] = [];
  const unpublished: string[] = [];
  const slacks: FailureNotice[] = [];
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };

  const deps: SyncDeps = {
    airtable: {
      async listActionable() {
        return [];
      },
      async getRecord() {
        return structuredClone(options?.getRecord ?? options?.record ?? provider());
      },
      async updateRecord(id, fields) {
        if (options?.failHeadshotWrite && fields[AIRTABLE_FIELDS.headshotLimit]) {
          throw new Error("headshot write failed");
        }
        if (options?.failWriteback && fields[AIRTABLE_FIELDS.status]) {
          throw new Error("airtable down");
        }
        updates.push({ id, fields });
      },
    },
    webflow: {
      async createLive(fieldData) {
        if (options?.failCreate) throw new Error(`Webflow HTTP 400: validation_error <p>${BIO}</p>`);
        created.push(fieldData);
        return { id: "wf-new", slug: String(fieldData.slug) };
      },
      async updateLive(id, fieldData) {
        updated.push({ id, fieldData });
        return { id, slug: "existing-slug" };
      },
      async unpublish(id) {
        unpublished.push(id);
      },
    },
    slack: async (notice) => {
      slacks.push(notice);
    },
    now: () => new Date("2026-04-01T12:00:00.000Z"),
    siteUrl: "https://example.com/providers",
    resolveHeadshotBytes: options?.resolveHeadshotBytes,
  };

  return {
    deps,
    updates,
    created,
    updated,
    unpublished,
    slacks,
    logs,
    restore() {
      console.log = originalLog;
    },
  };
}

function statusWrites(updates: { fields: Record<string, string | null> }[]) {
  return updates.filter((update) => AIRTABLE_FIELDS.status in update.fields);
}

describe("sync status machine", () => {
  it("creates and publishes a new Ready to publish row", async () => {
    const record = provider();
    const ctx = harness({ record });
    try {
      const result = await syncRecords([record], ctx.deps);
      assert.deepEqual(result, { processed: 1, failed: 0, skipped: 0 });
      assert.equal(ctx.created.length, 1);
      assert.equal(ctx.updated.length, 0);
      assert.equal(ctx.created[0].slug, "lazzuly-mello");
      assert.deepEqual(statusWrites(ctx.updates), [
        {
          id: record.id,
          fields: {
            [AIRTABLE_FIELDS.status]: STATUS.isLive,
            [AIRTABLE_FIELDS.webflowId]: "wf-new",
            [AIRTABLE_FIELDS.liveLink]: "https://example.com/providers/lazzuly-mello",
            [AIRTABLE_FIELDS.lastPublished]: "2026-04-01T12:00:00.000Z",
            [AIRTABLE_FIELDS.timeUnpublished]: null,
          },
        },
      ]);
      assert.equal(ctx.logs.join("\n").includes(BIO), false);
      assert.equal(ctx.slacks.length, 0);
    } finally {
      ctx.restore();
    }
  });

  it("updates the existing live item when a Webflow ID is already present", async () => {
    const record = provider({ webflowId: "wf-existing" });
    const ctx = harness({ record });
    try {
      await syncRecords([record], ctx.deps);
      assert.equal(ctx.created.length, 0);
      assert.deepEqual(ctx.updated.map((item) => item.id), ["wf-existing"]);
      assert.equal(Object.hasOwn(ctx.updated[0].fieldData, "slug"), false);
      assert.deepEqual(statusWrites(ctx.updates)[0].fields, {
        [AIRTABLE_FIELDS.status]: STATUS.updatedLive,
        [AIRTABLE_FIELDS.timeUnpublished]: null,
      });
    } finally {
      ctx.restore();
    }
  });

  it("uses an id that appears before create and does not make a second item", async () => {
    const record = provider();
    const ctx = harness({ record, getRecord: provider({ webflowId: "wf-existing" }) });
    try {
      await syncRecords([record], ctx.deps);
      assert.equal(ctx.created.length, 0);
      assert.equal(ctx.updated[0].id, "wf-existing");
      assert.equal(statusWrites(ctx.updates)[0].fields[AIRTABLE_FIELDS.status], STATUS.updatedLive);
    } finally {
      ctx.restore();
    }
  });

  it("does not publish Is Live or Updated + Live", async () => {
    const ctx = harness();
    try {
      const result = await syncRecords(
        [
          provider({ status: STATUS.isLive, webflowId: "wf-a" }),
          provider({ id: "recBBBBBBBBBBBBBB", status: STATUS.updatedLive, webflowId: "wf-b" }),
        ],
        ctx.deps,
      );
      assert.deepEqual(result, { processed: 0, failed: 0, skipped: 2 });
      assert.equal(ctx.created.length + ctx.updated.length + ctx.unpublished.length, 0);
      assert.equal(ctx.updates.length, 0);
    } finally {
      ctx.restore();
    }
  });

  it("unpublishes Archive and leaves Status as Archive", async () => {
    const record = provider({ status: STATUS.archive, webflowId: "wf-existing", headshotLimit: HEADSHOT_WITHIN });
    const ctx = harness({ record });
    try {
      await syncRecords([record], ctx.deps);
      assert.deepEqual(ctx.unpublished, ["wf-existing"]);
      assert.deepEqual(ctx.updates, [
        {
          id: record.id,
          fields: { [AIRTABLE_FIELDS.timeUnpublished]: "2026-04-01T12:00:00.000Z" },
        },
      ]);
    } finally {
      ctx.restore();
    }
  });

  it("does not unpublish Archive again after time unpublished is set", async () => {
    const ctx = harness();
    try {
      const result = await syncRecords(
        [provider({ status: STATUS.archive, webflowId: "wf-existing", timeUnpublished: "2026-01-01T00:00:00.000Z" })],
        ctx.deps,
      );
      assert.equal(result.skipped, 1);
      assert.equal(ctx.unpublished.length, 0);
    } finally {
      ctx.restore();
    }
  });

  it("leaves Status unchanged and slacks name, action, and error when publish fails", async () => {
    const record = provider();
    const ctx = harness({ record, failCreate: true });
    try {
      const result = await syncRecords([record], ctx.deps);
      assert.equal(result.failed, 1);
      assert.equal(statusWrites(ctx.updates).length, 0);
      assert.equal(ctx.slacks.length, 1);
      assert.equal(ctx.slacks[0].providerName, "Lazzuly Mello");
      assert.equal(ctx.slacks[0].action, "create");
      assert.equal(ctx.slacks[0].error.includes(BIO), false);
      assert.equal(ctx.slacks[0].error.includes("<"), false);
      const text = failureSlackText(ctx.slacks[0]);
      assert.match(text, /Provider: Lazzuly Mello/);
      assert.match(text, /Action: create/);
      assert.equal(text.includes(BIO), false);
      assert.equal(text.includes(PHOTO), false);
    } finally {
      ctx.restore();
    }
  });

  it("includes the new Webflow ID when create succeeded and writeback failed", async () => {
    const ctx = harness({ record: provider(), failWriteback: true });
    try {
      await syncRecords([provider()], ctx.deps);
      assert.match(ctx.slacks[0].error, /wf-new/);
      assert.equal(ctx.slacks[0].error.includes(BIO), false);
      assert.equal(statusWrites(ctx.updates).length, 0);
    } finally {
      ctx.restore();
    }
  });

  it("slacks unpublish when Archive has no Webflow ID and does not change Status", async () => {
    const ctx = harness();
    try {
      await syncRecords([provider({ status: STATUS.archive })], ctx.deps);
      assert.equal(ctx.unpublished.length, 0);
      assert.equal(ctx.slacks[0].action, "unpublish");
      assert.match(ctx.slacks[0].error, /Webflow ID/);
      assert.equal(statusWrites(ctx.updates).length, 0);
    } finally {
      ctx.restore();
    }
  });
});

describe("headshot during sync", () => {
  it("sets Exceeds Limit and still creates the CMS item", async () => {
    const record = provider({
      headshot: { url: PHOTO, size: HEADSHOT_MAX_BYTES + 1 },
      headshotLimit: undefined,
    });
    const ctx = harness({ record });
    try {
      const result = await syncRecords([record], ctx.deps);
      assert.equal(result.processed, 1);
      assert.equal(ctx.created.length, 1);
      assert.equal(ctx.slacks.length, 0);
      assert.deepEqual(ctx.updates[0].fields, {
        [AIRTABLE_FIELDS.headshotLimit]: HEADSHOT_EXCEEDS,
      });
      assert.equal(statusWrites(ctx.updates)[0].fields[AIRTABLE_FIELDS.status], STATUS.isLive);
      assert.equal(JSON.stringify(ctx.slacks).includes(PHOTO), false);
      assert.equal(ctx.logs.join("\n").includes(PHOTO), false);
    } finally {
      ctx.restore();
    }
  });

  it("sets Within Limit for a file at 4MB and still publishes", async () => {
    const record = provider({
      headshot: { url: PHOTO, size: HEADSHOT_MAX_BYTES },
      headshotLimit: undefined,
    });
    const ctx = harness({ record });
    try {
      await syncRecords([record], ctx.deps);
      assert.equal(ctx.updates[0].fields[AIRTABLE_FIELDS.headshotLimit], HEADSHOT_WITHIN);
      assert.equal(ctx.created.length, 1);
    } finally {
      ctx.restore();
    }
  });

  it("does not block publish when the headshot check fails", async () => {
    const record = provider({
      headshot: { url: PHOTO },
      headshotLimit: undefined,
    });
    const ctx = harness({
      record,
      failHeadshotWrite: true,
      resolveHeadshotBytes: async () => 10,
    });
    try {
      const result = await syncRecords([record], ctx.deps);
      assert.equal(result.processed, 1);
      assert.equal(ctx.created.length, 1);
      assert.equal(ctx.slacks[0].action, "headshot check");
      assert.equal(ctx.slacks[0].error.includes(PHOTO), false);
      assert.equal(ctx.slacks[0].error.includes(BIO), false);
      assert.equal(statusWrites(ctx.updates)[0].fields[AIRTABLE_FIELDS.status], STATUS.isLive);
    } finally {
      ctx.restore();
    }
  });
});
