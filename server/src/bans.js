import pool from "./db.js";

// 게임 서버(WorldRoom)가 접속 시점에 확인하는 함수 — 계정(google_id) 또는 IP 둘 중 하나라도
// 차단 목록에 있으면 접속을 거부합니다. 게스트는 계정이 없어서 IP로만 걸립니다
// (IP는 공유 네트워크/동적 IP에서는 완벽하지 않다는 한계가 있습니다).
export async function isBanned({ googleId, ip }) {
  if (googleId) {
    const { rows } = await pool.query(
      `SELECT id FROM bans WHERE target_type = 'google_id' AND target_value = $1`,
      [googleId]
    );
    if (rows.length > 0) return true;
  }
  if (ip && ip !== "unknown") {
    const { rows } = await pool.query(
      `SELECT id FROM bans WHERE target_type = 'ip' AND target_value = $1`,
      [ip]
    );
    if (rows.length > 0) return true;
  }
  return false;
}

export async function banTarget(targetType, targetValue, reason) {
  if (!targetValue) return;
  await pool.query(
    `INSERT INTO bans (target_type, target_value, reason, banned_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (target_type, target_value) DO UPDATE SET
       reason = EXCLUDED.reason,
       banned_at = EXCLUDED.banned_at`,
    [targetType, targetValue, reason || "", Date.now()]
  );
}

export async function listBans() {
  const { rows } = await pool.query(`SELECT * FROM bans ORDER BY banned_at DESC`);
  return rows;
}

export async function unban(id) {
  await pool.query(`DELETE FROM bans WHERE id = $1`, [id]);
}
