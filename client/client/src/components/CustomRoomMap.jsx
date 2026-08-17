import React, { Suspense, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";

// PlazaMap.jsx의 dispose 로직과 동일 — 방을 나갈 때(또는 다른 방으로 옮길 때) GPU/메모리에
// 예전 모델의 geometry/material/texture가 남아있지 않도록 완전히 정리합니다.
function disposeScene(scene) {
  if (!scene) return;
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        Object.keys(mat).forEach((key) => {
          const value = mat[key];
          if (value && typeof value.dispose === "function") value.dispose();
        });
        mat.dispose();
      });
    }
  });
}

// 관리자가 올린 .glb를 못 찾았거나(삭제됨 등) 아직 서버에서 modelUrl을 못 받았을 때 보여주는
// 아주 단순한 바닥 — 최소한 사람이 무한히 낙하하지는 않게 해줍니다.
function EmptyRoomFloor() {
  return (
    <RigidBody type="fixed">
      <CuboidCollider args={[20, 0.1, 20]} position={[0, -0.1, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#cfd8e3" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

function LoadedRoom({ url }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    // PlazaMap.jsx의 RealMap과 동일한 이유로 켜줍니다 — 안 켜면 관리자가 올린 커스텀 방은
    // 조명/그림자를 전혀 받지 않는 밋밋한 모습이 됩니다.
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return () => {
      disposeScene(scene);
      useGLTF.clear(url);
    };
  }, [scene, url]);

  return (
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={scene} />
    </RigidBody>
  );
}

// useGLTF는 로딩 실패(파일이 지워졌거나 아직 안 만들어졌을 때)를 렌더링 중 에러로 던지므로,
// 별도 에러 바운더리로 잡아서 빈 바닥으로 대체합니다 (PlazaMap.jsx의 MapErrorBoundary와 동일 패턴).
class RoomErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.info("[Nexus] 커스텀 방의 .glb를 불러오지 못해 빈 바닥을 대신 표시합니다.", error?.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// url이 바뀔 때마다(=다른 방으로 이동) 이 컴포넌트를 통째로 remount시켜서(부모가 key={mapId}로 처리)
// 에러 바운더리 상태도 함께 초기화되도록 합니다.
export default function CustomRoomMap({ url }) {
  if (!url) return <EmptyRoomFloor />;

  return (
    <RoomErrorBoundary fallback={<EmptyRoomFloor />}>
      <Suspense fallback={<EmptyRoomFloor />}>
        <LoadedRoom url={url} />
      </Suspense>
    </RoomErrorBoundary>
  );
}
