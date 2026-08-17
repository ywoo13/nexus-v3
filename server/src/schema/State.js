import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

class Player extends Schema {
  constructor() {
    super();
    this.id = "";
    this.name = "Player";
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotationY = 0;
    this.emote = "";
    this.avatarPreset = "classic"; // 프리셋 아바타 id — client/src/components/PresetAvatarModel.jsx의 AVATAR_PRESETS 참고.
    // 외부 아바타 생성 API(Ready Player Me → MetaPerson) 없이, 코드로 직접 만든 캐릭터를 그려서
    // 외부 서비스 종료/유료화 위험을 없앴습니다.
    this.verified = false; // 구글 계정으로 로그인한 유저인지 (다른 유저에게 인증 마크 표시용)
    this.isAdmin = false; // 개발자 화이트리스트(ADMIN_EMAILS)에 포함된 계정인지
  }
}
defineTypes(Player, {
  id: "string",
  name: "string",
  x: "number",
  y: "number",
  z: "number",
  rotationY: "number",
  emote: "string",
  avatarPreset: "string",
  verified: "boolean",
  isAdmin: "boolean",
});

class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.mapId = "main"; // "main"(메인 광장) 또는 관리자가 업로드한 커스텀 방의 slug (예: "room2")
    this.modelUrl = ""; // mapId가 "main"이 아닐 때, 클라이언트가 불러올 .glb의 서버 경로 (예: "/uploads/models/room2-....glb")
  }
}
defineTypes(WorldState, {
  players: { map: Player },
  mapId: "string",
  modelUrl: "string",
});

export { Player, WorldState };
