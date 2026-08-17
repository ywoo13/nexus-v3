import colyseus from "colyseus";
const { Room } = colyseus;
import jwt from "jsonwebtoken";
import { WorldState, Player } from "../schema/State.js";
import { getUserByGoogleId, getRoomBySlug } from "../db.js";
import { isAdminEmail } from "../admin.js";
import { isBanned, banTarget } from "../bans.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// 채팅 도배 방지 — 클라이언트당 최근 전송 시각을 기억해뒀다가 짧은 시간에 너무 자주 보내면 무시
const CHAT_RATE_LIMIT = 5; // CHAT_RATE_WINDOW_MS 동안 허용하는 최대 메시지 수
const CHAT_RATE_WINDOW_MS = 3000;

const KICK_REASON_PREFIX = "관리자에 의해";

// 클라이언트가 보낸 값은 절대 그대로 믿지 않고 항상 형태/범위를 검증합니다.
// (타입이 안 맞거나 범위를 벗어난 값이 그대로 상태에 들어가면 다른 유저 화면까지 깨질 수 있음)
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function isValidAvatarPreset(v) {
  // client/src/components/PresetAvatarModel.jsx의 AVATAR_PRESETS id 형식과 맞춰둔 느슨한 화이트리스트.
  // 정확한 목록을 서버에도 복사해두는 대신 패턴만 검사해서, 클라이언트에 프리셋을 추가/변경해도
  // 서버 쪽을 매번 같이 고칠 필요가 없게 했습니다.
  return typeof v === "string" && /^[a-z0-9_-]{1,32}$/.test(v);
}

// server/src/manager.js에서 만드는 slug와 같은 형식(소문자/숫자/하이픈)만 mapId로 허용합니다.
// "main"은 클라이언트에 내장된 메인 광장(plaza.glb)을 가리키는 예약어입니다.
function isValidMapId(v) {
  return typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v);
}

function escapeForBroadcast(v) {
  // 채팅으로 보이는 값이라 길이만 제한 (HTML이 아니라 3D 텍스트로 렌더링되므로 XSS 위험은 없음)
  return String(v ?? "").slice(0, 64);
}

// 클라이언트가 보낸 로그인 토큰(authToken)을 서버가 직접 검증합니다.
// 클라이언트가 보낸 "verified"/"isAdmin" 값을 그냥 믿으면 개발자 도구로 누구나 조작할 수 있기 때문에,
// 반드시 서버가 JWT 서명을 검증하고 DB에서 이메일을 다시 조회해서 화이트리스트와 대조합니다.
async function resolveIdentity(authToken) {
  if (!authToken) return { verified: false, isAdmin: false, googleId: null };
  try {
    // 서명에 항상 HS256만 쓰므로, 검증도 그 알고리즘만 받아들이도록 명시해서
    // 알고리즘 혼동 공격류에 대한 방어를 한 겹 더 추가합니다.
    const decoded = jwt.verify(authToken, JWT_SECRET, { algorithms: ["HS256"] });
    const row = await getUserByGoogleId(decoded.sub);
    if (!row) return { verified: false, isAdmin: false, googleId: null };
    return { verified: true, isAdmin: isAdminEmail(row.email), googleId: decoded.sub };
  } catch {
    return { verified: false, isAdmin: false, googleId: null };
  }
}

// 프록시(Render 등) 뒤에 있다는 전제로 x-forwarded-for를 신뢰합니다.
// 프록시 없이 직접 노출된 서버라면 클라이언트가 이 헤더를 위조할 수 있으니 주의하세요.
function extractIp(request) {
  const forwarded = request?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request?.socket?.remoteAddress || "unknown";
}

export class WorldRoom extends Room {
  maxClients = 30;

