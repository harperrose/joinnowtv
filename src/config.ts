export interface AppConfig {
  airtableToken: string;
  airtableBaseId: string;
  airtableTableId: string;
  webflowToken: string;
  webflowCollectionId: string;
  slackWebhookUrl: string;
  webhookSecret: string;
  cronSecret: string;
  siteUrl?: string;
}

const REQUIRED = [
  "AIRTABLE_TOKEN",
  "AIRTABLE_BASE_ID",
  "AIRTABLE_TABLE_ID",
  "WEBFLOW_TOKEN",
  "WEBFLOW_COLLECTION_ID",
  "SLACK_WEBHOOK_URL",
  "WEBHOOK_SECRET",
  "CRON_SECRET",
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  const slackWebhookUrl = env.SLACK_WEBHOOK_URL!.trim();
  let slackUrl: URL;
  try {
    slackUrl = new URL(slackWebhookUrl);
  } catch {
    throw new Error("SLACK_WEBHOOK_URL must be an https URL");
  }
  if (slackUrl.protocol !== "https:") {
    throw new Error("SLACK_WEBHOOK_URL must be an https URL");
  }

  const siteUrl = env.WEBFLOW_SITE_URL?.trim();
  if (siteUrl) {
    let parsed: URL;
    try {
      parsed = new URL(siteUrl);
    } catch {
      throw new Error("WEBFLOW_SITE_URL must be an https URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("WEBFLOW_SITE_URL must be an https URL");
    }
  }

  return {
    airtableToken: env.AIRTABLE_TOKEN!.trim(),
    airtableBaseId: env.AIRTABLE_BASE_ID!.trim(),
    airtableTableId: env.AIRTABLE_TABLE_ID!.trim(),
    webflowToken: env.WEBFLOW_TOKEN!.trim(),
    webflowCollectionId: env.WEBFLOW_COLLECTION_ID!.trim(),
    slackWebhookUrl,
    webhookSecret: env.WEBHOOK_SECRET!.trim(),
    cronSecret: env.CRON_SECRET!.trim(),
    siteUrl: siteUrl || undefined,
  };
}
