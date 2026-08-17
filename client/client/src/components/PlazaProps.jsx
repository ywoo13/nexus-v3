import React from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";

const WALL_HEIGHT = 2;
const PLAZA_HALF = 20;

const BENCHES = [
  [-5, 0, -4, 0],
  [5, 0, -4, 0],
  [-5, 0, 4, Math.PI],
  [5, 0, 4, Math.PI],
];

const WALLS = [
  // [x, z, width, depth] — 광장 사각 경계 (뚫고 못 나가게)
  [0, -PLAZA_HALF, PLAZA_HALF * 2, 0.5],
  [0, PLAZA_HALF, PLAZA_HALF * 2, 0.5],
  [-PLAZA_HALF, 0, 0.5, PLAZA_HALF * 2],
  [PLAZA_HALF, 0, 0.5, PLAZA_HALF * 2],
];

export default function PlazaProps() {
  return (
    <>
      {/* 중앙 분수대 — 장식 + 충돌 장애물 */}
      <RigidBody type="fixed" colliders="hull">
        <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
          <cylinderGeometry args={[1.6, 1.8, 0.8, 24]} />
          <meshStandardMaterial color="#f2ede4" roughness={0.6} />
        </mesh>
      </RigidBody>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.25, 0.35, 0.9, 16]} />
        <meshStandardMaterial color="#8fd6c1" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[1.45, 1.45, 0.02, 32]} />
        <meshStandardMaterial color="#7ec8e3" roughness={0.15} metalness={0.2} />
      </mesh>

      {/* 벤치 */}
      {BENCHES.map(([x, y, z, rot], i) => (
        <RigidBody
          key={`bench-${i}`}
          type="fixed"
          colliders="cuboid"
          position={[x, y, z]}
          rotation={[0, rot, 0]}
        >
          <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
            <boxGeometry args={[1.4, 0.5, 0.5]} />
            <meshStandardMaterial color="#d99a6c" roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}

      {/* 광장 경계 — 살짝 보이는 낮은 벽으로 이탈 방지 */}
      {WALLS.map(([x, z, w, d], i) => (
        <RigidBody key={`wall-${i}`} type="fixed" position={[x, WALL_HEIGHT / 2, z]}>
          <CuboidCollider args={[w / 2, WALL_HEIGHT / 2, d / 2]} />
          <mesh>
            <boxGeometry args={[w, WALL_HEIGHT, d]} />
            <meshStandardMaterial color="#ff9d7a" transparent opacity={0.1} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
