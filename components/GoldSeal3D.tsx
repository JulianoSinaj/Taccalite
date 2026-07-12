"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "motion/react";

type SealProps = {
  scroll?: MotionValue<number>;
};

function Seal({ scroll }: SealProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const progress = scroll?.get() ?? 0;

    g.rotation.y += delta * 0.25;

    const targetX = 0.35 - state.pointer.y * 0.3 + progress * 1.4;
    const targetZ = state.pointer.x * 0.22;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.06);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, targetZ, 0.06);

    const targetScale = 1 + progress * 0.3;
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, targetScale, 0.08));
  });

  return (
    <group ref={group} rotation={[0.35, 0, 0]}>
      {/* Coin body */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.22, 96]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.88} roughness={0.28} />
      </mesh>

      {/* Rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.055, 20, 96]} />
        <meshStandardMaterial color="#e1be64" metalness={0.92} roughness={0.18} />
      </mesh>

      {/* Stamped inner disc */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.08, 1.08, 0.05, 96]} />
        <meshStandardMaterial color="#3a2314" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Emblem ring */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.03, 14, 64]} />
        <meshStandardMaterial color="#e1be64" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Central boss */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 64]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Laurel dots around the emblem */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.86, 0.17, Math.sin(a) * 0.86]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial color="#e1be64" metalness={0.85} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function GoldSeal3D({ scroll }: SealProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.55, 4.4], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[2.5, 3.5, 2]} intensity={1.6} color="#fff3d6" castShadow />
      <pointLight position={[-2.5, -1, -2]} intensity={0.7} color="#e1be64" />
      <pointLight position={[0, -2, 2.5]} intensity={0.35} color="#ffffff" />
      <Float speed={1.6} rotationIntensity={0.12} floatIntensity={0.55}>
        <Seal scroll={scroll} />
      </Float>
      <ContactShadows position={[0, -2, 0]} opacity={0.45} scale={7} blur={2.8} far={3.2} color="#000000" />
    </Canvas>
  );
}
