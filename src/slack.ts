import { failureSlackText, toApiError } from "./errors";

export interface FailureNotice {
  providerName: string;
  action: "create" | "update" | "unpublish" | "headshot check";
  error: string;
}

export function createSlack(webhookUrl: string, fetchImpl: typeof fetch = fetch) {
  return async (notice: FailureNotice): Promise<void> => {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: failureSlackText(notice) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const text = await response.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
      throw toApiError("Slack", response.status, body);
    }
    await response.arrayBuffer().catch(() => undefined);
  };
}
