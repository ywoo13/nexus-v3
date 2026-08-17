import { API_BASE } from "../auth/session.js";

// 메인 광장은 클라이언트에 내장된 plaza.glb를 쓰는 고정 옵션이라 서버 목록에 없어도 항상 존재합니다.
export const MAIN_ROOM = { slug: "main", name: "메인 광장", modelUrl: null, isMain: true };

// 입장 화면 / 게임 안 "다른 방으로 이동" 메뉴가 공통으로 쓰는 방 목록 조회.
// 서버(관리자가 /manager 에서 만든 커스텀 방)가 잠깐 안 붙거나 DB가 비어있어도
// 메인 광장만큼은 항상 고를 수 있도록 실패 시에도 [MAIN_ROOM]을 반환합니다.
export async function fetchRoomList() {
  try {
    const res = await fetch(`${API_BASE}/api/rooms`);
    if (!res.ok) return [MAIN_ROOM];
    const data = await res.json();
    const custom = Array.isArray(data.rooms) ? data.rooms : [];
    return [MAIN_ROOM, ...custom.map((r) => ({ ...r, isMain: false }))];
  } catch (err) {
    console.warn("방 목록을 불러오지 못했습니다:", err);
    return [MAIN_ROOM];
  }
}
