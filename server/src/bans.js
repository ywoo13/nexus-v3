import pool from "./db.js";

// 계정 식별자를 "provider:providerId" 형식의 단일 문자열로 합쳐서 bans 테이블의
// target_value로 씁니다 (예: "google:10938...", "naver:aB3xZ..."). provider/providerId
// 자체에 콜론이 올 일이 없어서(구글 sub, 네이버 id 모두 콜론을 포함하지 않는 형식) 안전합니다.
function accountKey(provider, providerId) {
  return `${provider}:${providerId}`;
}

// 게임 서버(WorldRoom)가 접속 시점에 확인하는 함수 — 계정 또는 IP 둘 중 하나라도
// 차단 목록에 있으면 접속을 거부합니다. 게스트는 계정이 없어서 IP로만 걸립니다
// (IP는 공유 네트워크/동적 IP에서는 완벽하지 않다는 한계가 있습니다).
export async function isBanned({ provider, providerId, ip }) {
  if (provider && providerId) {
    const { rows } = await pool.query(
      `SELECT id FROM bans WHERE target_type = 'account' AND target_value = $1`,
      [accountKey(provider, providerId)]
    );
    if (rows.length > 0) return true;

    // 네이버 로그인을 추가하기 전(target_type = 'account' 도입 이전)에 구글 계정으로 등록된
    // 차단 기록은 target_type이 'google_id'였습니다. 그 시절 기록도 계속 유효하게 봅니다.
    if (provider === "google") {
      const { rows: legacyRows } = await pool.query(
        `SELECT id FROM bans WHERE target_type = 'google_id' AND target_value = $1`,
        [providerId]
      );
      if (legacyRows.length > 0) return true;
    }
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

// 계정 단위 차단을 등록하는 편의 함수 — WorldRoom의 /ban 명령어가 사용합니다.
export async function banAccount(provider, providerId, reason) {
  await banTarget("account", accountKey(provider, providerId), reason);
}

export async function listBans() {
  const { rows } = await pool.query(`SELECT * FROM bans ORDER BY banned_at DESC`);
  return rows;
}

export async function unban(id) {
  await pool.query(`DELETE FROM bans WHERE id = $1`, [id]);
}
