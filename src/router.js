// ─────────────────────────────────────────────────────────────────
//  src/router.js  –  Routes classified tickets to Slack channels
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const { sendToSlack } = require('./slackNotifier');
const logger          = require('./logger');

// ── Category → Route mapping ─────────────────────────
const ROUTE_CONFIG = {
  billing: {
    type: 'email',
    recipient: process.env.FINANCE_EMAIL,
    label: 'Finance Email',
  },
  bug: {
    type: 'slack',
    webhook: process.env.SLACK_WEBHOOK_BUG,
    label: '#dev-slack-channel',
  },
  'feature request': {
    type: 'slack',
    webhook: process.env.SLACK_WEBHOOK_TECHNICAL,
    label: '#technical-support',
  },
  general: {
    type: 'email',
    recipient: process.env.SHARED_INBOX_EMAIL,
    label: 'Shared Inbox',
  },
};

const DEFAULT_WEBHOOK = process.env.SLACK_WEBHOOK_DEFAULT;

/**
 * Route a ticket based on AI classification.
 *
 * @param {object} ticket         - Original ticket { subject, body, sender, metadata }
 * @param {object} classification - AI classification result
 * @param {string} ticketId       - Unique ticket ID
 * @returns {Promise<object>} Route result { type, target, label }
 */
async function routeTicket(ticket, classification, ticketId) {
  const { category } = classification;

  const config = ROUTE_CONFIG[category];

  if (config) {
    logger.info(`Routing ticket → ${config.label}`, { ticketId, category, priority: classification.priority });

    if (config.type === 'slack') {
      if (!config.webhook) {
        throw new Error(`Slack webhook not configured for category "${category}"`);
      }
      await sendToSlack(config.webhook, ticket, classification, ticketId);
      return { routed: true, type: 'slack', channel: config.label };
    }

    if (config.type === 'email') {
      if (!config.recipient) {
        throw new Error(`Recipient email not configured for category "${category}"`);
      }
      // Note: Actual email sending will be handled by server.js calling emailNotifier
      return { routed: true, type: 'email', recipient: config.recipient, label: config.label };
    }
  }

  // Fallback to default Slack channel
  if (DEFAULT_WEBHOOK) {
    logger.info('Routing ticket → #default-support (fallback)', { ticketId, category });
    await sendToSlack(DEFAULT_WEBHOOK, ticket, classification, ticketId);
    return { routed: true, type: 'slack', channel: '#default-support' };
  }

  const msg = `No routing rule or fallback configured for category "${category}".`;
  logger.error(msg, { ticketId, category });
  throw new Error(msg);
}

module.exports = { routeTicket };
