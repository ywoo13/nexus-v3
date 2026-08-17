import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { listUsers, listRooms, createRoom, deleteRoomBySlug } from "./db.js";
import { requireBasicAuth } from "./basicAuth.js";
import { listBans, unban } from "./bans.js";
import { saveModelFile, deleteModelFile } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── 방(맵) 업로드 — 관리자가 /manager 에서 .glb를 올려 room2, room3... 를 만듭니다 ──────
// 파일을 메모리에 버퍼로만 받아두고, 실제 저장(Supabase Storage 또는 로컬 디스크)은
// storage.js가 대신 처리합니다 — 어느 쪽을 쓰는지는 SUPABASE_URL 설정 여부로 자동 결정됩니다.

// 한글 이름/공백을 서버 저장 파일명·매치메이킹 mapId에는 못 쓰므로 URL-safe한 slug로 변환합니다.
// (화면에 보여줄 이름은 그대로 name 컬럼에 따로 저장해두고, slug는 내부 식별자로만 씁니다)
function slugify(input) {
  const base = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 40) || "room";
}

async function uniqueSlug(base) {
  const existing = new Set((await listRooms()).map((r) => r.slug));
  if (!existing.has(base) && base !== "main") return base; // "main"은 메인 광장 예약어라 못 씀
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB — 맵 하나 치고는 넉넉하지만 무한 업로드는 막아둠
  fileFilter: (_req, file, cb) => {
    // .gltf(+ 별도 텍스처/bin 파일들)는 파일 하나로 안 끝나서 이 업로드 방식으론 지원하지 않고,
    // 자체 포함형(self-contained) 바이너리인 .glb만 받습니다.
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext !== ".glb") {
      cb(new Error("GLB_ONLY"));
      return;
    }
    cb(null, true);
  },
});

// GET /manager — 대시보드 페이지 (비밀번호 필요)
router.get("/", requireBasicAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "../admin/manager.html"));
});

// GET /manager/api/users — 가입된 계정 목록 (비밀번호 필요, 이메일 등 개인정보 포함이라 별도 보호)
router.get("/api/users", requireBasicAuth, async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "목록을 불러오지 못했습니다." });
  }
});

// GET /manager/api/bans — 차단 목록 (게임 안에서 /ban 명령어로 등록된 것 포함)
router.get("/api/bans", requireBasicAuth, async (_req, res) => {
  try {
    const bans = await listBans();
    res.json({ bans });
  } catch (err) {
    res.status(500).json({ error: "목록을 불러오지 못했습니다." });
  }
});

// DELETE /manager/api/bans/:id — 차단 해제
router.delete("/api/bans/:id", requireBasicAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "잘못된 id입니다." });
  }
  try {
    await unban(id);
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "차단 해제에 실패했습니다." });
  }
});

// GET /manager/api/rooms — 관리자가 업로드한 커스텀 방 목록 (메인 광장은 여기 안 나옴, 클라이언트 내장 자산이라)
router.get("/api/rooms", requireBasicAuth, async (_req, res) => {
  try {
    const rooms = await listRooms();
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: "방 목록을 불러오지 못했습니다." });
  }
});

// POST /manager/api/rooms — multipart/form-data: name(방 이름), model(.glb 파일) → room2 같은 새 방 생성
router.post("/api/rooms", requireBasicAuth, (req, res) => {
  upload.single("model")(req, res, async (err) => {
    if (err) {
      const message =
        err.message === "GLB_ONLY"
          ? "자체 포함형(self-contained) .glb 파일만 업로드할 수 있어요."
          : err.code === "LIMIT_FILE_SIZE"
            ? "파일이 너무 큽니다 (최대 150MB)."
            : "업로드에 실패했습니다.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "model 필드에 .glb 파일을 첨부해주세요." });
    }

    const name = String(req.body?.name || "").trim().slice(0, 40) || "새로운 방";
    let modelPath = null;

    try {
      const slug = await uniqueSlug(slugify(req.body?.name));
      const finalFilename = `${slug}-${Date.now()}.glb`;
      modelPath = await saveModelFile(req.file.buffer, finalFilename); // Supabase Storage 또는 로컬 디스크 (자동 판단)

      const now = Date.now();
      const room = await createRoom({
        slug,
        name,
        modelPath,
        createdBy: req.headers.authorization ? "manager" : "",
        now,
      });
      res.json({ room });
    } catch (dbErr) {
      // 파일 저장은 성공했는데 DB 저장에 실패한 경우, 고아 파일이 남지 않도록 정리 시도
      if (modelPath) deleteModelFile(modelPath).catch(() => {});
      console.error("방 생성 실패:", dbErr.message);
      res.status(500).json({ error: "방을 만들지 못했습니다." });
    }
  });
});

// DELETE /manager/api/rooms/:slug — 커스텀 방 삭제 (DB row + 저장된 .glb 파일 함께 정리)
router.delete("/api/rooms/:slug", requireBasicAuth, async (req, res) => {
  try {
    const deleted = await deleteRoomBySlug(req.params.slug);
    if (!deleted) return res.status(404).json({ error: "방을 찾을 수 없습니다." });

    await deleteModelFile(deleted.model_path).catch((err) => {
      console.warn("모델 파일 삭제 중 문제가 있었지만 방 삭제는 계속 진행합니다:", err.message);
    });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "방을 삭제하지 못했습니다." });
  }
});

export default router;
