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

  // ── users 테이블: provider(google/naver) + provider_id 조합을 계정 식별자로 씁니다 ──
  // 새로 만드는 DB는 처음부터 이 구조로 생성됩니다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      provider TEXT NOT NULL DEFAULT 'google',
      provider_id TEXT NOT NULL,
      email TEXT,
      name TEXT,
      avatar_preset TEXT,
      picture TEXT,
      created_at BIGINT,
      last_login_at BIGINT,
      PRIMARY KEY (provider, provider_id)
    );
  `);

  // 네이버 로그인을 추가하기 전(v1/v2)에 만들어진 DB는 `google_id TEXT PRIMARY KEY` 하나만 있고
  // provider/provider_id 컬럼이 없습니다. 그런 기존 DB를 새 구조로 안전하게 옮겨줍니다.
  // (CREATE TABLE IF NOT EXISTS는 테이블이 이미 있으면 아무 일도 안 하므로, 이 블록이 실제 마이그레이션을 담당합니다.)
  const { rows: existingCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
  );
  const colNames = new Set(existingCols.map((c) => c.column_name));

  if (colNames.has("google_id") && !colNames.has("provider_id")) {
    console.log(
      "users 테이블을 provider/provider_id 구조로 마이그레이션합니다 " +
        "(기존 google_id 단일 컬럼 → 여러 로그인 제공자를 지원하는 구조로 전환, 네이버 로그인 추가에 따른 변경)…"
    );
    await pool.query(`ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'google';`);
    await pool.query(`ALTER TABLE users ADD COLUMN provider_id TEXT;`);
    await pool.query(`UPDATE users SET provider_id = google_id WHERE provider_id IS NULL;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN provider_id SET NOT NULL;`);
    // google_id에 걸려있던 PRIMARY KEY를 내리고 (provider, provider_id) 조합으로 새 PK를 만듭니다.
    // 제약 이름 "users_pkey"는 CREATE TABLE에서 인라인 PRIMARY KEY를 쓸 때 Postgres가 항상 이렇게
    // 자동으로 붙이는 이름이라 안전하게 고정해서 참조할 수 있습니다.
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;`);
    await pool.query(
      `ALTER TABLE users ADD CONSTRAINT users_provider_provider_id_key PRIMARY KEY (provider, provider_id);`
    );
    console.log("마이그레이션 완료. 기존 google_id 컬럼은 참고용으로 남겨뒀습니다 (더 이상 조회에는 쓰이지 않습니다).");
  }

  // 예전(Ready Player Me → MetaPerson 시절) avatar_url/avatar_color 컬럼을 쓰던 배포본에도
  // 안전하게 적용되도록, 새 컬럼만 있으면 추가하고 옛 컬럼은 그대로 둡니다(값은 더 이상 안 씀).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_preset TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bans (
      id SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL,   -- 'account' (로그인 계정, "provider:providerId" 형식) 또는 'ip' (게스트)
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
export async function getUserByProviderId(provider, providerId) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  );
  return rows[0] || null;
}

// 하위 호환용 — 예전 코드가 구글 계정만 조회하던 자리에서 그대로 쓸 수 있도록 남겨둡니다.
export async function getUserByGoogleId(googleId) {
  return getUserByProviderId("google", googleId);
}

export async function upsertUser({ provider, providerId, email, name, picture, now }) {
  await pool.query(
    `INSERT INTO users (provider, provider_id, email, name, picture, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (provider, provider_id) DO UPDATE SET
       email = EXCLUDED.email,
       picture = EXCLUDED.picture,
       last_login_at = EXCLUDED.last_login_at`,
    [provider, providerId, email, name, picture, now]
  );
}

export async function updateUserProfile({ provider, providerId, name, avatarPreset }) {
  await pool.query(
    `UPDATE users SET name = $3, avatar_preset = $4 WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId, name, avatarPreset]
  );
}

export async function listUsers() {
  const { rows } = await pool.query(
    `SELECT provider, provider_id, email, name, avatar_preset, created_at, last_login_at
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
