'use strict';
const emailService = require('./email');

/**
 * Stage-overdue alerts for the provisioning pipeline.
 *
 * A request is "overdue" when it has sat in its current stage longer than
 * that stage's limit. One email is sent per stage stay (tracked in
 * pipeline_alerts), so a stuck request does not re-alert on every check.
 */

const DEFAULT_LIMIT_HOURS = Number(process.env.ALERT_DEFAULT_HOURS || 48);

// Per-stage limits in hours; stages not listed use DEFAULT_LIMIT_HOURS.
const STAGE_LIMIT_HOURS = {
  'Manager Approval': 24,
  'Awaiting Approval': 48,
  'Awaiting Purchasing': 72,
  'Warehouse Delivery': 72,
  'IT Transit Time': 24,
  'Equipment Preparation': 24,
};

// Requests at these states are finished and never alert.
const TERMINAL = ['Delivery', 'Cancelled'];

function limitFor(stage) {
  return STAGE_LIMIT_HOURS[stage] || DEFAULT_LIMIT_HOURS;
}

async function ensureAlertsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_alerts (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      ticket_number VARCHAR(20) NOT NULL,
      status_name   VARCHAR(60) NOT NULL,
      stage_entered_at DATETIME NOT NULL,
      hours_in_stage DECIMAL(8,2) NOT NULL,
      recipients    TEXT,
      sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_alert_stay (ticket_number, status_name, stage_entered_at),
      FOREIGN KEY (ticket_number) REFERENCES pipeline_requests(ticket_number) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

/**
 * Active requests that exceeded their stage limit, worst first.
 * Stage entry time = latest history row for the current status.
 */
async function getOverdue(pool) {
  const [rows] = await pool.query(`
    SELECT r.ticket_number, r.device_model, r.requested_by, r.assigned_to,
           r.current_status,
           (SELECT MAX(h.timestamp) FROM pipeline_history h
             WHERE h.ticket_number = r.ticket_number
               AND h.status_name = r.current_status) AS stage_entered_at
    FROM pipeline_requests r
    WHERE r.current_status NOT IN (?)
  `, [TERMINAL]);

  const now = Date.now();
  return rows
    .map(r => {
      const entered = new Date(r.stage_entered_at || now);
      const hours = Math.round(((now - entered.getTime()) / 36e5) * 100) / 100;
      return { ...r, stage_entered_at: entered, hours_in_stage: hours, limit_hours: limitFor(r.current_status) };
    })
    .filter(r => r.hours_in_stage > r.limit_hours)
    .sort((a, b) => (b.hours_in_stage - b.limit_hours) - (a.hours_in_stage - a.limit_hours));
}

async function resolveRecipients(pool, item) {
  const list = new Set(
    String(process.env.ALERT_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  if (item.assigned_to) {
    const [[user]] = await pool.query(
      'SELECT email FROM users WHERE username = ? LIMIT 1', [item.assigned_to]
    ).catch(() => [[null]]);
    if (user && user.email) list.add(user.email);
  }
  return [...list];
}

/**
 * Detect overdue requests and email the ones not yet alerted for this stay.
 * Returns { overdue, sent, skipped }.
 */
async function runCheck(pool) {
  await ensureAlertsTable(pool);
  const overdue = await getOverdue(pool);
  let sent = 0;
  let skipped = 0;

  for (const item of overdue) {
    const [[already]] = await pool.query(
      `SELECT id FROM pipeline_alerts
       WHERE ticket_number = ? AND status_name = ? AND stage_entered_at = ? LIMIT 1`,
      [item.ticket_number, item.current_status, item.stage_entered_at]
    );
    if (already) { skipped++; continue; }

    const recipients = await resolveRecipients(pool, item);
    if (!recipients.length || !process.env.RESEND_API_KEY) {
      console.warn(`Alert for ${item.ticket_number} not sent: no recipients or RESEND_API_KEY`);
      continue; // not recorded, so it is retried once email is configured
    }

    try {
      await emailService.sendStageOverdueAlert(recipients, item);
      await pool.query(
        `INSERT INTO pipeline_alerts (ticket_number, status_name, stage_entered_at, hours_in_stage, recipients)
         VALUES (?, ?, ?, ?, ?)`,
        [item.ticket_number, item.current_status, item.stage_entered_at, item.hours_in_stage, recipients.join(',')]
      );
      sent++;
    } catch (e) {
      console.error(`Alert email failed for ${item.ticket_number}:`, e.message);
    }
  }
  return { overdue: overdue.length, sent, skipped };
}

function startScheduler(pool) {
  if (process.env.ALERTS_ENABLED === '0') {
    console.log('Pipeline alerts disabled (ALERTS_ENABLED=0).');
    return;
  }
  const minutes = Math.max(1, Number(process.env.ALERT_CHECK_MINUTES || 60));
  const tick = () => runCheck(pool)
    .then(r => r.sent && console.log(`Pipeline alerts: ${r.sent} sent, ${r.overdue} overdue`))
    .catch(e => console.warn('Pipeline alert check failed:', e.message));
  setTimeout(tick, 15000); // first check shortly after startup, once schema is ensured
  setInterval(tick, minutes * 60 * 1000).unref();
  console.log(`Pipeline alerts: checking every ${minutes} min.`);
}

module.exports = { getOverdue, runCheck, startScheduler, limitFor, STAGE_LIMIT_HOURS };
