import { Client } from "colyseus.js";
import { usePlayersStore } from "../state/store.js";
import { getToken } from "../auth/session.js";

const ENDPOINT = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
const client = new Client(ENDPOINT);

let room = null;
let reconnecting = false;
// switchRoom()이 다음 방에 다시 입장할 때 재사용할 마지막 닉네임/아바타.
// (방을 옮길 때마다 닉네임/아바타를 다시 고르게 하지 않기 위함)
let lastJoinOptions = null;

// WebSocket 정상 종료 코드. 이 코드로 끊겼으면 의도적인 퇴장(leave() 호출 등)이라
// 재접속을 시도하지 않습니다. 그 외에는 네트워크 문제일 수 있으니 재접속을 시도합니다.
const NORMAL_CLOSE_CODE = 1000;
const RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000;

function attachRoomHandlers(activeRoom) {
  const store = usePlayersStore.getState();
  store.setSessionId(activeRoom.sessionId);
  store.setConnected(true);
  store.setSwitchingRoom(false);

  // 지금 어느 방(mapId)에 들어와 있는지 + 그 방의 커스텀 .glb 경로.
  // "main"이 아닌 방은 서버가 onCreate에서 DB를 조회해 modelUrl을 채워 보내줍니다.
  const syncMapInfo = () => store.setMapInfo(activeRoom.state.mapId, activeRoom.state.modelUrl);
  syncMapInfo();
  activeRoom.state.onChange(syncMapInfo);

  activeRoom.state.players.onAdd((player, sessionId) => {
    store.upsertPlayer(sessionId, { ...player });
    player.onChange(() => {
      store.upsertPlayer(sessionId, { ...player });
    });
  });

  activeRoom.state.players.onRemove((_player, sessionId) => {
    store.removePlayer(sessionId);
  });

  activeRoom.onMessage("chat", (msg) => {
    store.addChatMessage(msg);
  });

  activeRoom.onLeave((code) => {
    handleDisconnect(activeRoom, code);
  });
}

// 연결이 끊겼을 때: 의도적 퇴장이 아니면 몇 차례 재접속을 시도하고,
// 그래도 실패하면 화면에 남아있는 다른 유저들(유령 상태)을 정리합니다.
async function handleDisconnect(disconnectedRoom, code) {
  const store = usePlayersStore.getState();
  store.setConnected(false);

  if (code === NORMAL_CLOSE_CODE || reconnecting || disconnectedRoom !== room) {
    // 의도적 퇴장이거나, 이미 재접속을 새로 성공해서 room이 교체된 뒤라면 여기서 끝
    if (disconnectedRoom === room) store.resetPlayers();
    return;
  }

  reconnecting = true;
  const reconnectionToken = disconnectedRoom.reconnectionToken;
  let reconnected = false;

  for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && !reconnected; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_BASE_DELAY_MS * (attempt + 1)));
    try {
      const newRoom = await client.reconnect(reconnectionToken);
      room = newRoom;
      // 끊겨있던 동안 나간 다른 유저가 있을 수 있어서, 목록을 비우고 새 room의 현재 상태로 다시 채웁니다.
      // (안 비우면 이미 나간 사람이 화면에 유령처럼 남아있을 수 있음)
      store.resetPlayers();
      attachRoomHandlers(newRoom);
      reconnected = true;
    } catch {
      // 다음 시도로 넘어감
    }
  }

  reconnecting = false;

  if (!reconnected) {
    // 재접속 완전히 실패 — 더 이상 갱신되지 않는 다른 유저들을 화면에서 지웁니다.
    store.setConnected(false);
    store.resetPlayers();
  }
}

export async function connectToWorld({ name, avatarPreset, mapId }) {
  // authToken은 서버(WorldRoom)가 직접 서명을 검증해서 로그인/관리자 여부를 판단합니다.
  // 클라이언트가 "verified: true" 같은 값을 그냥 보내면 개발자 도구로 조작될 수 있어서 신뢰하지 않습니다.
  // mapId가 다르면 서버(index.js의 filterBy(["mapId"]))가 완전히 별개의 방으로 분리해줍니다.
  lastJoinOptions = { name, avatarPreset };
  room = await client.joinOrCreate("world", {
    name,
    avatarPreset,
    mapId: mapId || "main",
    authToken: getToken(),
  });
  attachRoomHandlers(room);
  return room;
}

// 게임 중 다른 방(메인 광장 ↔ room2 ↔ ...)으로 이동합니다.
// 지금 방은 정상적으로(consented) 나가고, 같은 닉네임/아바타로 새 방에 다시 입장합니다.
export async function switchRoom(mapId) {
  if (!lastJoinOptions) throw new Error("아직 입장하지 않은 상태에서는 방을 옮길 수 없습니다.");
  if (usePlayersStore.getState().mapId === mapId) return room; // 이미 그 방에 있으면 아무것도 안 함

  const store = usePlayersStore.getState();
  store.setSwitchingRoom(true);

  const previousRoom = room;
  if (previousRoom) {
    try {
      await previousRoom.leave(true); // consented=true → 코드 1000(정상 종료), 재접속 시도 안 함
    } catch (err) {
      console.warn("이전 방을 나가는 중 문제가 있었지만 계속 진행합니다:", err);
    }
  }

  store.resetPlayers();

  try {
    room = await client.joinOrCreate("world", {
      ...lastJoinOptions,
      mapId,
      authToken: getToken(),
    });
    attachRoomHandlers(room); // 성공 시 내부에서 setSwitchingRoom(false)까지 처리됨
    return room;
  } catch (err) {
    store.setSwitchingRoom(false);
    store.setConnected(false);
    throw err;
  }
}

export function getCurrentMapId() {
  return usePlayersStore.getState().mapId;
}

export function sendMove(x, y, z, rotationY) {
  room?.send("move", { x, y, z, rotationY });
}

export function sendEmote(emote) {
  room?.send("emote", { emote });
}

export function sendChat(message) {
  room?.send("chat", { message });
}

export function updateAvatar({ name, avatarPreset }) {
  room?.send("avatar", { name, avatarPreset });
}
