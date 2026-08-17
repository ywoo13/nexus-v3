import React, { useState } from "react";
import { Loader } from "@react-three/drei";
import World from "./scenes/World.jsx";
import AvatarCustomizer from "./components/AvatarCustomizer.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import ChatBox from "./components/ChatBox.jsx";
import SplashScreen from "./components/SplashScreen.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import TouchDPad from "./components/TouchDPad.jsx";
import TouchActionButtons from "./components/TouchActionButtons.jsx";
import RoomSelectScreen from "./components/RoomSelectScreen.jsx";
import RoomSwitcher from "./components/RoomSwitcher.jsx";
import GraphicsSettings from "./components/GraphicsSettings.jsx";
import { connectToWorld } from "./network/room.js";
import { usePlayersStore } from "./state/store.js";
import { restoreSession, loginWithGoogle, saveProfile, clearToken } from "./auth/session.js";

// splash(로고) -> authChecking(저장된 로그인 확인) -> auth(구글 로그인/게스트)
// -> avatar(아바타 생성/닉네임) -> roomSelect(입장할 방 고르기) -> connecting(서버 접속 중) -> world(입장 완료)
export default function App() {
  const [phase, setPhase] = useState("splash");
  const [connectError, setConnectError] = useState(null);
  const [googleUser, setGoogleUser] = useState(null);
  const [initialAvatarData, setInitialAvatarData] = useState(null);
  // avatar 단계에서 정한 닉네임/아바타를 roomSelect 단계로 넘겨서, 어느 방을 고르든 그대로 씁니다.
  const [pendingProfile, setPendingProfile] = useState(null);
  // 데스크톱(마우스)은 기본으로 채팅을 펼쳐두고, 터치 기기는 화면 확보를 위해 기본으로 접어둠
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return !window.matchMedia("(pointer: coarse)").matches;
  });
  const connected = usePlayersStore((s) => s.connected);
  const switchingRoom = usePlayersStore((s) => s.switchingRoom);

  // 스플래시가 끝나면 저장된 로그인이 있는지 먼저 확인합니다.
  async function handleSplashFinish() {
    setPhase("authChecking");
    const user = await restoreSession();
    if (user) {
      applyGoogleUser(user);
    } else {
      setPhase("auth");
    }
  }

  function applyGoogleUser(user) {
    setGoogleUser(user);
    setInitialAvatarData({
      avatarPreset: user.avatarPreset,
      name: user.name,
    });
    setPhase("avatar");
  }

  async function handleGoogleLogin(credential) {
    const user = await loginWithGoogle(credential);
    applyGoogleUser(user);
  }

  function handleGuest() {
    setGoogleUser(null);
    setInitialAvatarData(null);
    setPhase("avatar");
  }

  function handleLogout() {
    clearToken();
    setGoogleUser(null);
    setInitialAvatarData(null);
    setPhase("auth");
  }

  // AvatarCustomizer에서 닉네임/아바타를 정하면 바로 접속하지 않고, 어느 방에 들어갈지부터 고르게 합니다.
  function handleAvatarNext({ name, avatarPreset }) {
    setPendingProfile({ name, avatarPreset });
    setConnectError(null);
    setPhase("roomSelect");
  }

  async function handleJoin(mapId) {
    if (!pendingProfile) return;
    setConnectError(null);
    setPhase("connecting");
    try {
      await connectToWorld({ ...pendingProfile, mapId });
      if (googleUser) {
        // 계정에 로그인된 상태면 이번에 고른 아바타/닉네임을 저장해서
        // 다음 접속 때 자동으로 불러오게 합니다 (실패해도 게임 진행엔 지장 없음).
        saveProfile(pendingProfile);
      }
      setPhase("world");
    } catch (err) {
      console.error("서버 접속 실패:", err);
      setConnectError("서버에 접속하지 못했습니다. 서버가 켜져 있는지 확인해주세요.");
      setPhase("roomSelect");
    }
  }

  if (phase === "splash") {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (phase === "authChecking") {
    return <LoadingScreen label="로그인 확인 중…" />;
  }

  if (phase === "auth") {
    return <AuthScreen onLogin={handleGoogleLogin} onGuest={handleGuest} />;
  }

  if (phase === "avatar") {
    return (
      <AvatarCustomizer
        onNext={handleAvatarNext}
        initialData={initialAvatarData}
        googleUser={googleUser}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === "roomSelect" || phase === "connecting") {
    // RoomSelectScreen을 접속 중에도 계속 마운트 상태로 유지해서, 접속 실패 시
    // 골랐던 방 목록/선택이 초기화되지 않도록 합니다.
    return (
      <>
        <RoomSelectScreen
          onSelect={handleJoin}
          onBack={() => setPhase("avatar")}
          errorMessage={connectError}
          loading={phase === "connecting"}
        />
        {phase === "connecting" && <LoadingScreen label="접속하는 중…" />}
      </>
    );
  }

  return (
    <div className="app-shell">
      <World />
      <ChatBox open={chatOpen} onClose={() => setChatOpen(false)} />
      <RoomSwitcher />
      <GraphicsSettings />
      <TouchDPad />
      <TouchActionButtons />
      {!chatOpen && (
        <button
          type="button"
          className="chat-toggle-btn"
          onClick={() => setChatOpen(true)}
          aria-label="채팅 열기"
        >
          💬
        </button>
      )}
      {/* 3D 에셋(GLB 아바타 등)이 로딩 중일 때 자동으로 진행률 표시 */}
      <Loader
        containerStyles={{ background: "rgba(20, 19, 31, 0.85)" }}
        innerStyles={{ background: "#ff7a59" }}
        barStyles={{ background: "#6bcfa6" }}
        dataStyles={{ color: "#f5f3ef" }}
      />
      {!connected && !switchingRoom && (
        <div className="reconnect-banner">서버와 연결이 끊어졌습니다…</div>
      )}
    </div>
  );
}
