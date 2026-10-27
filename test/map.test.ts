import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bioToWebflowRichText,
  buildLiveLink,
  parseProviderRecord,
  providerNameWithComma,
  slugFromName,
  toWebflowFieldData,
  type ProviderRecord,
} from "../src/fields";
import { airtableCollectionUrl } from "../src/airtable";
import { readWebflowItem, webflowLiveUrls } from "../src/webflow";
import { readWebhookBody } from "../src/webhook-body";

function provider(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    id: "recAAAAAAAAAAAAAA",
    name: "Lazzuly Mello",
    status: "Ready to publish",
    credential: "LMFT",
    pronouns: "she/her",
    bio: "First paragraph.\n\nSecond line",
    focus: "Anxiety, OCD",
    population: "Adults",
    ...overrides,
  };
}

describe("provider field mapping", () => {
  it("builds a kebab-case slug and a trailing comma from the name", () => {
    assert.equal(slugFromName("Lazzuly Mello"), "lazzuly-mello");
    assert.equal(slugFromName("José O'Brien"), "jose-o-brien");
    assert.equal(providerNameWithComma("Lazzuly Mello"), "Lazzuly Mello,");
    assert.equal(providerNameWithComma("Lazzuly Mello,"), "Lazzuly Mello,");
  });

  it("sends plain bio as HTML paragraphs and leaves HTML bio alone", () => {
    assert.equal(bioToWebflowRichText("A & B\n\nC"), "<p>A &amp; B</p><p>C</p>");
    assert.equal(bioToWebflowRichText("<p>Already html</p>"), "<p>Already html</p>");
  });

  it("sets a slug on create and leaves an existing slug alone on update", () => {
    const created = toWebflowFieldData(provider(), "create");
    assert.equal(created.slug, "lazzuly-mello");
    assert.equal(created["provider-name-with-comma"], "Lazzuly Mello,");
    assert.equal(created["focus-area-string"], "Anxiety, OCD");
    assert.equal(created["population-string"], "Adults");

    const updated = toWebflowFieldData(provider(), "update");
    assert.equal(Object.hasOwn(updated, "slug"), false);

    const explicit = toWebflowFieldData(provider({ explicitSlug: "custom-slug" }), "update");
    assert.equal(explicit.slug, "custom-slug");
  });

  it("omits a missing headshot and includes the first attachment URL", () => {
    const without = toWebflowFieldData(provider(), "update");
    assert.equal(Object.hasOwn(without, "headshot"), false);

    const withPhoto = toWebflowFieldData(
      provider({ headshot: { url: "https://v5.airtableusercontent.com/a.jpg", size: 10 } }),
      "create",
    );
    assert.deepEqual(withPhoto.headshot, {
      url: "https://v5.airtableusercontent.com/a.jpg",
      alt: "Lazzuly Mello",
    });
  });

  it("reads mapped columns and drops every other Airtable field", () => {
    const sentinel = "PRIVATE_COLUMN_SENTINEL";
    const record = parseProviderRecord({
      id: "recAAAAAAAAAAAAAA",
      fields: {
        Name: "Lazzuly Mello",
        Status: "Ready to publish",
        "Clinical focus areas": ["Anxiety", "OCD"],
        "Allowed populations": "Adults",
        Headshot: [
          { url: "https://v5.airtableusercontent.com/first.jpg", size: 20 },
          { url: "https://v5.airtableusercontent.com/second.jpg", size: 9 },
        ],
        Notes: sentinel,
        Bio: sentinel,
      },
    });
    assert.equal(record.focus, "Anxiety, OCD");
    assert.equal(record.headshot?.url, "https://v5.airtableusercontent.com/first.jpg");
    assert.equal(JSON.stringify(record).includes("second.jpg"), false);
    assert.equal(JSON.stringify(record).includes("Notes"), false);
    assert.equal("notes" in record, false);
  });
});

describe("live link and API paths", () => {
  it("joins the optional site URL with the item slug", () => {
    assert.equal(
      buildLiveLink("https://example.com/providers/", "lazzuly-mello"),
      "https://example.com/providers/lazzuly-mello",
    );
    assert.equal(buildLiveLink(undefined, "lazzuly-mello"), undefined);
  });

  it("uses the documented Airtable and Webflow Data API v2 paths", () => {
    assert.equal(
      airtableCollectionUrl("appBase", "tblTable", "recAAAAAAAAAAAAAA"),
      "https://api.airtable.com/v0/appBase/tblTable/recAAAAAAAAAAAAAA",
    );
    const urls = webflowLiveUrls("col123", "item456");
    assert.equal(urls.createLive, "https://api.webflow.com/v2/collections/col123/items/live?skipInvalidFiles=true");
    assert.equal(
      urls.updateLive,
      "https://api.webflow.com/v2/collections/col123/items/item456/live?skipInvalidFiles=true",
    );
    assert.equal(urls.unpublishLive, "https://api.webflow.com/v2/collections/col123/items/live");
  });

  it("keeps only the Webflow item id and slug", () => {
    const item = readWebflowItem({
      id: "item456",
      fieldData: { slug: "lazzuly-mello", bio: "BIO_SENTINEL" },
    });
    assert.deepEqual(item, { id: "item456", slug: "lazzuly-mello" });
    assert.equal(JSON.stringify(item).includes("BIO_SENTINEL"), false);
  });
});

describe("readWebhookBody", () => {
  it("reads a record id and ignores profile fields", () => {
    const parsed = readWebhookBody({
      recordId: "recAAAAAAAAAAAAAA",
      fields: { Bio: "BIO_SENTINEL", Headshot: "https://files.example/secret.jpg" },
    });
    assert.deepEqual(parsed, { recordId: "recAAAAAAAAAAAAAA", baseId: undefined });
    assert.equal(JSON.stringify(parsed).includes("BIO_SENTINEL"), false);
  });

  it("reads a native Airtable ping", () => {
    assert.deepEqual(
      readWebhookBody({
        base: { id: "appBase" },
        webhook: { id: "achHook" },
        timestamp: "2026-04-01T12:00:00.000Z",
      }),
      { recordId: undefined, baseId: "appBase" },
    );
  });
});
