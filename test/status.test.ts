import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIRTABLE_FIELDS, WRITEBACK_COLUMNS } from "../src/fields";
import {
  STATUS,
  actionableFilterFormula,
  decidePublishAction,
  successWriteback,
} from "../src/status";

const publishedAt = "2026-04-01T12:00:00.000Z";

describe("decidePublishAction", () => {
  it("creates a new item when Ready to publish has no Webflow ID", () => {
    const decision = decidePublishAction({
      status: STATUS.ready,
      webflowId: "  ",
      timeUnpublished: undefined,
    });
    assert.equal(decision.action, "create");
    assert.equal(decision.successStatus, STATUS.isLive);
  });

  it("updates an existing item when Ready to publish already has a Webflow ID", () => {
    const decision = decidePublishAction({
      status: STATUS.ready,
      webflowId: "wf-existing",
      timeUnpublished: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(decision.action, "update");
    assert.equal(decision.successStatus, STATUS.updatedLive);
  });

  it("treats Is Live as terminal", () => {
    const decision = decidePublishAction({
      status: STATUS.isLive,
      webflowId: "wf-existing",
      timeUnpublished: undefined,
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.successStatus, undefined);
  });

  it("treats Updated + Live as terminal and not a trigger", () => {
    const decision = decidePublishAction({
      status: STATUS.updatedLive,
      webflowId: "wf-existing",
      timeUnpublished: undefined,
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.successStatus, undefined);
  });

  it("unpublishes Archive when time unpublished is blank", () => {
    const decision = decidePublishAction({
      status: STATUS.archive,
      webflowId: "wf-existing",
      timeUnpublished: "   ",
    });
    assert.equal(decision.action, "unpublish");
    assert.equal(decision.successStatus, undefined);
  });

  it("skips Archive after time unpublished was stamped", () => {
    const decision = decidePublishAction({
      status: STATUS.archive,
      webflowId: "wf-existing",
      timeUnpublished: publishedAt,
    });
    assert.equal(decision.action, "skip");
  });

  it("skips any other status", () => {
    const decision = decidePublishAction({
      status: "Draft",
      webflowId: undefined,
      timeUnpublished: undefined,
    });
    assert.equal(decision.action, "skip");
  });
});

describe("successWriteback", () => {
  it("writes Is Live, Webflow ID, live link, and time published after create", () => {
    const fields = successWriteback({
      action: "create",
      webflowId: "wf-new",
      liveLink: "https://example.com/providers/lazzuly-mello",
      publishedAt,
      columns: WRITEBACK_COLUMNS,
    });
    assert.deepEqual(fields, {
      [AIRTABLE_FIELDS.status]: STATUS.isLive,
      [AIRTABLE_FIELDS.webflowId]: "wf-new",
      [AIRTABLE_FIELDS.liveLink]: "https://example.com/providers/lazzuly-mello",
      [AIRTABLE_FIELDS.lastPublished]: publishedAt,
      [AIRTABLE_FIELDS.timeUnpublished]: null,
    });
  });

  it("sets Updated + Live on republish and does not write a new Webflow ID", () => {
    const fields = successWriteback({
      action: "update",
      webflowId: "wf-existing",
      liveLink: "https://example.com/providers/lazzuly-mello",
      publishedAt,
      columns: WRITEBACK_COLUMNS,
    });
    assert.deepEqual(fields, {
      [AIRTABLE_FIELDS.status]: STATUS.updatedLive,
      [AIRTABLE_FIELDS.timeUnpublished]: null,
    });
    assert.equal(Object.hasOwn(fields, AIRTABLE_FIELDS.webflowId), false);
    assert.equal(Object.hasOwn(fields, AIRTABLE_FIELDS.liveLink), false);
    assert.equal(Object.hasOwn(fields, AIRTABLE_FIELDS.lastPublished), false);
  });

  it("stamps time unpublished and leaves Status untouched", () => {
    const fields = successWriteback({
      action: "unpublish",
      publishedAt,
      columns: WRITEBACK_COLUMNS,
    });
    assert.deepEqual(fields, {
      [AIRTABLE_FIELDS.timeUnpublished]: publishedAt,
    });
    assert.equal(Object.hasOwn(fields, AIRTABLE_FIELDS.status), false);
  });

  it("refuses a create writeback without a Webflow ID", () => {
    assert.throws(
      () => successWriteback({ action: "create", publishedAt, columns: WRITEBACK_COLUMNS }),
      /missing item id/,
    );
  });
});

describe("actionableFilterFormula", () => {
  it("polls Ready to publish and unstamped Archive only", () => {
    const formula = actionableFilterFormula({
      status: AIRTABLE_FIELDS.status,
      timeUnpublished: AIRTABLE_FIELDS.timeUnpublished,
    });
    assert.match(formula, /Ready to publish/);
    assert.match(formula, /Archive/);
    assert.match(formula, /Time unpublished/);
    assert.equal(formula.includes(STATUS.updatedLive), false);
    assert.equal(formula.includes(STATUS.isLive), false);
  });
});
