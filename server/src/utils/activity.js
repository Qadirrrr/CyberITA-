import { withTransaction } from '../config/db.js';

/** Appends an entry to the learning/activity history. */
export async function recordActivity(client, { userId, action, entityType = null, entityId = null, metadata = {} }) {
  const runner = client || { query: (text, params) => import('../config/db.js').then((m) => m.query(text, params)) };
  await runner.query(
    `INSERT INTO activity_events (user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

export async function recordActivityTx(input) {
  return withTransaction((client) => recordActivity(client, input));
}

/** Creates an in-app notification for a user (or a list of users). */
export async function notify(client, { userIds, type = 'info', title, body = '', link = null }) {
  const runner = client || (await import('../config/db.js')).pool;
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const userId of ids) {
    if (!userId) continue;
    await runner.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, link]
    );
  }
}
