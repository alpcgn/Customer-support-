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
const { sendAcknowledgment, sendInternalRoutingEmail } = require('./src/emailNotifier');
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
// ────────────────────────────────────────────────────────────────
app.post('/webhook/ticket', verifySecret, async (req, res) => {
  const { subject, body, sender, metadata = {} } = req.body;

  if (!body && !subject) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'At least one of "subject" or "body" is required.',
    });
  }

  const ticketId = metadata.ticketId || `TKT-${Date.now().toString(36).toUpperCase()}`;
  logger.info('Ticket received', { ticketId, sender, subject });

  try {
    // ── Step 1: AI Classification & Auto-Response Drafting ───────
    const classification = await classifyTicket({ subject, body, sender, metadata });

    // ── Step 2: Routing (Slack or determination for Email) ───────
    const routeResult = await routeTicket(
      { subject, body, sender, metadata },
      classification,
      ticketId
    );

    // ── Step 3: Persistence, Acknowledgment, and Routing Emails ──
    const ticket = { subject, body, sender, metadata };
    
    // Build promises for parallel execution
    const tasks = [
      storeTicket(ticketId, ticket, classification),
      sendAcknowledgment(ticketId, ticket, classification)
    ];

    // If routed via email, add that task too
    if (routeResult.type === 'email') {
      tasks.push(sendInternalRoutingEmail(ticketId, ticket, classification, routeResult.recipient));
    }

    const results = await Promise.allSettled(tasks);

    const stored = results[0].status === 'fulfilled'
      ? results[0].value
      : { stored: false, reason: results[0].reason?.message };

    const acknowledged = results[1].status === 'fulfilled'
      ? results[1].value
      : { sent: false, reason: results[1].reason?.message };

    let routedInternally = { sent: false };
    if (routeResult.type === 'email') {
      routedInternally = results[2].status === 'fulfilled'
        ? results[2].value
        : { sent: false, reason: results[2].reason?.message };
    }

    // ── Respond to caller ─────────────────────────────────────────
    const response = {
      ticketId,
      classification: {
        category:        classification.category,
        priority:        classification.priority,
        sentiment:       classification.sentiment,
        summary:         classification.summary,
        suggestedAction: classification.suggestedAction,
        draftResponse:   classification.draftResponse,
      },
      routing: {
        ...routeResult,
        internallySent: routedInternally.sent,
      },
      storage:      stored,
      acknowledged,
      processedAt:  new Date().toISOString(),
    };

    logger.info('Ticket fully processed', {
      ticketId,
      category:     classification.category,
      priority:     classification.priority,
      routeType:    routeResult.type,
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
