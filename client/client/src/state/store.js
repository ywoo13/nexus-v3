import { create } from "zustand";

export const usePlayersStore = create((set) => ({
  connected: false,
  sessionId: null,
  players: {},
  chatMessages: [],
  // 현재 입장해있는 방. "main"이면 클라이언트 내장 plaza.glb, 그 외엔 관리자가 업로드한 커스텀 방
  // (modelUrl은 서버가 room.state로 내려주는 상대 경로, 예: "/uploads/models/room2-....glb")
  mapId: "main",
  modelUrl: "",
  // 방 이동(switchRoom) 도중에는 잠깐 connected가 false가 되는데, 이때 "연결 끊김" 배너가
  // 잘못 뜨지 않도록 App.jsx가 이 값을 함께 확인합니다.
  switchingRoom: false,

  setConnected: (connected) => set({ connected }),
  setSessionId: (sessionId) => set({ sessionId }),
  setMapInfo: (mapId, modelUrl) => set({ mapId, modelUrl: modelUrl || "" }),
  setSwitchingRoom: (switchingRoom) => set({ switchingRoom }),

  upsertPlayer: (id, data) =>
    set((state) => ({
      players: { ...state.players, [id]: { ...state.players[id], ...data } },
    })),

  removePlayer: (id) =>
    set((state) => {
      const players = { ...state.players };
      delete players[id];
      return { players };
    }),

  // 연결이 완전히 끊겨서 더 이상 갱신되지 않는 플레이어 목록을 한 번에 비웁니다.
  // (재접속 실패 후에도 예전 위치에 그대로 남아있는 "유령 플레이어" 방지)
  resetPlayers: () => set({ players: {} }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-49), msg],
    })),
}));
