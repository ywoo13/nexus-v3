import React from "react";

// ⚠️ 임시 배경입니다. 나중에 Blender로 만든 실제 광장 GLTF 맵이 완성되면
// 이 컴포넌트 전체를 교체하면 됩니다 (World.jsx에서 <PlazaBackdrop /> 한 줄만 바꾸면 됨).

const BUILDING_COLORS = ["#f4a988", "#8fd6c1", "#f2ede4", "#7ec8e3", "#f7c59f"];

// 인덱스 기반 의사-난수 (매 렌더마다 값이 바뀌지 않도록 Math.random 대신 사용)
function pseudo(i, mod, min) {
  return min + ((i * 37 + 11) % mod);
}

function makeRow(count, spread, fixedAxis, fixedValue, seedOffset = 0) {
  const buildings = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
    const seed = i + seedOffset;
    const height = pseudo(seed, 7, 4); // 4~10
    const width = pseudo(seed, 3, 3); // 3~5
    const depth = pseudo(seed, 3, 3); // 3~5
    const color = BUILDING_COLORS[seed % BUILDING_COLORS.length];
    const pos =
      fixedAxis === "z"
        ? [t, height / 2, fixedValue] // 북/남쪽 면: x축을 따라 배치
        : [fixedValue, height / 2, t]; // 동/서쪽 면: z축을 따라 배치
    buildings.push({ key: `${fixedAxis}-${fixedValue}-${i}`, pos, height, width, depth, color });
  }
  return buildings;
}

const BUILDINGS = [
  ...makeRow(6, 46, "z", -28, 0),
  ...makeRow(6, 46, "z", 28, 20),
  ...makeRow(5, 40, "x", -28, 40),
  ...makeRow(5, 40, "x", 28, 60),
];

const LAMP_POSITIONS = [
  [-10, 0, -10],
  [10, 0, -10],
  [-10, 0, 10],
  [10, 0, 10],
];

const TREE_POSITIONS = [
  [-8, 0, 0],
  [8, 0, 0],
  [0, 0, -8],
  [0, 0, 8],
];

function Building({ pos, height, width, depth, color }) {
  return (
    <group position={pos}>
      <mesh castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* 옥상 포인트 조명 느낌의 작은 악센트 */}
      <mesh position={[0, height / 2 + 0.15, 0]}>
        <boxGeometry args={[width * 0.3, 0.3, depth * 0.3]} />
        <meshStandardMaterial color="#ff9d7a" emissive="#ff7a59" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function LampPost({ pos }) {
  return (
    <group position={pos}>
      <mesh castShadow position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 2.8, 8]} />
        <meshStandardMaterial color="#3d3a4d" />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color="#ffe8c2" emissive="#ffcf8a" emissiveIntensity={1.2} />
      </mesh>
      <pointLight position={[0, 2.85, 0]} intensity={0.6} distance={6} color="#ffd9a0" />
    </group>
  );
}

function Tree({ pos }) {
  return (
    <group position={pos}>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 1, 8]} />
        <meshStandardMaterial color="#8a6144" />
      </mesh>
      <mesh castShadow position={[0, 1.35, 0]}>
        <coneGeometry args={[0.75, 1.5, 10]} />
        <meshStandardMaterial color="#6bcfa6" roughness={0.8} />
      </mesh>
    </group>
  );
}

export default function PlazaBackdrop() {
  return (
    <>
      {/* 바닥 장식 패턴 — 분수대 주변 원형 포장 */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 6.5, 48]} />
        <meshStandardMaterial color="#f2ede4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.5, 6.8, 48]} />
        <meshStandardMaterial color="#ff9d7a" roughness={0.9} />
      </mesh>

      {TREE_POSITIONS.map((pos, i) => (
        <Tree key={`tree-${i}`} pos={pos} />
      ))}

      {LAMP_POSITIONS.map((pos, i) => (
        <LampPost key={`lamp-${i}`} pos={pos} />
      ))}

      {/* 광장 외곽 임시 스카이라인 (실제 맵 나오면 교체) */}
      {BUILDINGS.map((b) => (
        <Building key={b.key} {...b} />
      ))}
    </>
  );
}
