import { create } from "zustand";

export const usePlayersStore = create((set) => ({
  connected: false,
  sessionId: null,
  players: {},
  chatMessages: [],

  setConnected: (connected) => set({ connected }),
  setSessionId: (sessionId) => set({ sessionId }),

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
