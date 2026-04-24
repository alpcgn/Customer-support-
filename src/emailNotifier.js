// ─────────────────────────────────────────────────────────────────
//  src/emailNotifier.js  –  Sends acknowledgment emails via SMTP
//
//  After a ticket is received, sends a professional confirmation
//  email back to the sender with their ticket ID.
//  If SMTP is not configured, logs a warning and returns gracefully.
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const nodemailer = require('nodemailer');
const logger     = require('./logger');

// ── Configuration ────────────────────────────────────────────────
const SMTP_HOST      = process.env.SMTP_HOST;
const SMTP_PORT      = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER      = process.env.SMTP_USER;
const SMTP_PASS      = process.env.SMTP_PASS;
const FROM_NAME      = process.env.EMAIL_FROM_NAME || 'Support Team';
const FROM_ADDRESS   = process.env.EMAIL_FROM_ADDRESS || SMTP_USER;

// ── Transporter (created lazily) ─────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null; // SMTP not configured
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587/other
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Simple email validation.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Build an HTML email body for the acknowledgment.
 * @param {string} ticketId
 * @param {object} ticket
 * @returns {string} HTML content
 */
function buildEmailHTML(ticketId, ticket) {
  const subject = ticket.subject || 'your message';
  const senderName = ticket.sender?.split('@')[0] || 'there';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; font-size:24px; margin:0; font-weight:600;">
                ✉️ We've received your request
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#333; font-size:16px; line-height:1.6; margin:0 0 16px;">
                Hi <strong>${senderName}</strong>,
              </p>
              <p style="color:#333; font-size:16px; line-height:1.6; margin:0 0 24px;">
                Thank you for reaching out. We've received your support request regarding
                <strong>"${subject}"</strong> and a member of our team will get back to you shortly.
              </p>

              <!-- Ticket ID Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#f0f0ff; border-left:4px solid #667eea; border-radius:4px; padding:20px 24px;">
                    <p style="color:#667eea; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:0 0 6px;">
                      Your Ticket ID
                    </p>
                    <p style="color:#333; font-size:22px; font-weight:700; margin:0; font-family:monospace;">
                      ${ticketId}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 16px;">
                Please keep this ticket ID for your reference. You can use it to follow up on the
                status of your request.
              </p>

              <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 8px;">
                <strong>What happens next?</strong>
              </p>
              <ul style="color:#555; font-size:15px; line-height:1.8; margin:0 0 24px; padding-left:20px;">
                <li>Our team will review your request within <strong>24 hours</strong></li>
                <li>You'll receive a follow-up email once an agent is assigned</li>
                <li>For urgent issues, please reply to this email with <strong>"URGENT"</strong> in the subject line</li>
              </ul>

              <p style="color:#555; font-size:15px; line-height:1.6; margin:0;">
                Thank you for your patience,<br>
                <strong>The ${FROM_NAME}</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9fb; padding:24px 40px; text-align:center; border-top:1px solid #e8e8ef;">
              <p style="color:#999; font-size:12px; line-height:1.6; margin:0;">
                This is an automated message. Please do not reply directly — 
                your response may not be monitored.<br>
                Ticket reference: <code>${ticketId}</code>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Build a plain-text fallback body.
 */
function buildEmailText(ticketId, ticket) {
  const subject = ticket.subject || 'your message';
  const senderName = ticket.sender?.split('@')[0] || 'there';

  return [
    `Hi ${senderName},`,
    '',
    `Thank you for reaching out. We've received your support request regarding "${subject}" and a member of our team will get back to you shortly.`,
    '',
    `Your Ticket ID: ${ticketId}`,
    '',
    'Please keep this ticket ID for your reference.',
    '',
    'What happens next?',
    '• Our team will review your request within 24 hours',
    '• You\'ll receive a follow-up email once an agent is assigned',
    '• For urgent issues, reply with "URGENT" in the subject line',
    '',
    'Thank you for your patience,',
    `The ${FROM_NAME}`,
    '',
    '---',
    'This is an automated message. Please do not reply directly.',
    `Ticket reference: ${ticketId}`,
  ].join('\n');
}

/**
 * Send an acknowledgment email to the ticket sender.
 *
 * @param {string} ticketId  - Unique ticket identifier
 * @param {object} ticket    - { subject, body, sender, metadata }
 * @returns {Promise<{ sent: boolean, messageId?: string }>}
 */
async function sendAcknowledgment(ticketId, ticket) {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn('SMTP not configured – skipping acknowledgment email', { ticketId });
    return { sent: false, reason: 'SMTP credentials not configured' };
  }

  // Validate recipient
  if (!isValidEmail(ticket.sender)) {
    logger.warn('Invalid or missing sender email – skipping acknowledgment', {
      ticketId,
      sender: ticket.sender,
    });
    return { sent: false, reason: 'Invalid sender email address' };
  }

  const subject = ticket.subject
    ? `Re: ${ticket.subject} – Ticket #${ticketId} Received`
    : `Ticket #${ticketId} Received – We're on it`;

  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to: ticket.sender,
    subject,
    text: buildEmailText(ticketId, ticket),
    html: buildEmailHTML(ticketId, ticket),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info('Acknowledgment email sent', {
      ticketId,
      to: ticket.sender,
      messageId: info.messageId,
    });
    return { sent: true, messageId: info.messageId };

  } catch (err) {
    logger.error('Failed to send acknowledgment email', {
      ticketId,
      to: ticket.sender,
      error: err.message,
    });
    // Non-fatal – the ticket was already processed
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendAcknowledgment };
