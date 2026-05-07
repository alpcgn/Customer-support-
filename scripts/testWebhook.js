// ─────────────────────────────────────────────────────────────────
//  scripts/testWebhook.js
//
//  Fires several sample tickets at your local server so you can
//  verify the full pipeline without a real customer submission.
//
//  Usage:
//    node scripts/testWebhook.js
//    node scripts/testWebhook.js billing   ← run one category only
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const axios = require('axios');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const SECRET   = process.env.WEBHOOK_SECRET || '';

// ── Sample tickets covering every category / priority combination ──
const SAMPLE_TICKETS = [
  {
    label: 'billing',
    payload: {
      subject: 'Charged twice for my subscription this month',
      body: 'Hello, I noticed two identical charges of $49.99 on my credit card statement dated April 1st. My account is under the Pro plan. Please refund the duplicate charge immediately.',
      sender: 'jane.doe@example.com',
      metadata: { source: 'email' },
    },
  },
  {
    label: 'bug',
    payload: {
      subject: 'Dark mode toggle breaks the dashboard layout',
      body: 'When I switch to dark mode in the settings, the sidebar overlaps the main content area and all icons become invisible. I am on Chrome 124 / macOS 14. Steps to reproduce: 1) Go to Settings, 2) Enable Dark Mode.',
      sender: 'bob.smith@gmail.com',
      metadata: { source: 'web-form', version: '3.2.1' },
    },
  },
  {
    label: 'feature request',
    payload: {
      subject: 'Feature request: CSV export for reports',
      body: 'It would be very helpful to have a CSV export button on the Reports page. Currently we have to copy-paste data manually into Excel. Our whole finance team uses this weekly.',
      sender: 'carol@startup.xyz',
      metadata: { source: 'in-app' },
    },
  },
  {
    label: 'general',
    payload: {
      subject: 'How long does onboarding typically take?',
      body: 'Hi team, we are evaluating your product for our company of 50 people. Can you tell me roughly how long the onboarding process takes and whether you offer dedicated support during that period? Thanks!',
      sender: 'prospects@bigco.com',
      metadata: { source: 'contact-form' },
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────
async function runTests() {
  const filter = process.argv[2]; // optional: filter by label
  const tickets = filter
    ? SAMPLE_TICKETS.filter((t) => t.label.includes(filter))
    : SAMPLE_TICKETS;

  if (tickets.length === 0) {
    console.error(`❌  No ticket found with label matching "${filter}"`);
    console.error(`    Available: ${SAMPLE_TICKETS.map((t) => t.label).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🧪  Running ${tickets.length} test ticket(s) against ${BASE_URL}\n`);

  for (let i = 0; i < tickets.length; i++) {
    const { label, payload } = tickets[i];
    console.log(`──────────────────────────────────────`);
    console.log(`📨  Sending [${label.toUpperCase()}] ticket`);
    console.log(`    Subject: "${payload.subject}"`);

    try {
      const headers = SECRET ? { 'x-webhook-secret': SECRET } : {};
      const { data, status } = await axios.post(
        `${BASE_URL}/webhook/ticket`,
        payload,
        { headers, timeout: 30_000 }
      );

      console.log(`✅  HTTP ${status} – Ticket ID: ${data.ticketId}`);
      console.log(`    Category : ${data.classification.category}`);
      console.log(`    Priority : ${data.classification.priority}`);
      console.log(`    Sentiment: ${data.classification.sentiment}`);
      console.log(`    Summary  : ${data.classification.summary}`);
      console.log(`    Route    : ${data.routing.type} → ${data.routing.channel || data.routing.label}`);
      console.log(`    Internally Routed: ${data.routing.internallySent}`);
      console.log(`    Stored   : ${data.storage?.stored ?? 'N/A'}${data.storage?.row ? ` (row ${data.storage.row})` : ''}`);
      console.log(`    Email Ack: ${data.acknowledged?.sent ?? 'N/A'}${data.acknowledged?.messageId ? ` (${data.acknowledged.messageId})` : ''}`);
      console.log(`    AI Draft Response:`);
      console.log(`    -----------------`);
      console.log(`    ${data.classification.draftResponse}`);
      console.log(`    -----------------`);
    } catch (err) {
      const msg = err.response?.data || err.message;
      console.error(`❌  Failed [${label}]:`, msg);
    }

    // Avoid hammering the OpenAI rate limit between tests
    if (i < tickets.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log('\n✨  Test run complete.\n');
}

runTests();
