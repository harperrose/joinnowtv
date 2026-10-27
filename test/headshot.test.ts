import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEADSHOT_EXCEEDS,
  HEADSHOT_MAX_BYTES,
  HEADSHOT_WITHIN,
  headshotLimitForSize,
  lookupAttachmentBytes,
} from "../src/headshot";

describe("headshotLimitForSize", () => {
  it("marks a file larger than 4MB as Exceeds Limit", () => {
    assert.equal(headshotLimitForSize(HEADSHOT_MAX_BYTES + 1), HEADSHOT_EXCEEDS);
  });

  it("marks 4MB and anything smaller as Within Limit", () => {
    assert.equal(headshotLimitForSize(HEADSHOT_MAX_BYTES), HEADSHOT_WITHIN);
    assert.equal(headshotLimitForSize(HEADSHOT_MAX_BYTES - 1), HEADSHOT_WITHIN);
    assert.equal(headshotLimitForSize(0), HEADSHOT_WITHIN);
    assert.equal(headshotLimitForSize(4 * 1000 * 1000), HEADSHOT_WITHIN);
  });

  it("rejects a size that is not a byte count", () => {
    assert.throws(() => headshotLimitForSize(-1), /valid byte count/);
    assert.throws(() => headshotLimitForSize(Number.NaN), /valid byte count/);
    assert.throws(() => headshotLimitForSize(Number.POSITIVE_INFINITY), /valid byte count/);
  });
});

describe("lookupAttachmentBytes", () => {
  it("reads Content-Length from an Airtable attachment host", async () => {
    const bytes = await lookupAttachmentBytes("https://v5.airtableusercontent.com/photo.jpg", async () =>
      new Response(null, { status: 200, headers: { "content-length": "128" } }),
    );
    assert.equal(bytes, 128);
  });

  it("does not fetch other hosts and the error omits the URL", async () => {
    const url = "https://files.example.com/secret-headshot.jpg";
    await assert.rejects(
      lookupAttachmentBytes(url, async () => {
        throw new Error("should not fetch");
      }),
      (error: Error) => {
        assert.equal(error.message, "Headshot size unavailable");
        assert.equal(error.message.includes(url), false);
        assert.equal(error.message.includes("headshot"), false);
        return true;
      },
    );
  });
});
