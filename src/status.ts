/**
 * Provider publish status machine.
 *
 * Airtable Status is a single select. The sync publishes Ready to publish
 * and unpublishes Archive. Is Live and Updated + Live are results, not triggers.
 *
 * - "Ready to publish" with an empty Webflow ID
 *   New item. Create a Webflow CMS item and publish it.
 *   On success: Status → "Is Live", and write Webflow ID, live link,
 *   and last time published.
 *
 * - "Ready to publish" with a Webflow ID
 *   Existing item edited and sent back through the queue.
 *   Update that live item. Do not create a second CMS item.
 *   On success: Status → "Updated + Live".
 *   Webflow ID, live link, and last time published stay as they were.
 *   Time unpublished is cleared so a later Archive can unpublish again.
 *
 * - "Is Live"
 *   Terminal result of a first publish. No publish action.
 *
 * - "Updated + Live"
 *   Terminal result of a republish. Not a trigger.
 *
 * - "Archive"
 *   Unpublish the Webflow item and stamp time unpublished.
 *   Status stays "Archive".
 *   A stamp means this Archive cycle already unpublished, so a later
 *   poll does not call Webflow again. The next successful publish
 *   clears the stamp, which lets a later Archive unpublish again.
 *
 * Any Webflow or Airtable failure leaves Status unchanged.
 * Headshot limit is a separate select and never changes Status.
 */

export const STATUS = {
  ready: "Ready to publish",
  isLive: "Is Live",
  updatedLive: "Updated + Live",
  archive: "Archive",
} as const;

export type StatusLabel = (typeof STATUS)[keyof typeof STATUS];

export type PublishAction = "create" | "update" | "unpublish" | "skip";

export interface DecideInput {
  status: string | undefined;
  webflowId: string | undefined;
  timeUnpublished: string | undefined;
}

export interface ActionDecision {
  action: PublishAction;
  /** Written to Status after Webflow accepts the action. Absent: leave Status alone. */
  successStatus?: typeof STATUS.isLive | typeof STATUS.updatedLive;
  reason: string;
}

export function decidePublishAction(input: DecideInput): ActionDecision {
  const webflowId = input.webflowId?.trim() ?? "";
  const status = input.status?.trim();

  switch (status) {
    case STATUS.ready:
      if (!webflowId) {
        return {
          action: "create",
          successStatus: STATUS.isLive,
          reason:
            "Ready to publish with an empty Webflow ID is a new item. Create the CMS item and publish it. Success sets Status to Is Live and writes Webflow ID, live link, and last time published.",
        };
      }
      return {
        action: "update",
        successStatus: STATUS.updatedLive,
        reason:
          "Ready to publish with a Webflow ID is an edit of an existing item. Update that live item and do not create another. Success sets Status to Updated + Live.",
      };
    case STATUS.isLive:
      return {
        action: "skip",
        reason: "Is Live is a terminal result. The sync does not publish this row.",
      };
    case STATUS.updatedLive:
      return {
        action: "skip",
        reason: "Updated + Live is a terminal result. The sync does not treat it as a trigger.",
      };
    case STATUS.archive:
      if (input.timeUnpublished?.trim()) {
        return {
          action: "skip",
          reason:
            "Archive already has time unpublished stamped from this cycle. Status stays Archive until a later publish clears the stamp.",
        };
      }
      return {
        action: "unpublish",
        reason:
          "Archive unpublishes the Webflow item and stamps time unpublished. Status stays Archive.",
      };
    default:
      return {
        action: "skip",
        reason: "Status is not Ready to publish or Archive, so there is no publish action.",
      };
  }
}

/**
 * Rows the cron and the webhook poll should load.
 * "Is Live" and "Updated + Live" are absent on purpose: both are terminal.
 * Archive rows that already have time unpublished are absent too.
 */
export function actionableFilterFormula(fields: {
  status: string;
  timeUnpublished: string;
}): string {
  const status = fields.status;
  const unpublished = fields.timeUnpublished;
  return `OR({${status}}='${STATUS.ready}',AND({${status}}='${STATUS.archive}',{${unpublished}}=BLANK()))`;
}

export interface WritebackInput {
  action: Exclude<PublishAction, "skip">;
  webflowId?: string;
  liveLink?: string;
  publishedAt: string;
  columns: {
    status: string;
    webflowId: string;
    liveLink: string;
    lastPublished: string;
    timeUnpublished: string;
  };
}

/**
 * Airtable cells to patch after Webflow accepts the action.
 * Callers must skip this entirely when Webflow or validation fails,
 * so Status stays where the editor left it.
 */
export function successWriteback(input: WritebackInput): Record<string, string | null> {
  const columns = input.columns;

  if (input.action === "unpublish") {
    return {
      [columns.timeUnpublished]: input.publishedAt,
    };
  }

  // Clear the Archive stamp so a later Archive unpublishes this publish.
  if (input.action === "update") {
    return {
      [columns.status]: STATUS.updatedLive,
      [columns.timeUnpublished]: null,
    };
  }

  const webflowId = input.webflowId?.trim() ?? "";
  if (!webflowId) {
    throw new Error("Webflow response missing item id");
  }
  const fields: Record<string, string | null> = {
    [columns.status]: STATUS.isLive,
    [columns.webflowId]: webflowId,
    [columns.lastPublished]: input.publishedAt,
    [columns.timeUnpublished]: null,
  };
  if (input.liveLink) {
    fields[columns.liveLink] = input.liveLink;
  }
  return fields;
}
