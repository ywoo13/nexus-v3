import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "⚠️  DATABASE_URL이 설정되어 있지 않습니다. Postgres 연결 문자열을 server/.env에 넣어주세요 " +
      "(Neon, Supabase, Render Postgres 등 어디서 발급받은 것이든 상관없습니다). " +
      "로그인/차단 관련 기능이 전부 동작하지 않습니다."
  );
}

// 대부분의 호스팅형 Postgres(Neon, Supabase, Render 등)는 자체 서명 인증서를 쓰기 때문에
// rejectUnauthorized: false가 필요합니다. 로컬 개발용 DB(localhost)는 SSL 자체가 필요 없습니다.
const isLocal = connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1");
const pool = new Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Postgres 커넥션 풀 에러:", err.message);
});

export async function initDb() {
  if (!connectionString) return; // DATABASE_URL 없으면 앱 자체는 뜨되 DB 기능만 비활성
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      google_id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      avatar_preset TEXT,
      picture TEXT,
      created_at BIGINT,
      last_login_at BIGINT
    );
  `);
  // 예전(Ready Player Me → MetaPerson 시절) avatar_url/avatar_color 컬럼을 쓰던 배포본에도
  // 안전하게 적용되도록, 새 컬럼만 있으면 추가하고 옛 컬럼은 그대로 둡니다(값은 더 이상 안 씀).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_preset TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bans (
      id SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL,   -- 'google_id' (로그인 계정) 또는 'ip' (게스트)
      target_value TEXT NOT NULL,
      reason TEXT,
      banned_at BIGINT,
      UNIQUE (target_type, target_value)
    );
  `);
  // 관리자가 /manager 에서 .glb를 업로드해서 만든 추가 방(맵) 목록.
  // "main"(메인 광장)은 클라이언트에 내장된 plaza.glb를 쓰므로 이 테이블에 들어가지 않고,
  // 여기엔 admin이 업로드한 room2, room3... 같은 커스텀 방만 저장됩니다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,     -- 매치메이킹에 쓰이는 mapId (예: "room2") — URL-safe
      name TEXT NOT NULL,            -- 화면에 보여줄 방 이름 (예: "회의실")
      model_path TEXT NOT NULL,      -- 정적 서빙 경로 (예: "/uploads/models/room2-171....glb")
      created_by TEXT,               -- 참고용 (누가 올렸는지) — 현재는 매니저 유저명 정도만 기록
      created_at BIGINT
    );
  `);
  console.log("데이터베이스 스키마 확인/생성 완료 (users, bans, rooms)");
}

// ── users 테이블 ──────────────────────────────────────────────
export async function getUserByGoogleId(googleId) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  return rows[0] || null;
}

export async function upsertUser({ googleId, email, name, picture, now }) {
  await pool.query(
    `INSERT INTO users (google_id, email, name, picture, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (google_id) DO UPDATE SET
       email = EXCLUDED.email,
       picture = EXCLUDED.picture,
       last_login_at = EXCLUDED.last_login_at`,
    [googleId, email, name, picture, now]
  );
}

export async function updateUserProfile({ googleId, name, avatarPreset }) {
  await pool.query(
    `UPDATE users SET name = $2, avatar_preset = $3 WHERE google_id = $1`,
    [googleId, name, avatarPreset]
  );
}

export async function listUsers() {
  const { rows } = await pool.query(
    `SELECT google_id, email, name, avatar_preset, created_at, last_login_at
     FROM users ORDER BY last_login_at DESC`
  );
  return rows;
}

// ── rooms 테이블 (관리자가 업로드한 커스텀 방) ──────────────────
export async function listRooms() {
  const { rows } = await pool.query(`SELECT * FROM rooms ORDER BY created_at ASC`);
  return rows;
}

export async function getRoomBySlug(slug) {
  const { rows } = await pool.query(`SELECT * FROM rooms WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

export async function createRoom({ slug, name, modelPath, createdBy, now }) {
  const { rows } = await pool.query(
    `INSERT INTO rooms (slug, name, model_path, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [slug, name, modelPath, createdBy || "", now]
  );
  return rows[0];
}

export async function deleteRoomBySlug(slug) {
  const { rows } = await pool.query(`DELETE FROM rooms WHERE slug = $1 RETURNING *`, [slug]);
  return rows[0] || null;
}

export default pool;
