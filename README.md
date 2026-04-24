# Customer Support Automation

> **Steps 1 & 2 of 3 — Routing Core + Ticket Intake & Acknowledgment**

Receives incoming support tickets via a **webhook**, uses **OpenAI** to classify them, routes each ticket to the correct **Slack channel**, stores it in **Google Sheets**, and sends a confirmation **email** back to the user — all automatically.

```
POST /webhook/ticket
        │
        ▼
┌───────────────────┐
│  Express Server   │  validates payload, generates ticket ID
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  AI Classifier    │  OpenAI → category, urgency, sentiment, summary
│  (classifier.js)  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Router           │  maps category → Slack webhook URL
│  (router.js)      │
└────────┬──────────┘
         │
    ┌────┴────┐          (parallel)
    ▼         ▼
┌────────┐ ┌─────────┐
│ Store  │ │  Email  │
│ Ticket │ │  Ack    │
│(Sheets)│ │(SMTP)   │
└────────┘ └─────────┘
```

---

## Project Structure

```
Customer-support-/
├── server.js                   # Entry point – Express webhook server
├── src/
│   ├── classifier.js           # OpenAI ticket classification
│   ├── router.js               # Category → Slack channel routing
│   ├── slackNotifier.js        # Slack Block Kit message sender
│   ├── ticketStore.js          # Google Sheets persistence (Step 2)
│   ├── emailNotifier.js        # SMTP acknowledgment emails (Step 2)
│   └── logger.js               # Winston logger (console + file)
├── scripts/
│   └── testWebhook.js          # Fire sample tickets for local testing
├── logs/                       # Auto-created at runtime
├── .env.example                # Environment variable template
├── .gitignore
└── package.json
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

#### Core (Step 1)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | From [platform.openai.com](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | `gpt-4o-mini` (fast/cheap) or `gpt-4o` (best) |
| `SLACK_WEBHOOK_BILLING` | Slack Incoming Webhook URL for billing channel |
| `SLACK_WEBHOOK_TECHNICAL` | Slack Incoming Webhook URL for tech channel |
| `SLACK_WEBHOOK_BUG` | Slack Incoming Webhook URL for bug reports |
| `SLACK_WEBHOOK_GENERAL` | Slack Incoming Webhook URL for general channel |
| `SLACK_WEBHOOK_DEFAULT` | Fallback channel if category doesn't match |
| `SLACK_ONCALL_USER_ID` | Slack User ID to @mention on High urgency tickets |
| `WEBHOOK_SECRET` | *(Optional)* Secures the endpoint |

#### Google Sheets – Ticket Storage (Step 2)

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account email (e.g. `sa@project.iam.gserviceaccount.com`) |
| `GOOGLE_PRIVATE_KEY` | The private key from the JSON key file (keep the `\n` escapes) |
| `GOOGLE_SHEET_ID` | The Sheet ID (from the Google Sheets URL) |
| `GOOGLE_SHEET_NAME` | Tab name in the sheet (default: `Tickets`) |

#### SMTP – Acknowledgment Emails (Step 2)

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Port — `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username / email |
| `SMTP_PASS` | SMTP password or App Password |
| `EMAIL_FROM_NAME` | Display name (e.g. `Support Team`) |
| `EMAIL_FROM_ADDRESS` | From address shown to recipient |

> **Note:** Both Google Sheets and SMTP are optional. If not configured, the server will log warnings but continue to work — tickets will still be classified and routed to Slack.

---

### Setting Up Google Sheets

