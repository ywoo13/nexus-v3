import { create } from "zustand";

// 저사양 기기에서 렉이 있을 때 그래픽 효과를 낮출 수 있게 해주는 설정.
// localStorage에 저장해서, 한 번 꺼두면 다음에 다시 들어와도 그대로 유지됩니다.
const STORAGE_KEY = "nexus-graphics-settings";

const DEFAULTS = {
  highQuality: true, // SoftShadows(부드러운 그림자) + Bloom/Vignette/채도 후처리 + 높은 그림자 해상도
  filmGrain: true, // 아래 filmGrainEffect.js 커스텀 셰이더 — 필름 그레인(노이즈) + 살짝의 색수차
};

function loadInitial() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      highQuality: typeof parsed.highQuality === "boolean" ? parsed.highQuality : DEFAULTS.highQuality,
      filmGrain: typeof parsed.filmGrain === "boolean" ? parsed.filmGrain : DEFAULTS.filmGrain,
    };
  } catch {
    return DEFAULTS; // localStorage가 막혀있거나 값이 손상된 경우 기본값으로
  }
}

function persist(next) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패(시크릿 모드 등)해도 이번 세션 안에서는 정상 동작하므로 조용히 무시
  }
}

export const useGraphicsSettings = create((set, get) => ({
  ...loadInitial(),
  setHighQuality: (highQuality) => {
    const next = { ...get(), highQuality };
    persist(next);
    set({ highQuality });
  },
  setFilmGrain: (filmGrain) => {
    const next = { ...get(), filmGrain };
    persist(next);
    set({ filmGrain });
  },
}));
