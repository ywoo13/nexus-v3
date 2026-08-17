import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 관리자가 /manager 에서 올린 .glb를 어디에 저장할지 ─────────────────────
// SUPABASE_SERVICE_ROLE_KEY만 설정하면 Supabase Storage(오브젝트 스토리지)에 올려서 영구 보관합니다.
// SUPABASE_URL은 따로 안 넣어도 됩니다 — DATABASE_URL이 이미 Supabase Postgres 연결 문자열이면
// 거기서 프로젝트 주소를 자동으로 추출합니다 (같은 프로젝트의 DB/Storage를 같이 쓰는 가장 흔한 경우).
// DATABASE_URL이 Supabase가 아니거나(Neon 등) 아예 없는 경우에만 SUPABASE_URL을 직접 적어주면 됩니다.
// 아무것도 못 찾으면 예전처럼 server/uploads/models/ 로컬 디스크에 저장합니다
// (로컬 개발은 이걸로 충분하지만, Render 무료 플랜처럼 파일 시스템이 재배포마다 초기화되는
//  호스팅에 배포한다면 반드시 Supabase Storage(또는 다른 외부 스토리지)를 설정해야 파일이 안 사라집니다).
function deriveSupabaseUrlFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return null;
  try {
    const u = new URL(databaseUrl);
    // 직접 연결: db.<project-ref>.supabase.co
    const direct = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (direct) return `https://${direct[1]}.supabase.co`;
    // 커넥션 풀러(Supavisor): aws-0-xxx.pooler.supabase.com, 유저명이 "postgres.<project-ref>"
    if (u.hostname.endsWith(".pooler.supabase.com")) {
      const pooled = decodeURIComponent(u.username || "").match(/^postgres\.([a-z0-9]+)$/);
      if (pooled) return `https://${pooled[1]}.supabase.co`;
    }
  } catch {
    // DATABASE_URL이 없거나 URL 형식이 아니면 그냥 무시하고 아래에서 로컬 디스크로 대체
  }
  return null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || deriveSupabaseUrlFromDatabaseUrl(process.env.DATABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "room-models";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }, // 서버 전용 클라이언트 — 브라우저 세션 저장 불필요
      })
    : null;

export const usingSupabaseStorage = !!supabase;

const localUploadsDir = path.join(__dirname, "../uploads/models");
if (!supabase) fs.mkdirSync(localUploadsDir, { recursive: true });

if (supabase) {
  const derived = !process.env.SUPABASE_URL;
  console.log(
    `관리자 방(.glb) 업로드: Supabase Storage 사용 (버킷: "${SUPABASE_BUCKET}", URL ${derived ? "DATABASE_URL에서 자동 추출" : "환경변수로 직접 지정"})`
  );
} else if (SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_URL) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY는 설정되어 있지만 SUPABASE_URL을 못 찾았습니다 " +
      "(DATABASE_URL이 Supabase 형식이 아닌 것 같습니다). server/.env에 SUPABASE_URL을 직접 추가해주세요. " +
      "지금은 로컬 디스크(server/uploads/models)로 대체합니다."
  );
} else {
  console.log(
    "관리자 방(.glb) 업로드: 로컬 디스크(server/uploads/models) 사용 " +
      "— 배포 환경에서는 SUPABASE_SERVICE_ROLE_KEY를 설정해 Supabase Storage로 바꾸는 걸 권장합니다."
  );
}

// buffer를 저장하고, 클라이언트가 바로 fetch할 수 있는 경로/URL을 돌려줍니다.
// - Supabase: 버킷이 public이면 영구 공개 URL(https://...supabase.co/storage/v1/object/public/...)
// - 로컬: 서버가 직접 서빙하는 상대 경로("/uploads/models/xxx.glb") — index.js가 이 경로를 static으로 열어둠
export async function saveModelFile(buffer, filename) {
  if (supabase) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filename, buffer, { contentType: "model/gltf-binary", upsert: false });
    if (error) throw new Error(`Supabase Storage 업로드 실패: ${error.message}`);

    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
    return data.publicUrl; // 절대 URL — DB의 model_path에 그대로 저장
  }

  const filePath = path.join(localUploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/models/${filename}`; // 상대 경로 — 클라이언트가 서버 주소를 붙여서 씀
}

// 방 삭제 시 파일도 함께 정리합니다. modelPath가 절대 URL이면 Supabase에서, 상대 경로면 로컬에서 지웁니다.
// (둘 중 어느 쪽이든 실패해도 방 삭제 자체는 계속 진행되도록 호출부에서 에러를 무시합니다)
export async function deleteModelFile(modelPath) {
  if (!modelPath) return;

  if (/^https?:\/\//.test(modelPath)) {
    if (!supabase) return; // Supabase가 설정 안 된 상태에서 예전에 올렸던 URL이면 지울 방법이 없어 조용히 넘어감
    const filename = decodeURIComponent(modelPath.split("/").pop());
    await supabase.storage.from(SUPABASE_BUCKET).remove([filename]);
    return;
  }

  const filePath = path.join(__dirname, "..", modelPath.replace(/^\//, ""));
  fs.unlink(filePath, () => {}); // 파일이 이미 없어도 조용히 넘어감
}
