import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { getUserByProviderId, upsertUser, updateUserProfile } from "./db.js";
import { isAdminEmail } from "./admin.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
// 네이버 개발자센터(https://developers.naver.com/apps)에 등록한 "Callback URL"과
// 정확히 일치해야 합니다 (프로토콜/도메인/경로 전부). 기본값은 로컬 개발용입니다.
const NAVER_REDIRECT_URI =
  process.env.NAVER_REDIRECT_URI || "http://localhost:2567/api/auth/naver/callback";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const IS_PROD = process.env.NODE_ENV === "production";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const router = Router();

// 앱이 자체 발급하는 로그인 토큰(JWT)의 subject는 "provider:providerId" 조합입니다.
// (구글만 있던 시절엔 구글 sub 하나였지만, 네이버가 추가되면서 어느 로그인 제공자로
// 로그인했는지도 함께 담아야 계정을 정확히 특정할 수 있습니다.)
function issueToken(provider, providerId) {
  return jwt.sign({ sub: providerId, provider }, JWT_SECRET, {
    expiresIn: "30d",
    algorithm: "HS256",
  });
}

// 서버가 서명할 때 항상 HS256만 쓰므로, 검증할 때도 그 알고리즘만 받아들이도록 명시합니다.
// (jsonwebtoken은 verify에 algorithms를 안 주면 토큰 헤더에 적힌 알고리즘을 그대로 신뢰하는데,
// 알고리즘을 명시적으로 고정해두면 알고리즘 혼동 공격류에 대한 방어를 한 겹 더 추가할 수 있습니다.)
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

// 네이버 로그인을 추가하기 전에 발급된 토큰은 payload가 { sub: googleId }뿐이고
// provider 필드가 없습니다. 그런 예전 토큰도 30일 만료 전까지는 계속 유효해야 하므로,
// provider가 없으면 항상 "google"이었던 것으로 취급합니다.
function identityFromDecoded(decoded) {
  return { provider: decoded.provider || "google", providerId: decoded.sub };
}

function toClientUser(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    providerId: row.provider_id,
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

// req.headers.cookie를 파싱합니다. 이 프로젝트는 쿠키를 네이버 로그인의 CSRF 방지용
// state 하나에만 짧게(5분) 쓰기 때문에, cookie-parser 의존성을 새로 추가하는 대신
// 간단히 직접 파싱합니다.
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// 네이버 로그인 팝업이 끝났을 때, 부모 창(우리 클라이언트 페이지)에만 결과를 전달하도록
// postMessage의 targetOrigin을 제한합니다. ALLOWED_ORIGIN이 설정되어 있으면 그 목록만,
// 안 되어 있으면(로컬 개발) localhost/127.0.0.1만 허용합니다.
function isAllowedClientOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin) {
    return allowedOrigin.split(",").map((o) => o.trim()).includes(origin);
  }
  try {
    const u = new URL(origin);
    return (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      (u.protocol === "http:" || u.protocol === "https:")
    );
  } catch {
    return false;
  }
}