1. Go to [Google Cloud Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Create a new Service Account (or use an existing one)
3. Go to **Keys** → **Add Key** → **Create new key** → JSON
4. Download the JSON file — you'll need `client_email` and `private_key`
5. Enable the **Google Sheets API** in [APIs & Services](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
6. Create a new Google Sheet (or use an existing one)
7. **Share the sheet** with your Service Account email (give **Editor** access)
8. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{THIS_PART}/edit`
9. Add the values to your `.env` file

The module will automatically create a header row on the first ticket.

**Sheet columns:** Ticket ID | Timestamp | Sender | Subject | Message Body | Source | Category | Urgency | Sentiment | Summary | Suggested Action | Status

---

### Setting Up SMTP (Gmail Example)

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Generate an App Password for "Mail"
3. Add to `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=yourname@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx
   EMAIL_FROM_NAME=Support Team
   EMAIL_FROM_ADDRESS=yourname@gmail.com
   ```

Works equally well with **SendGrid**, **Mailgun**, **AWS SES**, or any SMTP relay.

---

### 3. Start the server

```bash
npm run dev      # with auto-restart (nodemon)
# or
npm start        # plain node
```

Server starts at **http://localhost:3000**

---

## API Reference

### `GET /health`
Returns service status.

```json
{ "status": "ok", "service": "support-routing-core", "timestamp": "..." }
```

---

### `POST /webhook/ticket`

**Headers** *(if `WEBHOOK_SECRET` is set)*
```
x-webhook-secret: your-secret-token
```

**Request body**
```json
{
  "subject":  "Cannot log in to my account",
  "body":     "I have been locked out since yesterday morning...",
  "sender":   "user@example.com",
  "metadata": {
    "source":   "email",
    "ticketId": "TICK-001"
  }
}
```
> `metadata` is optional. If `ticketId` is omitted, one is auto-generated.

**Response `200 OK`**
```json
{
  "ticketId": "TKT-LX3K9A",
  "classification": {
    "category":        "Technical",
    "urgency":         "High",
    "sentiment":       "Frustrated",
    "summary":         "User cannot log in since yesterday morning",
    "suggestedAction": "Check auth service logs and reset user session"
  },
  "routing": {
    "routed":  true,
    "channel": "#technical-support"
  },
  "storage": {
    "stored": true,
    "row": 2
  },
  "acknowledged": {
    "sent": true,
    "messageId": "<abc123@smtp.gmail.com>"
  },
  "processedAt": "2026-04-14T19:10:00.000Z"
}
```

---

## Routing Map

| AI Category | Slack Channel env var |
|---|---|
| Billing | `SLACK_WEBHOOK_BILLING` |
| Technical | `SLACK_WEBHOOK_TECHNICAL` |
| Bug | `SLACK_WEBHOOK_BUG` |
| Feature Request | `SLACK_WEBHOOK_TECHNICAL` (shared) |
| General | `SLACK_WEBHOOK_GENERAL` |
| *(unknown)* | `SLACK_WEBHOOK_DEFAULT` |

High urgency tickets additionally @mention the user in `SLACK_ONCALL_USER_ID`.

---

## Testing Locally

Run all 5 sample tickets (one per category):

```bash
node scripts/testWebhook.js
```

Run a single category:

```bash
node scripts/testWebhook.js billing
node scripts/testWebhook.js technical
node scripts/testWebhook.js bug
node scripts/testWebhook.js feature
node scripts/testWebhook.js general
```

Or test manually with `curl`:

```bash
curl -X POST http://localhost:3000/webhook/ticket \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Payment failed – urgent",
    "body": "My card was declined during checkout but I was still charged.",
    "sender": "angry.customer@example.com"
  }'
```

---

## Step 2 Conclusion

Step 2 transforms the system from a **notification-only pipeline** into a proper **ticket management starting point**. With Step 1, tickets were classified and routed to Slack — useful for the support team, but invisible to the customer. Now:

- **Every ticket is persisted** in Google Sheets with a full record: timestamp, sender, message, AI classification, and status. This gives the team a searchable, shareable log without needing a dedicated database.
- **Every customer gets an immediate response** — a professional acknowledgment email with their unique ticket ID, so they know their message didn't go into a void.

Both features are designed to be **non-blocking and fault-tolerant**. They run in parallel after classification, and if either fails (misconfigured credentials, network issues), the core pipeline still completes. The server never crashes due to a Sheets API timeout or an SMTP rejection.

The architecture is also **opt-in** — you can run the server with zero Google/SMTP configuration and everything from Step 1 continues to work exactly as before. Add the credentials when you're ready, and the new features light up automatically.

---

## What's Next

| Step | Feature |
|---|---|
| ✅ **Step 1** | Routing Core – webhook, AI classification, Slack routing |
| ✅ **Step 2** | Ticket Intake & Acknowledgment – Google Sheets storage, email confirmation |
| 🔜 **Step 3** | Auto-Response Engine – draft and send AI replies back to customers |