  // index.js에서 gameServer.define("world", WorldRoom).filterBy(["mapId"])로 등록해뒀기 때문에,
  // mapId가 다른 joinOrCreate 요청은 서로 다른 WorldRoom 인스턴스로 분리됩니다
  // (예: mapId "main"과 "room2"는 완전히 독립된 방 — 서로의 플레이어/채팅이 안 보임).
  // onCreate가 Promise를 반환하면 colyseus 매치메이커가 완료를 기다려주므로,
  // 여기서 DB를 조회해 커스텀 방의 glb 경로를 안전하게 state에 채워둘 수 있습니다.
  async onCreate(options) {
    this.setState(new WorldState());

    const requestedMapId = isValidMapId(options?.mapId) ? options.mapId : "main";
    if (requestedMapId === "main") {
      this.state.mapId = "main";
    } else {
      // 관리자가 /manager 에서 업로드해서 만든 커스텀 방인지 DB에서 확인합니다.
      // (클라이언트가 존재하지 않는 mapId를 보내거나, 방이 삭제된 뒤에도 남아있던 링크로
      //  들어오려는 경우엔 메인 광장으로 안전하게 되돌립니다.)
      try {
        const row = await getRoomBySlug(requestedMapId);
        if (row) {
          this.state.mapId = row.slug;
          this.state.modelUrl = row.model_path;
        } else {
          this.state.mapId = "main";
        }
      } catch (err) {
        console.error("커스텀 방 정보를 불러오지 못해 메인 광장으로 대체합니다:", err.message);
        this.state.mapId = "main";
      }
    }

    // 강퇴/차단으로 나간 세션은 재접속 기회를 주지 않기 위한 표시
    this.forcedLeaveSessions = new Set();
    // 채팅 도배 방지용 최근 전송 시각 기록 — sessionId -> timestamp[].
    // ⚠️ 예전엔 모듈 최상위(top-level) Map이라 이 룸 인스턴스가 disposed된 뒤에도
    // 항목이 영영 남아있을 수 있었고, 여러 WorldRoom 인스턴스(방이 꽉 차서 새로 생성되는 경우)가
    // 같은 Map을 공유했습니다. 룸 인스턴스 프로퍼티로 옮겨서 방이 사라지면 이 상태도 함께 정리되게 합니다.
    this.chatTimestamps = new Map();

    // 이동 동기화 — 숫자가 아니거나 범위를 벗어난 값은 무시 (다른 유저 화면이 깨지는 것 방지)
    this.onMessage("move", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (
        !isFiniteNumber(data?.x) ||
        !isFiniteNumber(data?.y) ||
        !isFiniteNumber(data?.z) ||
        !isFiniteNumber(data?.rotationY)
      ) {
        return;
      }
      player.x = clamp(data.x, -100, 100);
      player.y = clamp(data.y, -10, 50);
      player.z = clamp(data.z, -100, 100);
      player.rotationY = data.rotationY;
    });

