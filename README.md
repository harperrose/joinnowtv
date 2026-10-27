# Provider publish sync

Vercel service that publishes public provider marketing bios from Airtable to a Webflow CMS collection. It replaces the Zapier sync.

This is marketing copy only. Do not put patient information in the mapped fields. Failures post to Slack with the provider name, the action, and the error. Bio text, headshots, and other profile fields are not logged and are not included in the Slack message.

The static site at the repository root is separate. Deploy this service as a Vercel project; the `api/` routes and `vercel.json` cron are the app.

## Environment variables

Set these in the Vercel project. Nothing is hardcoded.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AIRTABLE_TOKEN` | yes | Airtable personal access token with `data.records:read` and `data.records:write` on the base |
| `AIRTABLE_BASE_ID` | yes | Base id (`app...`) |
| `AIRTABLE_TABLE_ID` | yes | Provider table id (`tbl...`) |
| `WEBFLOW_TOKEN` | yes | Webflow API token with `cms:write` |
| `WEBFLOW_COLLECTION_ID` | yes | Provider CMS collection id |
| `SLACK_WEBHOOK_URL` | yes | Slack [incoming webhook](https://api.slack.com/messaging/webhooks) URL. Created in Slack (Apps → Incoming Webhooks) and stored only as this env var. Used for failures. |
| `WEBHOOK_SECRET` | yes | Shared secret for `POST /api/webhook`. For an Airtable automation, any long random string. For a native Airtable webhook, the `macSecretBase64` value returned once when that webhook is created. |
| `CRON_SECRET` | yes | Long random string. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` on cron invocations. |
| `WEBFLOW_SITE_URL` | no | Public prefix for live links, such as `https://example.com/providers`. When unset, the live link cell is left unchanged. |

The process checks these at startup and fails with the missing variable names.

## Status transitions

Airtable `Status` is a single select. Exact labels:

- **Ready to publish**, Webflow ID empty. New item. Create the CMS item and publish it. On success set Status to **Is Live** and write Webflow ID, live link, and last time published (`Last time published`).
- **Ready to publish**, Webflow ID present. The existing item was edited and queued again. Update that live item. Do not create a second item. On success set Status to **Updated + Live**.
- **Is Live** and **Updated + Live** are terminal. The sync does not publish them. **Updated + Live** is not a trigger.
- **Archive**. Unpublish the Webflow item and stamp `Time unpublished`. Status stays **Archive**.
- A headshot larger than 4MB sets **Exceeds Limit**. A smaller file, or no file, sets **Within Limit**. That select does not block create, update, or unpublish, and it does not change Status.
- On any publish or headshot failure, Status stays as it was. Slack gets the provider name, the action (`create`, `update`, `unpublish`, or `headshot check`), and the error.

`Time unpublished` is cleared after a successful create or update, so a later Archive unpublishes again. An Archive row that already has that stamp is left alone.

## Routes

| Method | Path | When it runs |
| --- | --- | --- |
| `POST` | `/api/webhook` | Airtable automation or native Airtable webhook |
| `GET` | `/api/cron` | Vercel Cron every 5 minutes (`vercel.json`) |

Both paths are idempotent. They re-read Airtable and act only on **Ready to publish**, or on **Archive** when `Time unpublished` is blank.

### Airtable automation webhook

1. Trigger when `Status` changes, or when the record matches Ready to publish / Archive.
2. Action: Send webhook.
3. URL: `https://<your-deployment>/api/webhook`
4. Header: `Authorization: Bearer <WEBHOOK_SECRET>` or `X-Webhook-Secret: <WEBHOOK_SECRET>`
5. JSON body: `{ "recordId": "<Airtable record id>" }`

The handler ignores any profile fields in the body and loads the row from Airtable.

### Native Airtable webhook

Create a webhook whose notification URL is `https://<your-deployment>/api/webhook`. Put the one-time `macSecretBase64` in `WEBHOOK_SECRET`. Airtable’s ping is authenticated with `X-Airtable-Content-MAC`. The route then polls the same actionable statuses (it does not store a payload cursor). Respond with an empty 204. Missed pings are picked up by cron.

### Vercel Cron

`vercel.json` schedules `GET /api/cron` every 5 minutes. Set `CRON_SECRET` in the project; Vercel attaches it to the request. Vercel Hobby only runs cron once a day, so a 5-minute poll needs a plan that allows that schedule. The webhook is the timely path either way.

## Airtable columns

These names are assumed. Edit `src/fields.ts` if the base differs. Other columns are ignored.

Mapped: `Name`, `Credential`, `Pronouns`, `Bio`, `Headshot`, `Clinical focus areas`, `Allowed populations`, optional `Slug`.

Writeback: `Webflow ID`, `Live link`, `Last time published`, `Time unpublished`, `Status`, `Headshot limit` (labels `Within Limit` and `Exceeds Limit`).

Webflow slugs assumed in that same file: `name`, `slug`, `credential`, `pronouns`, `bio`, `headshot`, `focus-area-string` (Focus Area String), `population-string` (Population String), `provider-name-with-comma` (Provider name with comma).

Slug is kebab-case of the provider name on create. An update does not send a slug unless `Slug` has a value. If the base has no `Slug` column, the sync continues without it.

`Name` is required. The comma field is the name plus a trailing comma (`Lazzuly Mello` → `Lazzuly Mello,`). Bio is sent as HTML paragraphs for a Webflow rich text field. Multi-selects are joined with `, `. The first headshot attachment is the image. 4MB means `4 * 1024 * 1024` bytes. Webflow image uploads also cap at 4MB; create and update send `skipInvalidFiles=true`, so an over-limit file does not fail the rest of the item.

## Tests

```bash
npm test
```
