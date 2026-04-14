# Step 1 – Routing Core

> **Customer Support Automation · Phase 1 of 3**

Receives incoming support tickets via a **webhook**, uses **OpenAI** to classify them, then routes each ticket to the correct **Slack channel** — automatically.

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
         ▼
┌───────────────────┐
│  Slack Notifier   │  sends rich Block Kit message
│  (slackNotifier)  │
└───────────────────┘
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

Open `.env` and fill in:

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
| `WEBHOOK_SECRET` | *(Optional)* Secures the endpoint – clients must send this in `x-webhook-secret` header |

#### How to create a Slack Incoming Webhook
1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From Scratch
2. Under **Features**, enable **Incoming Webhooks**
3. Click **Add New Webhook to Workspace** → pick a channel → copy the URL

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

## What's Next

| Step | Feature |
|---|---|
| ✅ **Step 1** | Routing Core (this repo) |
| 🔜 **Step 2** | Persistence Layer – store tickets in a DB, SLA tracking, deduplication |
| 🔜 **Step 3** | Auto-Response Engine – draft and send AI replies back to customers |
