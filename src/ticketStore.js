// ─────────────────────────────────────────────────────────────────
//  src/ticketStore.js  –  Persists tickets to Google Sheets
//
//  Each ticket is appended as a new row in the configured sheet.
//  If Google Sheets credentials are not configured, the module
//  logs a warning and returns gracefully (no crash).
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const { google } = require('googleapis');
const logger     = require('./logger');

// ── Configuration ────────────────────────────────────────────────
const SHEET_ID   = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL   = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY     = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Tickets';

// ── Header row (written once if the sheet is empty) ──────────────
const HEADERS = [
  'Ticket ID',
  'Timestamp',
  'Sender',
  'Subject',
  'Message Body',
  'Source',
  'Category',
  'Urgency',
  'Sentiment',
  'Summary',
  'Suggested Action',
  'Status',
];

// ── Auth + client (created lazily) ───────────────────────────────
let _sheets = null;

function getSheetsClient() {
  if (_sheets) return _sheets;

  if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
    return null; // credentials not configured
  }

  const auth = new google.auth.JWT(
    SA_EMAIL,
    null,
    SA_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * Ensure the header row exists in the sheet.
 * Called once before the first append.
 */
let _headersVerified = false;

async function ensureHeaders(sheets) {
  if (_headersVerified) return;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:L1`,
    });

    const firstRow = res.data.values?.[0];
    if (!firstRow || firstRow.length === 0) {
      // Sheet is empty → write header row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
      logger.info('Google Sheets: wrote header row');
    }

    _headersVerified = true;
  } catch (err) {
    logger.warn('Google Sheets: could not verify headers', { error: err.message });
    // Non-fatal – continue anyway
  }
}

/**
 * Store a ticket in Google Sheets.
 *
 * @param {string} ticketId        - Unique ticket identifier
 * @param {object} ticket          - { subject, body, sender, metadata }
 * @param {object} classification  - AI classification result
 * @returns {Promise<{ stored: boolean, row?: number }>}
 */
async function storeTicket(ticketId, ticket, classification) {
  const sheets = getSheetsClient();

  if (!sheets) {
    logger.warn('Google Sheets not configured – skipping ticket storage', { ticketId });
    return { stored: false, reason: 'Google Sheets credentials not configured' };
  }

  try {
    await ensureHeaders(sheets);

    const row = [
      ticketId,
      new Date().toISOString(),
      ticket.sender || 'Unknown',
      ticket.subject || '(no subject)',
      ticket.body || '(empty)',
      ticket.metadata?.source || 'unknown',
      classification.category || '',
      classification.urgency || '',
      classification.sentiment || '',
      classification.summary || '',
      classification.suggestedAction || '',
      'Open',
    ];

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:L`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    const updatedRange = res.data.updates?.updatedRange || '';
    const rowNumber    = parseInt(updatedRange.match(/\d+$/)?.[0], 10) || null;

    logger.info('Ticket stored in Google Sheets', { ticketId, row: rowNumber });
    return { stored: true, row: rowNumber };

  } catch (err) {
    logger.error('Failed to store ticket in Google Sheets', {
      ticketId,
      error: err.message,
    });
    // Non-fatal – the ticket was already processed
    return { stored: false, reason: err.message };
  }
}

module.exports = { storeTicket };
