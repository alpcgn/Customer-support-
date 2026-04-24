// ─────────────────────────────────────────────────────────────────
//  server.js  –  Webhook entry point
//  Flow: POST /webhook/ticket → classify → route → store → ack
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const express         = require('express');
const crypto          = require('crypto');
const { classifyTicket }     = require('./src/classifier');
const { routeTicket }        = require('./src/router');
const { storeTicket }        = require('./src/ticketStore');
const { sendAcknowledgment } = require('./src/emailNotifier');
const logger                 = require('./src/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ── Optional webhook secret guard ─────────────────────────────────
function verifySecret(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return next(); // no secret configured → open

  const incoming = req.headers['x-webhook-secret'] || req.query.secret;
  if (!incoming) {
    logger.warn('Rejected request – missing webhook secret', { ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const incomingBuf = Buffer.from(incoming);
  const secretBuf   = Buffer.from(secret);
  if (incomingBuf.length !== secretBuf.length || !crypto.timingSafeEqual(incomingBuf, secretBuf)) {
    logger.warn('Rejected request – invalid webhook secret', { ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'support-routing-core',
    timestamp: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────────────────────
//  POST /webhook/ticket
//
//  Expected body (JSON):
//  {
//    "subject":  "Cannot log in to my account",
//    "body":     "I have been locked out since yesterday...",
//    "sender":   "user@example.com",
//    "metadata": { "source": "email", "ticketId": "TICK-001" }   ← optional
//  }
// ────────────────────────────────────────────────────────────────
app.post('/webhook/ticket', verifySecret, async (req, res) => {
  const { subject, body, sender, metadata = {} } = req.body;

  // ── Basic validation ──────────────────────────────────────────
  if (!body && !subject) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'At least one of "subject" or "body" is required.',
    });
  }

  // Generate a deterministic short ID for this ticket
  const ticketId =
    metadata.ticketId ||
    `TKT-${Date.now().toString(36).toUpperCase()}`;

  logger.info('Ticket received', { ticketId, sender, subject });

  try {
    // ── Step 1: AI Classification ────────────────────────────────
    const classification = await classifyTicket({ subject, body, sender, metadata });

    // ── Step 2: Route to Slack ────────────────────────────────────
    const routeResult = await routeTicket(
      { subject, body, sender, metadata },
      classification,
      ticketId
    );

    // ── Step 3: Store ticket + Send acknowledgment (parallel) ────
    const ticket = { subject, body, sender, metadata };
    const [storeResult, emailResult] = await Promise.allSettled([
      storeTicket(ticketId, ticket, classification),
      sendAcknowledgment(ticketId, ticket),
    ]);

    const stored = storeResult.status === 'fulfilled'
      ? storeResult.value
      : { stored: false, reason: storeResult.reason?.message };

    const acknowledged = emailResult.status === 'fulfilled'
      ? emailResult.value
      : { sent: false, reason: emailResult.reason?.message };

    // ── Respond to caller ─────────────────────────────────────────
    const response = {
      ticketId,
      classification: {
        category:        classification.category,
        urgency:         classification.urgency,
        sentiment:       classification.sentiment,
        summary:         classification.summary,
        suggestedAction: classification.suggestedAction,
      },
      routing:      routeResult,
      storage:      stored,
      acknowledged,
      processedAt:  new Date().toISOString(),
    };

    logger.info('Ticket fully processed', {
      ticketId,
      category:     classification.category,
      urgency:      classification.urgency,
      channel:      routeResult.channel,
      stored:       stored.stored,
      emailSent:    acknowledged.sent,
    });

    return res.status(200).json(response);

  } catch (err) {
    logger.error('Error processing ticket', {
      ticketId,
      error: err.message,
      stack: err.stack,
    });

    // Return a 500 but still surface a readable message
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      ticketId,
    });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ── Start server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Routing Core listening on http://localhost:${PORT}`);
  logger.info('Endpoints:');
  logger.info(`  GET  http://localhost:${PORT}/health`);
  logger.info(`  POST http://localhost:${PORT}/webhook/ticket`);
});

module.exports = app; // export for testing