// 팝업 창을 닫으면서 부모 창에 postMessage로 결과를 전달하는 작은 HTML 페이지.
// payload(JSON)를 <script> 안에 그대로 심어야 하는데, 문자열 안에 "</script>"나 "<"가
// 섞여 있으면 그 지점에서 스크립트 태그가 조기 종료되어 나머지가 그대로 HTML로 렌더링될 수
// 있습니다(XSS 위험). "<"를 전부 유니코드 이스케이프로 바꿔서 이 문제를 막습니다 —
// JSON.parse는 \u003c를 정상적으로 "<"로 되돌려주므로 데이터 자체는 손상되지 않습니다.
function popupResultHtml(targetOrigin, payload) {
  const safeOrigin = JSON.stringify(targetOrigin || "");
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Nexus 로그인</title></head>
<body>
<script>
  (function () {
    var targetOrigin = ${safeOrigin};
    var payload = ${safePayload};
    try {
      if (window.opener && targetOrigin) {
        window.opener.postMessage(payload, targetOrigin);
      }
    } finally {
      window.close();
    }
  })();
</script>
<p>로그인 창을 닫는 중입니다. 자동으로 닫히지 않으면 이 창을 직접 닫아주세요.</p>
</body></html>`;
}

// ── 구글 로그인 ──────────────────────────────────────────────────────────
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

    const providerId = payload.sub;
    const now = Date.now();

    await upsertUser({
      provider: "google",
      providerId,
      email: payload.email || "",
      name: payload.name || "",
      picture: payload.picture || "",
      now,
    });

    const row = await getUserByProviderId("google", providerId);
    const token = issueToken("google", providerId);

    res.json({ token, user: toClientUser(row) });
  } catch (err) {
    console.error("구글 로그인 검증 실패:", err.message);
    res.status(401).json({ error: "구글 로그인 검증에 실패했습니다." });
  }
});

// ── 네이버 로그인 ─────────────────────────────────────────────────────────
// 네이버는 구글과 달리 클라이언트 JS만으로 끝나는 ID 토큰 방식이 아니라, 서버가 CLIENT_SECRET을
// 들고 있어야 하는 전통적인 OAuth2 인가 코드(authorization code) 방식만 지원합니다. 그래서 흐름이
// 조금 다릅니다 (전부 서버가 주도):
//
//   1. 클라이언트가 작은 팝업 창을 GET /api/auth/naver/start 로 엽니다.
//   2. 이 라우트가 CSRF 방지용 state를 만들어 쿠키에 잠깐(5분) 저장해두고,
//      네이버 로그인 페이지로 리다이렉트합니다.
//   3. 사용자가 네이버에서 로그인/동의하면 네이버가 GET /api/auth/naver/callback 으로 되돌려줍니다.
//   4. 콜백이 (a) state가 쿠키 값과 일치하는지 검증하고 (b) 인가 코드를 access_token으로 교환하고
//      (c) 그 토큰으로 네이버 프로필을 조회해서 계정을 만들거나 갱신한 뒤, 우리 앱 JWT를 발급합니다.
//   5. 팝업이 window.opener.postMessage로 부모 창(클라이언트 SPA)에 토큰을 전달하고 스스로 닫힙니다.
//      (클라이언트/서버가 서로 다른 도메인에 배포되므로, URL 파라미터에 토큰을 실어 리다이렉트하는
//      대신 postMessage를 씁니다 — 토큰이 브라우저 히스토리/Referer에 남지 않습니다.)

router.get("/naver/start", (req, res) => {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return res
      .status(500)
      .send("서버에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되어 있지 않습니다. server/.env를 확인하세요.");
  }

  const origin = typeof req.query.origin === "string" ? req.query.origin : "";
  if (!isAllowedClientOrigin(origin)) {
    return res.status(400).send("허용되지 않은 origin 입니다.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 5 * 60 * 1000,
    path: "/api/auth/naver",
  };
  res.cookie("naver_oauth_state", state, cookieOpts);
  res.cookie("naver_oauth_origin", origin, cookieOpts);

  const authorizeUrl = new URL("https://nid.naver.com/oauth2.0/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", NAVER_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", NAVER_REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
});

router.get("/naver/callback", async (req, res) => {
  const cookies = parseCookies(req);
  const expectedState = cookies.naver_oauth_state;
  const clientOrigin = cookies.naver_oauth_origin;

  // state 쿠키는 1회용이라 결과가 어떻든 바로 지웁니다.
  res.clearCookie("naver_oauth_state", { path: "/api/auth/naver" });
  res.clearCookie("naver_oauth_origin", { path: "/api/auth/naver" });

  // 팝업 자체가 postMessage를 보낼 수 없는 상황(쿠키 유실 등)이면 targetOrigin이 없어
  // 조용히 창만 닫습니다. 있으면 실패 사유를 담아 postMessage로 알려줍니다.
  const sendError = (message) => {
    res.status(200).send(
      popupResultHtml(clientOrigin, { type: "nexus-naver-auth-error", error: message })
    );
  };

  if (req.query.error) {
    // 사용자가 네이버 동의 화면에서 취소한 경우 등
    return sendError("네이버 로그인이 취소되었습니다.");
  }

  const { code, state } = req.query;
  if (!code || !state || !expectedState || state !== expectedState) {
    return sendError("로그인 요청이 유효하지 않습니다. 다시 시도해주세요.");
  }

  try {
    const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
    tokenUrl.searchParams.set("grant_type", "authorization_code");
    tokenUrl.searchParams.set("client_id", NAVER_CLIENT_ID);
    tokenUrl.searchParams.set("client_secret", NAVER_CLIENT_SECRET);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("state", state);
    tokenUrl.searchParams.set("redirect_uri", NAVER_REDIRECT_URI);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("네이버 토큰 교환 실패:", tokenData);
      return sendError("네이버 로그인 검증에 실패했습니다.");
    }

    const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    if (!profileRes.ok || profileData.resultcode !== "00" || !profileData.response?.id) {
      console.error("네이버 프로필 조회 실패:", profileData);
      return sendError("네이버 프로필을 불러오지 못했습니다.");
    }

    const providerId = profileData.response.id;
    const now = Date.now();

    await upsertUser({
      provider: "naver",
      providerId,
      // email/name/profile_image는 네이버 앱 등록 시 "제공 항목"에서 활성화하고 사용자가
      // 동의해야 내려옵니다 — 동의하지 않았다면 비어있을 수 있습니다.
      email: profileData.response.email || "",
      name: profileData.response.name || profileData.response.nickname || "",
      picture: profileData.response.profile_image || "",
      now,
    });

    const row = await getUserByProviderId("naver", providerId);
    const token = issueToken("naver", providerId);

    res.status(200).send(
      popupResultHtml(clientOrigin, {
        type: "nexus-naver-auth",
        token,
        user: toClientUser(row),
      })
    );
  } catch (err) {
    console.error("네이버 로그인 처리 중 오류:", err.message);
    sendError("네이버 로그인 처리 중 오류가 발생했습니다.");
  }
});

// ── 공통 (로그인 제공자와 무관) ──────────────────────────────────────────

// 저장해둔 앱 토큰으로 세션을 복원합니다 (재접속 시 자동 로그인용).
router.get("/session", async (req, res) => {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ error: "토큰이 없습니다." });

  try {
    const decoded = verifyToken(token);
    const { provider, providerId } = identityFromDecoded(decoded);
    const row = await getUserByProviderId(provider, providerId);
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
    const { provider, providerId } = identityFromDecoded(decoded);
    const { name, avatarPreset } = req.body;
    await updateUserProfile({
      provider,
      providerId,
      name: String(name || "").trim().slice(0, 16),
      avatarPreset: isValidAvatarPreset(avatarPreset) ? avatarPreset : "classic",
    });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(401).json({ error: "유효하지 않거나 만료된 토큰입니다." });
  }
});

export default router;
