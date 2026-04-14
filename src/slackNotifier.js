// ─────────────────────────────────────────────────────────────────
//  src/slackNotifier.js  –  Posts formatted messages to Slack
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const axios  = require('axios');
const logger = require('./logger');

// ── Emoji / color maps ────────────────────────────────────────────
const URGENCY_EMOJI = { High: '🔴', Medium: '🟡', Low: '🟢' };
const URGENCY_COLOR = { High: '#FF3B30', Medium: '#FF9500', Low: '#34C759' };
const CATEGORY_EMOJI = {
  Billing:          '💳',
  Technical:        '🔧',
  Bug:              '🐛',
  'Feature Request': '💡',
  General:          '💬',
};
const SENTIMENT_EMOJI = {
  Positive:   '😊',
  Neutral:    '😐',
  Frustrated: '😤',
  Angry:      '😡',
};

/**
 * Build a rich Slack Block Kit message payload.
 */
function buildSlackPayload(ticket, classification, ticketId) {
  const urgencyEmoji  = URGENCY_EMOJI[classification.urgency]  || '⚪';
  const categoryEmoji = CATEGORY_EMOJI[classification.category] || '📩';
  const sentimentEmoji= SENTIMENT_EMOJI[classification.sentiment] || '❓';
  const color         = URGENCY_COLOR[classification.urgency]  || '#8E8E93';

  const oncallMention =
    classification.urgency === 'High' && process.env.SLACK_ONCALL_USER_ID
      ? `\n⚠️ *On-call alert:* <@${process.env.SLACK_ONCALL_USER_ID}>`
      : '';

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${urgencyEmoji} New Support Ticket – ${classification.category}`,
              emoji: true,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Ticket ID*\n\`${ticketId}\`` },
              { type: 'mrkdwn', text: `*Category*\n${categoryEmoji} ${classification.category}` },
              { type: 'mrkdwn', text: `*Urgency*\n${urgencyEmoji} ${classification.urgency}` },
              { type: 'mrkdwn', text: `*Sentiment*\n${sentimentEmoji} ${classification.sentiment}` },
              { type: 'mrkdwn', text: `*From*\n${ticket.sender || 'Unknown'}` },
              { type: 'mrkdwn', text: `*Subject*\n${ticket.subject || '(no subject)'}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*📝 AI Summary*\n${classification.summary}` },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🎯 Suggested Action*\n${classification.suggestedAction}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `AI Model: \`${classification._meta?.model || 'N/A'}\` · Latency: \`${classification._meta?.latencyMs || '?'}ms\` · Tokens: \`${classification._meta?.tokens || '?'}\`${oncallMention}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Send a classified ticket notification to a Slack webhook URL.
 * @param {string} webhookUrl       - Slack incoming webhook URL
 * @param {object} ticket           - Original ticket object
 * @param {object} classification   - AI classification result
 * @param {string} ticketId         - Unique ticket identifier
 */
async function sendToSlack(webhookUrl, ticket, classification, ticketId) {
  const payload = buildSlackPayload(ticket, classification, ticketId);

  try {
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    logger.info('Slack notification sent', { ticketId, channel: webhookUrl.split('/').slice(-1)[0] });
  } catch (err) {
    const detail = err.response?.data || err.message;
    logger.error('Failed to send Slack notification', { ticketId, detail });
    throw err;
  }
}

module.exports = { sendToSlack };
