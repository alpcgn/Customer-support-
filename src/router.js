// ─────────────────────────────────────────────────────────────────
//  src/router.js  –  Routes classified tickets to Slack channels
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const { sendToSlack } = require('./slackNotifier');
const logger          = require('./logger');

// ── Category → Slack webhook URL mapping ─────────────────────────
//    Falls back to DEFAULT if the env var is missing.
const CHANNEL_MAP = {
  Billing:          process.env.SLACK_WEBHOOK_BILLING,
  Technical:        process.env.SLACK_WEBHOOK_TECHNICAL,
  Bug:              process.env.SLACK_WEBHOOK_BUG,
  'Feature Request': process.env.SLACK_WEBHOOK_TECHNICAL, // share tech channel
  General:          process.env.SLACK_WEBHOOK_GENERAL,
};

const DEFAULT_WEBHOOK = process.env.SLACK_WEBHOOK_DEFAULT;

/**
 * Route a ticket to the correct Slack channel based on AI classification.
 *
 * @param {object} ticket         - Original ticket { subject, body, sender, metadata }
 * @param {object} classification - AI classification result
 * @param {string} ticketId       - Unique ticket ID
 * @returns {Promise<{ routed: true, channel: string }>}
 */
async function routeTicket(ticket, classification, ticketId) {
  const { category } = classification;

  // Resolve destination webhook
  const webhookUrl = CHANNEL_MAP[category] || DEFAULT_WEBHOOK;

  if (!webhookUrl) {
    const msg = `No Slack webhook configured for category "${category}" and no DEFAULT set.`;
    logger.error(msg, { ticketId, category });
    throw new Error(msg);
  }

  const channelLabel = category in CHANNEL_MAP ? `#${category.toLowerCase().replace(/ /g, '-')}-support` : '#general-support';
  logger.info(`Routing ticket → ${channelLabel}`, { ticketId, category, urgency: classification.urgency });

  await sendToSlack(webhookUrl, ticket, classification, ticketId);

  return { routed: true, channel: channelLabel };
}

module.exports = { routeTicket };
