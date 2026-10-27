/** Slack and logs get a short API message. Request bodies and `details` are dropped. */

export function redactUrls(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, "[url]");
}

export function publicApiError(status: number, body: unknown): string {
  let code = "";
  let message = "";
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.code === "string") code = obj.code;
    if (typeof obj.message === "string") message = obj.message;
    const nested = obj.error;
    if (nested && typeof nested === "object") {
      const err = nested as Record<string, unknown>;
      if (typeof err.type === "string") code = err.type;
      if (typeof err.message === "string") message = err.message;
    }
  }

  const combined = [code, message].filter(Boolean).join(": ");
  const redacted = redactUrls(combined).replace(/\s+/g, " ").trim().slice(0, 240);
  return redacted || `HTTP ${status}`;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(service: "Airtable" | "Webflow" | "Slack", status: number, detail: string) {
    super(`${service} HTTP ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

export function toApiError(
  service: "Airtable" | "Webflow" | "Slack",
  status: number,
  body: unknown,
): ApiError {
  return new ApiError(service, status, publicApiError(status, body));
}

/** Failure text safe to put in Slack. URLs and HTML fragments are removed. */
export function slackableError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected sync error";
  const redacted = redactUrls(message).replace(/\s+/g, " ").trim().slice(0, 300);
  if (!redacted || redacted.includes("<")) return "Unexpected sync error";
  return redacted;
}

export function failureSlackText(input: {
  providerName: string;
  action: string;
  error: string;
}): string {
  const name = input.providerName.trim().slice(0, 200) || "Unknown";
  const error = redactUrls(input.error).replace(/\s+/g, " ").trim().slice(0, 300) || "Unexpected sync error";
  return [`Provider sync failed`, `Provider: ${name}`, `Action: ${input.action}`, `Error: ${error}`].join("\n");
}
