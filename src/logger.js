// ─────────────────────────────────────────────────────────────────
//  src/logger.js  –  Structured console + file logger (Winston)
// ─────────────────────────────────────────────────────────────────
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, colorize, printf, json } = format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Human-readable output to console
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    // JSON log file for persistence / debugging
    new transports.File({
      filename: 'logs/app.log',
      format: combine(timestamp(), json()),
      maxFiles: 5,
      maxsize: 5_242_880, // 5 MB
    }),
  ],
});

module.exports = logger;
