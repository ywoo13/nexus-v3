import "dotenv/config"; // 반드시 다른 import보다 먼저 — .env 값을 이후 모듈들이 읽을 수 있도록
import { fileURLToPath } from "url";
import path from "path";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import colyseus from "colyseus";
const { Server, matchMaker } = colyseus;
import { monitor } from "@colyseus/monitor";
import { WorldRoom } from "./rooms/WorldRoom.js";
import authRouter from "./auth.js";
import managerRouter from "./manager.js";
import { requireBasicAuth } from "./basicAuth.js";
import { initDb, listRooms } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 2567);
const app = express();

// 기본 보안 헤더 (X-Content-Type-Options, X-Frame-Options 등).
// 아바타 생성기/구글 iframe, glTF 등 외부 리소스를 쓰고, 클라이언트(Render Static Site)와 서버(Render Web Service)가
// 서로 다른 도메인이라 CSP/COEP/CORP 기본값은 끄거나 완화해서 켭니다.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-me") {
  console.warn(
    "⚠️  JWT_SECRET이 기본값이거나 설정되어 있지 않습니다. 로그인 토큰이 위조될 수 있으니 " +
      "server/.env에 랜덤 문자열로 반드시 설정하세요 (배포 전 필수)."
  );
}

// Content-Type: application/json, Authorization 헤더를 쓰는 요청(구글 로그인/프로필 저장)은
// 브라우저가 먼저 OPTIONS로 preflight를 보냅니다. cors 패키지가 이걸 자동으로 처리해줍니다.
// ALLOWED_ORIGIN을 지정하면 그 도메인만 허용하고, 안 정해두면 전체 허용(개발 기본값)입니다.
//
// ⚠️ 이 CORS 설정은 /api/auth 에만 적용합니다 (아래에서 라우터별로 지정).
// 예전엔 app.use(cors(...))로 전역 적용했는데, 그러면 Basic Auth로 보호되는
// /manager, /monitor 까지 크로스 오리진 요청을 허용하게 됩니다. Basic Auth는 브라우저가
// 매 요청에 자동으로 인증정보를 붙이는 방식이라, 전역 CORS + 인증 없이 접근 허용이 합쳐지면
// 관리자가 /manager에 로그인한 채로 악성 사이트를 열었을 때 그 사이트가 배경에서
// 가입자 이메일을 읽거나(GET) 차단을 해제하는(DELETE) 요청을 조용히 실행할 수 있는
// CSRF/정보유출 취약점이 됩니다. /manager, /monitor는 아예 CORS를 안 걸어서
// 브라우저가 크로스 오리진 요청 자체를 차단하게 둡니다 (같은 페이지 안에서의
// 요청은 CORS 대상이 아니라서 정상 동작에는 영향 없음).
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const authCors = cors({
  origin: allowedOrigin ? allowedOrigin.split(",") : true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
app.use(express.json());

// 서버 접속 시 보이는 시작 페이지 (public/index.html)
app.use(express.static(path.join(__dirname, "../public")));

// 로컬 디스크 모드로 저장된 .glb 파일들 — 3D 에셋이라 클라이언트(다른 도메인)가 fetch/three.js로
// 직접 읽어와야 하므로 이 경로에는 CORS를 열어둡니다 (개인정보가 없는 정적 파일이라 안전합니다).
// Supabase Storage 모드(SUPABASE_URL 설정됨)에서는 파일이 여기가 아니라 Supabase의 공개 URL로
// 직접 서빙되므로 이 라우트는 그냥 안 쓰입니다 — 남겨둬도 무해합니다.
app.use("/uploads", cors({ origin: true }), express.static(path.join(__dirname, "../uploads")));

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });

// mapId가 다른 join 요청은 서로 다른 방 인스턴스로 분리합니다 (메인 광장 vs room2 vs room3...).
// server/src/rooms/WorldRoom.js의 onCreate가 mapId를 검증하고 DB에서 모델 경로를 채워넣습니다.
gameServer.define("world", WorldRoom).filterBy(["mapId"]);

// 입장 화면에서 "메인 광장 / room2 / ..." 중 고를 수 있도록 보여주는 공개 목록 API.
// 관리자 전용 정보(누가 올렸는지 등)는 빼고 화면에 필요한 것만 내려줍니다.
app.get("/api/rooms", cors({ origin: true }), async (_req, res) => {
  try {
    const rooms = await listRooms();
    res.json({
      rooms: rooms.map((r) => ({
        slug: r.slug,
        name: r.name,
        modelUrl: r.model_path,
      })),
    });
  } catch (err) {
    // rooms 테이블 조회 실패(DB 미설정 등)해도 메인 광장은 항상 입장 가능해야 하므로 빈 목록으로 응답
    res.json({ rooms: [] });
  }
});

// 구글 로그인 / 세션 복원 / 프로필 저장 — 짧은 시간에 너무 잦은 요청은 차단 (무차별 대입/남용 방지)
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});
app.use("/api/auth", authCors, authRateLimiter, authRouter);

// 개발자 전용 관리 페이지 (MANAGER_USER/MANAGER_PASSWORD 필요) — 비밀번호 대입 시도 자체를 늦춤
// (CORS는 의도적으로 안 걸어서 다른 도메인에서의 요청 자체가 브라우저 단에서 막히게 함)
const managerRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/manager", managerRateLimiter, managerRouter);

// 시작 페이지에서 폴링하는 실시간 서버 상태 API
app.get("/api/status", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "world" });
    const totalClients = rooms.reduce((sum, room) => sum + room.clients, 0);
    res.json({
      status: "ok",
      rooms: rooms.length,
      players: totalClients,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.use("/monitor", requireBasicAuth, monitor());

// users/bans 테이블이 없으면 만들어둡니다 (Postgres). DATABASE_URL이 없으면 경고만 남기고 넘어갑니다.
await initDb();

gameServer.listen(port);
console.log(`Colyseus server listening on ws://localhost:${port}`);
console.log(`Start page: http://localhost:${port}`);
console.log(`Room monitor: http://localhost:${port}/monitor`);
