// ─────────────────────────────────────────────────────────────────
//  src/classifier.js  –  OpenAI-powered ticket classifier
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const OpenAI = require('openai');
const logger = require('./logger');

// Client is created lazily so the server can start without a key configured.
// The error surfaces only when a ticket is actually processed.
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── Allowed values (used for validation after AI responds) ──────
const VALID_CATEGORIES = ['Billing', 'Technical', 'Bug', 'Feature Request', 'General'];
const VALID_URGENCIES  = ['High', 'Medium', 'Low'];
const VALID_SENTIMENTS = ['Positive', 'Neutral', 'Frustrated', 'Angry'];

// ── System prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are an expert customer-support triage assistant.
Analyze the incoming support ticket and respond ONLY with a valid JSON object.

Schema:
{
  "category":   "<Billing | Technical | Bug | Feature Request | General>",
  "urgency":    "<High | Medium | Low>",
  "sentiment":  "<Positive | Neutral | Frustrated | Angry>",
  "summary":    "<one-line summary, max 120 chars>",
  "suggestedAction": "<brief recommended first step for the agent>"
}

Rules:
- category  → choose the single best fit.
- urgency   → High if service is down / payment failed / data loss; Medium for degraded function; Low for general questions.
- sentiment → infer from tone and word choice.
- summary   → be concise, factual, and neutral.
- suggestedAction → helpful human-readable guidance for the support agent.
- NEVER include markdown fences or explanation text; return raw JSON only.
`.trim();

/**
 * Classify a support ticket using OpenAI.
 * @param {object} ticket  - { subject, body, sender, metadata }
 * @returns {Promise<object>} AI classification result
 */
async function classifyTicket(ticket) {
  const userMessage = `
SUBJECT: ${ticket.subject || '(no subject)'}
FROM:    ${ticket.sender  || 'unknown'}
BODY:
${ticket.body || '(empty body)'}
  `.trim();

  logger.info('Sending ticket to OpenAI for classification', {
    model: MODEL,
    subject: ticket.subject,
    sender: ticket.sender,
  });

  const startTime = Date.now();
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage   },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,   // low temperature → consistent, deterministic outputs
    max_tokens: 300,
  });

  const elapsed = Date.now() - startTime;
  const raw     = completion.choices[0].message.content;

  let result;
  try {
    result = JSON.parse(raw);
  } catch (err) {
    logger.error('OpenAI returned invalid JSON', { raw });
    throw new Error('AI classification failed – could not parse JSON response');
  }

  // ── Validate fields ──────────────────────────────────────────
  if (!VALID_CATEGORIES.includes(result.category)) {
    logger.warn('Unexpected category from AI, defaulting to General', { category: result.category });
    result.category = 'General';
  }
  if (!VALID_URGENCIES.includes(result.urgency)) {
    result.urgency = 'Low';
  }
  if (!VALID_SENTIMENTS.includes(result.sentiment)) {
    result.sentiment = 'Neutral';
  }

  logger.info('Ticket classified', {
    category: result.category,
    urgency:  result.urgency,
    sentiment: result.sentiment,
    latencyMs: elapsed,
    tokensUsed: completion.usage?.total_tokens,
  });

  return {
    ...result,
    _meta: {
      model:     MODEL,
      latencyMs: elapsed,
      tokens:    completion.usage?.total_tokens,
    },
  };
}

module.exports = { classifyTicket };
