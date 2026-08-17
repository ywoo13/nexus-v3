import React, { useEffect, useState } from "react";
import { fetchRoomList } from "../network/roomsApi.js";
import { switchRoom } from "../network/room.js";
import { usePlayersStore } from "../state/store.js";

// 게임 중에 떠 있는 "🌐 다른 방으로 이동" 버튼 + 방 목록 패널.
// 메인 광장 ↔ 관리자가 만든 커스텀 방(room2 등) 사이를 접속을 끊지 않고 오갈 수 있게 해줍니다.
export default function RoomSwitcher() {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);
  const currentMapId = usePlayersStore((s) => s.mapId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    fetchRoomList().then((list) => {
      if (!cancelled) setRooms(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handlePick(slug) {
    if (slug === currentMapId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      await switchRoom(slug);
      setOpen(false);
    } catch (err) {
      console.error("방 이동 실패:", err);
      setError("이동에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="room-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="다른 방으로 이동"
      >
        🌐
      </button>

      {open && (
        <div className="room-switcher-panel">
          <div className="room-switcher-header">
            <span>이동할 방 고르기</span>
            <button type="button" className="chat-close-btn" onClick={() => setOpen(false)} aria-label="닫기">
              ✕
            </button>
          </div>

          {rooms === null && <p className="subtitle" style={{ margin: "8px 0" }}>불러오는 중…</p>}

          {rooms !== null && (
            <div className="room-switcher-list">
              {rooms.map((r) => {
                const isCurrent = r.slug === currentMapId;
                return (
                  <button
                    key={r.slug}
                    type="button"
                    className={`room-switcher-item ${isCurrent ? "current" : ""}`}
                    onClick={() => handlePick(r.slug)}
                    disabled={isCurrent || switching}
                  >
                    <span>{r.isMain ? "🏛️" : "🚪"} {r.name}</span>
                    {isCurrent && <span className="room-switcher-current-badge">현재 위치</span>}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="connect-error">{error}</p>}
        </div>
      )}
    </>
  );
}
