import { query } from '../config/db.js';
import logger from '../config/logger.js';

/**
 * XP awards. The ledger (xp_events) is unique per (user, source), so an
 * award can be attempted from several code paths and still lands only once.
 * Awards are fail-soft: a problem here must never break the lab, submission
 * or enrollment flow that triggered it.
 */
export const XP_RULES = {
  labCompleted: 50,
  submissionApproved: 100,
  courseCompleted: 150,
};

const LEVEL_STEP = 250;

/** Level 1 starts at 0 XP; every 250 XP is another level. */
export function levelFor(xp) {
  const safe = Math.max(0, Number(xp) || 0);
  const level = Math.floor(safe / LEVEL_STEP) + 1;
  return {
    level,
    levelStart: (level - 1) * LEVEL_STEP,
    nextLevelAt: level * LEVEL_STEP,
  };
}

export async function awardXp(runner, { userId, points, sourceType, sourceId }) {
  if (!userId || !points || points <= 0 || !sourceType || sourceId == null) return false;
  const run =
    runner && typeof runner.query === 'function'
      ? runner
      : { query: (text, params) => query(text, params) };
  try {
    const { rows } = await run.query(
      `INSERT INTO xp_events (user_id, points, source_type, source_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, source_type, source_id) DO NOTHING
       RETURNING id`,
      [userId, points, sourceType, sourceId]
    );
    if (!rows[0]) return false;
    await run.query(`UPDATE users SET xp_points = xp_points + $2 WHERE id = $1`, [userId, points]);
    return true;
  } catch (error) {
    logger.warn('XP award failed', { userId, sourceType, sourceId, error: error.message });
    return false;
  }
}
