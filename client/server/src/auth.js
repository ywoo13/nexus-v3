import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { getUserByGoogleId, upsertUser, updateUserProfile } from "./db.js";
import { isAdminEmail } from "./admin.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const router = Router();

function issueToken(googleId) {
  return jwt.sign({ sub: googleId }, JWT_SECRET, { expiresIn: "30d", algorithm: "HS256" });
}

// 서버가 서명할 때 항상 HS256만 쓰므로, 검증할 때도 그 알고리즘만 받아들이도록 명시합니다.
// (jsonwebtoken은 verify에 algorithms를 안 주면 토큰 헤더에 적힌 알고리즘을 그대로 신뢰하는데,
// 알고리즘을 명시적으로 고정해두면 알고리즘 혼동 공격류에 대한 방어를 한 겹 더 추가할 수 있습니다.)
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

function toClientUser(row) {
  if (!row) return null;
  return {
    googleId: row.google_id,
    email: row.email,
    name: row.name || "",
    avatarPreset: row.avatar_preset || "",
    picture: row.picture || "",
    isAdmin: isAdminEmail(row.email), // ADMIN_EMAILS 화이트리스트 기준, 매 요청마다 재계산
  };
}

function isValidAvatarPreset(v) {
  return typeof v === "string" && /^[a-z0-9_-]{1,32}$/.test(v);
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// 클라이언트가 구글에서 받은 ID 토큰(credential)을 서버가 검증합니다.
// 처음 로그인하는 계정이면 DB에 새로 생성하고, 있으면 마지막 로그인 시각만 갱신합니다.
router.post("/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res
        .status(500)
        .json({ error: "서버에 GOOGLE_CLIENT_ID가 설정되어 있지 않습니다. server/.env를 확인하세요." });
    }

    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "credential이 필요합니다." });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // 구글 ID 토큰의 email 필드는 email_verified가 true일 때만 신뢰할 수 있습니다.
    // (구글 계정이 아닌 이메일로 연결된 워크스페이스 계정 등에서는 email_verified가 false일 수 있는데,
    // 이걸 확인하지 않으면 ADMIN_EMAILS 화이트리스트를 이메일 검증 없이 우회하려는 시도를 막을 수 없습니다.)
    if (payload.email && payload.email_verified === false) {
      return res.status(401).json({ error: "구글 계정의 이메일이 인증되지 않았습니다." });
    }

    const googleId = payload.sub;
    const now = Date.now();

    await upsertUser({
      googleId,
      email: payload.email || "",
      name: payload.name || "",
      picture: payload.picture || "",
      now,
    });

    const row = await getUserByGoogleId(googleId);
    const token = issueToken(googleId);

    res.json({ token, user: toClientUser(row) });
  } catch (err) {
    console.error("구글 로그인 검증 실패:", err.message);
    res.status(401).json({ error: "구글 로그인 검증에 실패했습니다." });
  }
});

// 저장해둔 앱 토큰으로 세션을 복원합니다 (재접속 시 자동 로그인용).
router.get("/session", async (req, res) => {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ error: "토큰이 없습니다." });

  try {
    const decoded = verifyToken(token);
    const row = await getUserByGoogleId(decoded.sub);
    if (!row) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    res.json({ user: toClientUser(row) });
  } catch (err) {
    res.status(401).json({ error: "유효하지 않거나 만료된 토큰입니다." });
  }
});

// 광장에 입장할 때 아바타/닉네임을 계정에 저장해서 다음에 그대로 불러올 수 있게 합니다.
router.put("/profile", async (req, res) => {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ error: "토큰이 없습니다." });

  try {
    const decoded = verifyToken(token);
    const { name, avatarPreset } = req.body;
    await updateUserProfile({
      googleId: decoded.sub,
      name: String(name || "").trim().slice(0, 16),
      avatarPreset: isValidAvatarPreset(avatarPreset) ? avatarPreset : "classic",
    });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(401).json({ error: "유효하지 않거나 만료된 토큰입니다." });
  }
});

export default router;
