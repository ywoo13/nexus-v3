import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { listUsers } from "./db.js";
import { requireBasicAuth } from "./basicAuth.js";
import { listBans, unban } from "./bans.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

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

export default router;