    // 이모트 (짧게 표시 후 자동 소멸) — 문자열이 아니거나 너무 길면 무시
    this.onMessage("emote", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof data?.emote !== "string" || data.emote.length === 0 || data.emote.length > 8) return;
      const emote = data.emote;
      player.emote = emote;
      setTimeout(() => {
        if (player.emote === emote) player.emote = "";
      }, 2000);
    });

    // 전체 채팅 — 관리자가 보낸 "/"로 시작하는 메시지는 명령어로 처리하고, 나머지는 도배 제한 후 브로드캐스트
    this.onMessage("chat", async (client, data) => {
      const sender = this.state.players.get(client.sessionId);
      if (!sender) return;

      const raw = String(data?.message ?? "").trim().slice(0, 200);
      if (!raw) return;

      if (sender.isAdmin && raw.startsWith("/")) {
        await this.handleAdminCommand(client, sender, raw);
        return;
      }

      const now = Date.now();
      const recent = (this.chatTimestamps.get(client.sessionId) || []).filter(
        (t) => now - t < CHAT_RATE_WINDOW_MS
      );
      if (recent.length >= CHAT_RATE_LIMIT) return; // 너무 잦으면 조용히 무시
      recent.push(now);
      this.chatTimestamps.set(client.sessionId, recent);

      this.broadcast("chat", {
        sessionId: client.sessionId,
        name: sender.name,
        message: raw,
        timestamp: now,
      });
    });

    // 아바타 갱신 (이름/프리셋) — 형식이 안 맞는 값은 무시
    this.onMessage("avatar", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof data?.name === "string" && data.name.trim()) player.name = data.name.trim().slice(0, 16);
      if (isValidAvatarPreset(data?.avatarPreset)) player.avatarPreset = data.avatarPreset;
    });
  }

  // 접속 자체를 허용할지 결정하는 단계 (onJoin보다 먼저 호출됨).
  // 여기서 IP를 확인해두고, 계정/IP가 차단 목록에 있으면 방에 들어오기 전에 막습니다.
  // 주의: colyseus 0.15.x 기준 세 번째 인자는 raw http request 객체입니다
  // (context.ip 같은 편의 API는 0.16부터라 이 버전엔 없음).
  async onAuth(client, options, request) {
    const ip = extractIp(request);
    const identity = await resolveIdentity(options?.authToken);

    if (await isBanned({ googleId: identity.googleId, ip })) {
      throw new Error("차단된 계정 또는 네트워크입니다.");
    }

    return { ip, ...identity };
  }

  onJoin(client, options) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = (typeof options?.name === "string" && options.name.trim().slice(0, 16)) || `Guest${client.sessionId.slice(0, 4)}`;
    player.x = (Math.random() - 0.5) * 6;
    player.z = (Math.random() - 0.5) * 6;
    player.avatarPreset = isValidAvatarPreset(options?.avatarPreset) ? options.avatarPreset : "classic";

    // onAuth에서 이미 검증해둔 신원을 그대로 씁니다 (JWT 재검증/DB 재조회 불필요)
    const identity = client.auth || { verified: false, isAdmin: false };
    player.verified = identity.verified;
    player.isAdmin = identity.isAdmin;

    this.state.players.set(client.sessionId, player);

    // 새로 입장한 클라이언트가 채팅 메시지 핸들러를 등록할 시간을 살짝 줍니다.
    // (joinOrCreate가 끝나자마자 바로 브로드캐스트하면 본인은 자기 입장 메시지를 못 받는 타이밍 문제가 있었음)
    setTimeout(() => {
      this.broadcast("chat", {
        system: true,
        message: `${player.name}님이 입장했습니다`,
        timestamp: Date.now(),
      });
    }, 150);
  }

  async onLeave(client, consented) {
    const player = this.state.players.get(client.sessionId);
    const wasForced = this.forcedLeaveSessions.delete(client.sessionId);

    if (!wasForced) {
      try {
        if (consented) throw new Error("consented leave");
        // 네트워크가 잠깐 끊긴 것일 수 있으니, 20초 동안 같은 클라이언트의 재접속을 기다립니다.
        // 그동안 플레이어 상태(위치/아바타 등)는 그대로 유지됩니다.
        await this.allowReconnection(client, 20);
        return; // 재접속 성공 — 퇴장 처리하지 않음
      } catch {
        // 의도적으로 나갔거나(consented), 20초 안에 재접속하지 못함 — 아래에서 정리
      }
    }
    // wasForced === true (강퇴/차단)면 재접속 기회를 주지 않고 곧바로 정리합니다.

    const name = player?.name ?? "Guest";
    this.state.players.delete(client.sessionId);
    this.chatTimestamps.delete(client.sessionId);

    this.broadcast("chat", {
      system: true,
      message: `${name}님이 퇴장했습니다`,
      timestamp: Date.now(),
    });
  }

  // ── 관리자 명령어 (채팅창에 /kick, /ban 입력 시) ──────────────────────
  // sender.isAdmin은 onAuth에서 서버가 직접 검증한 값이라 클라이언트가 위조할 수 없습니다.
  async handleAdminCommand(client, sender, raw) {
    const [cmdRaw, ...rest] = raw.slice(1).split(" ");
    const cmd = cmdRaw.toLowerCase();
    const targetName = rest.join(" ").trim();

    const replyToSender = (message) => {
      client.send("chat", { system: true, message, timestamp: Date.now() });
    };

    if (cmd !== "kick" && cmd !== "ban") {
      replyToSender(`알 수 없는 명령어예요. 사용 가능: /kick 닉네임, /ban 닉네임`);
      return;
    }

    if (!targetName) {
      replyToSender(`사용법: /${cmd} 닉네임`);
      return;
    }

    const target = this.findClientByName(targetName);
    if (!target) {
      replyToSender(`"${escapeForBroadcast(targetName)}" 님을 찾을 수 없어요 (접속 중인 유저만 대상이 됩니다).`);
      return;
    }

    if (target.client.sessionId === client.sessionId) {
      replyToSender("자기 자신은 대상으로 할 수 없어요.");
      return;
    }

    if (target.player.isAdmin) {
      replyToSender("다른 관리자는 대상으로 할 수 없어요.");
      return;
    }

    const targetDisplayName = escapeForBroadcast(target.player.name);

    if (cmd === "kick") {
      this.forcedLeaveSessions.add(target.client.sessionId);
      target.client.leave(4000, `${KICK_REASON_PREFIX} 추방되었습니다`);
      this.broadcast("chat", {
        system: true,
        message: `👢 ${targetDisplayName}님이 관리자에 의해 추방되었습니다`,
        timestamp: Date.now(),
      });
      return;
    }

    // ban: 계정(google_id)과 IP 둘 다 알고 있으면 둘 다 차단 목록에 기록 (게스트는 IP만)
    const auth = target.client.auth || {};
    const reason = `admin:${sender.name}`;
    if (auth.googleId) await banTarget("google_id", auth.googleId, reason);
    if (auth.ip && auth.ip !== "unknown") await banTarget("ip", auth.ip, reason);

    this.forcedLeaveSessions.add(target.client.sessionId);
    target.client.leave(4001, `${KICK_REASON_PREFIX} 차단되었습니다`);
    this.broadcast("chat", {
      system: true,
      message: `🚫 ${targetDisplayName}님이 관리자에 의해 차단되었습니다`,
      timestamp: Date.now(),
    });
  }

  findClientByName(name) {
    const lower = name.toLowerCase();
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p && p.name.toLowerCase() === lower) return { client: c, player: p };
    }
    return null;
  }
}
