import React, { useEffect, useRef, useState } from "react";
import { sendChat, sendEmote } from "../network/room.js";
import { usePlayersStore } from "../state/store.js";

const EMOTES = ["👋", "😂", "❤️", "🎉", "😢"];

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatBox({ open = true, onClose }) {
  const [text, setText] = useState("");
  const messages = usePlayersStore((s) => s.chatMessages);
  const sessionId = usePlayersStore((s) => s.sessionId);
  const players = usePlayersStore((s) => s.players);
  const listRef = useRef(null);

  const onlineCount = Object.keys(players).length;
  // 서버가 onAuth에서 검증해서 동기화해준 값이라 신뢰할 수 있음 (클라이언트가 조작 불가)
  const isAdmin = !!players[sessionId]?.isAdmin;

  // 새 메시지가 오면 항상 맨 아래로 자동 스크롤
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    sendChat(text.trim());
    setText("");
  }

  return (
    <div className={`chat-overlay ${open ? "open" : "closed"}`}>
      <div className="chat-header">
        <span className="chat-title">전체 채팅</span>
        <span className="chat-online">🟢 {onlineCount}명 접속 중</span>
        <button type="button" className="chat-close-btn" onClick={onClose} aria-label="채팅 닫기">
          ✕
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => {
          if (m.system) {
            return (
              <div key={i} className="chat-system">
                {m.message}
              </div>
            );
          }
          const isOwn = m.sessionId === sessionId;
          return (
            <div key={i} className={`chat-line ${isOwn ? "own" : ""}`}>
              <div className="chat-meta">
                <span className="chat-name">{m.name}</span>
                <span className="chat-time">{formatTime(m.timestamp)}</span>
              </div>
              <div className="chat-bubble">{m.message}</div>
            </div>
          );
        })}
      </div>

      <div className="emote-row">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => sendEmote(e)}>
            {e}
          </button>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요…"
          maxLength={200}
        />
        <button type="submit">전송</button>
      </form>

      <p className="controls-hint desktop-only">이동: W A S D · 시점: 마우스 드래그</p>
      <p className="controls-hint touch-only">이동: 왼쪽 방향 버튼 · 시점: 화면 드래그</p>
      {isAdmin && (
        <p className="admin-hint">👑 관리자 명령어: /kick 닉네임 · /ban 닉네임</p>
      )}
    </div>
  );
}
