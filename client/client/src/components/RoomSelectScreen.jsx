import React, { useEffect, useState } from "react";
import { fetchRoomList } from "../network/roomsApi.js";

// 아바타/닉네임을 정한 다음, 메인 광장과 관리자가 만든 커스텀 방(room2 등) 중 골라서 입장하는 화면.
export default function RoomSelectScreen({ onSelect, onBack, errorMessage, loading }) {
  const [rooms, setRooms] = useState(null); // null = 불러오는 중
  const [selectedSlug, setSelectedSlug] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchRoomList().then((list) => {
      if (!cancelled) setRooms(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelect(slug) {
    if (loading) return;
    setSelectedSlug(slug);
    onSelect(slug);
  }

  return (
    <div className="customizer-screen">
      <div className="avatar-creator-card">
        <h1>Nexus</h1>
        <p className="subtitle">입장할 공간을 골라주세요</p>

        {rooms === null && <p className="subtitle">방 목록을 불러오는 중…</p>}

        {rooms !== null && (
          <div className="room-select-list">
            {rooms.map((r) => (
              <button
                key={r.slug}
                type="button"
                className={`room-select-card ${selectedSlug === r.slug && loading ? "joining" : ""}`}
                onClick={() => handleSelect(r.slug)}
                disabled={loading}
              >
                <span className="room-select-emoji">{r.isMain ? "🏛️" : "🚪"}</span>
                <span className="room-select-name">{r.name}</span>
                <span className="room-select-cta">
                  {loading && selectedSlug === r.slug ? "입장 중…" : "입장하기 →"}
                </span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="text-link" onClick={onBack} disabled={loading}>
          ← 닉네임/아바타 다시 고르기
        </button>

        {errorMessage && <p className="connect-error">{errorMessage}</p>}
      </div>
    </div>
  );
}
