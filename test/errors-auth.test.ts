import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyAirtableMac, verifyBearer, verifyWebhookRequest } from "../src/auth";
import { loadConfig } from "../src/config";
import { failureSlackText, publicApiError, slackableError, SyncError } from "../src/errors";

const SECRET_VALUE = "super-secret-value";

describe("public API errors", () => {
  it("keeps code and message and drops echoed profile details and URLs", () => {
    const message = publicApiError(400, {
      code: "validation_error",
      message: "Invalid image https://v5.airtableusercontent.com/secret-headshot.jpg",
      details: [{ bio: "BIO_SENTINEL", headshot: "https://cdn.example/secret.jpg" }],
    });
    assert.match(message, /validation_error/);
    assert.match(message, /Invalid image \[url\]/);
    assert.equal(message.includes("BIO_SENTINEL"), false);
    assert.equal(message.includes("airtableusercontent"), false);
    assert.equal(message.includes("secret-headshot"), false);
  });

  it("formats Slack text with name, action, and error only", () => {
    const text = failureSlackText({
      providerName: "Lazzuly Mello",
      action: "update",
      error: "Webflow HTTP 400: validation_error",
    });
    assert.equal(
      text,
      ["Provider sync failed", "Provider: Lazzuly Mello", "Action: update", "Error: Webflow HTTP 400: validation_error"].join("\n"),
    );
  });

  it("hides HTML fragments in unexpected errors", () => {
    assert.equal(slackableError(new Error(`<p>BIO_SENTINEL</p>`)), "Unexpected sync error");
    assert.equal(slackableError(new SyncError("Cannot update without a Webflow ID")), "Cannot update without a Webflow ID");
  });
});

describe("webhook auth", () => {
  it("accepts an Airtable MAC over the raw body", () => {
    const body = JSON.stringify({ base: { id: "appBase" }, webhook: { id: "ach" }, timestamp: "t" });
    const secret = Buffer.from("mac-key").toString("base64");
    const header = `hmac-sha256=${createHmac("sha256", Buffer.from(secret, "base64")).update(body, "utf8").digest("hex")}`;
    assert.equal(verifyAirtableMac(body, header, secret), true);
    assert.equal(verifyAirtableMac(`${body} `, header, secret), false);
    assert.equal(verifyWebhookRequest(new Headers({ "x-airtable-content-mac": header }), body, secret), true);
  });

  it("accepts a bearer token or X-Webhook-Secret", () => {
    assert.equal(verifyBearer("Bearer shared-secret", "shared-secret"), true);
    assert.equal(verifyBearer("Bearer wrong", "shared-secret"), false);
    const headers = new Headers({ "x-webhook-secret": "shared-secret" });
    assert.equal(verifyWebhookRequest(headers, "", "shared-secret"), true);
    assert.equal(verifyWebhookRequest(new Headers(), "", "shared-secret"), false);
  });
});

describe("loadConfig", () => {
  const valid = {
    AIRTABLE_TOKEN: "pat",
    AIRTABLE_BASE_ID: "app",
    AIRTABLE_TABLE_ID: "tbl",
    WEBFLOW_TOKEN: "wf",
    WEBFLOW_COLLECTION_ID: "col",
    SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/SECRET",
    WEBHOOK_SECRET: "hook",
    CRON_SECRET: "cron",
  };

  it("names missing variables and does not echo secret values", () => {
    const env = { ...valid, AIRTABLE_TOKEN: "  " };
    assert.throws(
      () => loadConfig(env),
      (error: Error) => {
        assert.match(error.message, /AIRTABLE_TOKEN/);
        assert.equal(error.message.includes("SECRET"), false);
        assert.equal(error.message.includes(SECRET_VALUE), false);
        return true;
      },
    );
  });

  it("requires https for the Slack webhook", () => {
    assert.throws(() => loadConfig({ ...valid, SLACK_WEBHOOK_URL: "http://hooks.slack.com/services/x" }), /https/);
  });

  it("returns the optional site URL when it is https", () => {
    const config = loadConfig({ ...valid, WEBFLOW_SITE_URL: "https://example.com/providers/" });
    assert.equal(config.siteUrl, "https://example.com/providers/");
    assert.equal(config.slackWebhookUrl, valid.SLACK_WEBHOOK_URL);
  });
});
