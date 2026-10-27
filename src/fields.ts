/**
 * Airtable column names and Webflow CMS slugs.
 *
 * Change these if the base or collection uses different names.
 * Other Airtable columns are not read and not written.
 *
 * Webflow slugs follow the API field slug, not the label in the designer:
 * "Focus Area String" → focus-area-string
 * "Population String" → population-string
 * "Provider name with comma" → provider-name-with-comma
 */

export const AIRTABLE_FIELDS = {
  name: "Name",
  slug: "Slug",
  credential: "Credential",
  pronouns: "Pronouns",
  bio: "Bio",
  headshot: "Headshot",
  focusAreas: "Clinical focus areas",
  populations: "Allowed populations",
  status: "Status",
  webflowId: "Webflow ID",
  liveLink: "Live link",
  lastPublished: "Last time published",
  timeUnpublished: "Time unpublished",
  headshotLimit: "Headshot limit",
} as const;

export const WEBFLOW_FIELDS = {
  name: "name",
  slug: "slug",
  credential: "credential",
  pronouns: "pronouns",
  bio: "bio",
  headshot: "headshot",
  focusArea: "focus-area-string",
  population: "population-string",
  providerNameWithComma: "provider-name-with-comma",
} as const;

export const WRITEBACK_COLUMNS = {
  status: AIRTABLE_FIELDS.status,
  webflowId: AIRTABLE_FIELDS.webflowId,
  liveLink: AIRTABLE_FIELDS.liveLink,
  lastPublished: AIRTABLE_FIELDS.lastPublished,
  timeUnpublished: AIRTABLE_FIELDS.timeUnpublished,
} as const;

export interface HeadshotFile {
  url: string;
  size?: number;
}

export interface ProviderRecord {
  id: string;
  name: string;
  status?: string;
  webflowId?: string;
  explicitSlug?: string;
  credential: string;
  pronouns: string;
  bio: string;
  headshot?: HeadshotFile;
  focus: string;
  population: string;
  headshotLimit?: string;
  timeUnpublished?: string;
}

export function slugFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 256) || "provider";
}

/** "Lazzuly Mello" → "Lazzuly Mello,". A name that already ends with a comma stays as-is. */
export function providerNameWithComma(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith(",") ? trimmed : `${trimmed},`;
}

/**
 * Webflow rich text is HTML. Plain Airtable text becomes paragraphs.
 * A value that already contains tags is sent through unchanged.
 */
export function bioToWebflowRichText(bio: string): string {
  const trimmed = bio.trim();
  if (!trimmed) return "";
  if (/<\/?[a-z][^>]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildLiveLink(siteUrl: string | undefined, slug: string | undefined): string | undefined {
  const base = siteUrl?.trim().replace(/\/+$/, "");
  const itemSlug = slug?.trim();
  if (!base || !itemSlug) return undefined;
  return `${base}/${itemSlug}`;
}

export function toWebflowFieldData(
  record: ProviderRecord,
  mode: "create" | "update",
): Record<string, unknown> {
  const name = record.name.trim();
  if (!name) {
    throw new Error("Name is required");
  }

  const fieldData: Record<string, unknown> = {
    [WEBFLOW_FIELDS.name]: name,
    [WEBFLOW_FIELDS.providerNameWithComma]: providerNameWithComma(name),
    [WEBFLOW_FIELDS.credential]: record.credential,
    [WEBFLOW_FIELDS.pronouns]: record.pronouns,
    [WEBFLOW_FIELDS.bio]: bioToWebflowRichText(record.bio),
    [WEBFLOW_FIELDS.focusArea]: record.focus,
    [WEBFLOW_FIELDS.population]: record.population,
  };

  const explicitSlug = record.explicitSlug?.trim();
  if (explicitSlug) {
    fieldData[WEBFLOW_FIELDS.slug] = explicitSlug;
  } else if (mode === "create") {
    fieldData[WEBFLOW_FIELDS.slug] = slugFromName(name);
  }

  if (record.headshot?.url) {
    fieldData[WEBFLOW_FIELDS.headshot] = {
      url: record.headshot.url,
      alt: name,
    };
  }

  return fieldData;
}

export function parseProviderRecord(raw: { id?: unknown; fields?: unknown }): ProviderRecord {
  const id = typeof raw.id === "string" ? raw.id : "";
  const fields = raw.fields && typeof raw.fields === "object" ? (raw.fields as Record<string, unknown>) : {};
  const status = asOptionalString(fields[AIRTABLE_FIELDS.status]);
  const webflowId = asOptionalString(fields[AIRTABLE_FIELDS.webflowId]);
  const explicitSlug = asOptionalString(fields[AIRTABLE_FIELDS.slug]);
  const headshotLimit = asOptionalString(fields[AIRTABLE_FIELDS.headshotLimit]);
  const timeUnpublished = asOptionalString(fields[AIRTABLE_FIELDS.timeUnpublished]);

  return {
    id,
    name: asText(fields[AIRTABLE_FIELDS.name]),
    status,
    webflowId,
    explicitSlug,
    credential: asText(fields[AIRTABLE_FIELDS.credential]),
    pronouns: asText(fields[AIRTABLE_FIELDS.pronouns]),
    bio: asText(fields[AIRTABLE_FIELDS.bio]),
    headshot: readHeadshot(fields[AIRTABLE_FIELDS.headshot]),
    focus: asText(fields[AIRTABLE_FIELDS.focusAreas]),
    population: asText(fields[AIRTABLE_FIELDS.populations]),
    headshotLimit,
    timeUnpublished,
  };
}

export const AIRTABLE_READ_FIELDS = [
  AIRTABLE_FIELDS.name,
  AIRTABLE_FIELDS.slug,
  AIRTABLE_FIELDS.credential,
  AIRTABLE_FIELDS.pronouns,
  AIRTABLE_FIELDS.bio,
  AIRTABLE_FIELDS.headshot,
  AIRTABLE_FIELDS.focusAreas,
  AIRTABLE_FIELDS.populations,
  AIRTABLE_FIELDS.status,
  AIRTABLE_FIELDS.webflowId,
  AIRTABLE_FIELDS.liveLink,
  AIRTABLE_FIELDS.lastPublished,
  AIRTABLE_FIELDS.timeUnpublished,
  AIRTABLE_FIELDS.headshotLimit,
] as const;

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(", ");
  }
  return "";
}

function readHeadshot(value: unknown): HeadshotFile | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const first = value[0];
  if (!first || typeof first !== "object") return undefined;
  const record = first as { url?: unknown; size?: unknown };
  if (typeof record.url !== "string" || !record.url.trim()) return undefined;
  const size = typeof record.size === "number" && Number.isFinite(record.size) ? record.size : undefined;
  return { url: record.url, size };
}
