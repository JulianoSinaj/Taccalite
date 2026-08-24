"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer } from "@react-three/drei";
import * as THREE from "three";

const RING_TEXT = "NORCINERIA TACCALITE · ANCONA · DAL 1946 · ";

/**
 * Draws the seal face to a canvas: ring text around the rim, a rule, and the
 * monogram. Used as the coin's colour map (and, at low intensity, its bump map)
 * so the mark reads as struck into the metal.
 *
 * Deliberately canvas rather than drei's <Text>: that would need a typeface
 * fetched at runtime, and every asset on this page has to be local.
 */
function useSealTexture() {
  return useMemo(() => {
    const SIZE = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const c = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#2a1a10";
    ctx.strokeStyle = "#2a1a10";

    // Ring text, laid letter by letter around the rim.
    const radius = SIZE * 0.395;
    ctx.font = "600 40px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = (Math.PI * 2) / RING_TEXT.length;
    for (let i = 0; i < RING_TEXT.length; i++) {
      const char = RING_TEXT[i];
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(i * step - Math.PI / 2);
      ctx.translate(0, -radius);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }

    // Two hairlines bracketing the ring text.
    for (const r of [SIZE * 0.345, SIZE * 0.44]) {
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Monogram.
    ctx.font = "600 300px Georgia, 'Times New Roman', serif";
    ctx.fillText("T", c, c + 14);

    // Sprigs either side of the monogram — the norcina's herbs, abstracted.
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(c + dir * SIZE * 0.185, c);
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(0, 46);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 22);
        ctx.lineTo(dir * 20, i * 22 - 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/**
 * Tells the parent the moment the coin is worth looking at.
 *
 * The first frames of this scene are not. The canvas has to be measured before
 * it has a size to draw into, `<ContactShadows>` renders its shadow map from
 * inside the loop, and `<Float>` starts at a random phase — so the opening
 * frames are some mix of empty, unshadowed and mid-lurch. Revealing the canvas
 * on mount is what made the seal appear half-built and then snap into place.
 *
 * Counting a handful of frames costs nothing and means the parent only ever
 * cross-fades to a finished picture. No priority argument: any `useFrame` above
 * zero would take over the render loop and nothing would draw at all.
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  const fired = useRef(false);

  useFrame(() => {
    if (fired.current) return;
    frames.current += 1;
    if (frames.current < 4) return;
    fired.current = true;
    // One more rAF, so the frame we just counted is on the glass before the
    // parent starts fading the flat seal out from under it.
    requestAnimationFrame(() => onReady?.());
  });

  return null;
}

/**
 * Keeps the scene's clock to time the visitor was actually here for.
 *
 * three's `Clock` measures wall time and rAF does not run in a hidden tab, so a
 * page left in the background hands the first frame back on return a delta of
 * however long it sat there — minutes, as a single tick. Nothing downstream
 * clamps it: react-three-fiber passes `clock.getDelta()` to `useFrame` raw, and
 * drei's `<Float>` reads `clock.elapsedTime`. So the turn below advances by tens
 * of radians and the bob jumps to an unrelated phase, and what the returning
 * visitor sees is the seal snapping somewhere else the moment they look at it.
 *
 * Pushing `oldTime` up to now on the way back in swallows the gap: the next
 * delta is one frame, and because `elapsedTime` only ever grows by deltas it is
 * never advanced across the pause either, so the bob resumes on the phase it
 * stopped at. The coin carries on exactly where the visitor left it.
 */
function SteadyClock() {
  const clock = useThree((state) => state.clock);

  useEffect(() => {
    function onVisible() {
      if (document.hidden) return;
      clock.oldTime = performance.now();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [clock]);

  return null;
}

/**
 * Reports the GPU taking the drawing context away, and giving it back.
 *
 * A backgrounded tab is where this actually happens: the driver reclaims memory
 * from what nobody is looking at. three handles its own half well — it calls
 * `preventDefault` so the browser will offer the context back, refuses to render
 * while it is gone, and rebuilds its GL state on restore — but none of that is
 * visible to the parent, and the parent is the one holding the flat seal at zero
 * opacity underneath. Left unreported, a lost context is a blank canvas over a
 * hidden foil mark: an empty corner where the brand should be, for the life of
 * the page.
 *
 * Listeners rather than the renderer's own state so nothing has to be polled
 * from inside a loop that, while the context is gone, is not running anyway.
 */
function ContextGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [canvas, onLost, onRestored]);

  return null;
}

function Coin() {
  const group = useRef<THREE.Group>(null);
  const face = useSealTexture();

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // Slow, constant turn — the coin is always alive even without a pointer.
    g.rotation.y += delta * 0.22;
    // Tilt follows the cursor, eased so it settles rather than snaps.
    const targetX = 0.42 - state.pointer.y * 0.26;
    const targetZ = state.pointer.x * 0.18;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.05);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, targetZ, 0.05);
  });

  return (
    <group ref={group} rotation={[0.42, 0, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.2, 128]} />
        <meshStandardMaterial color="#e6bf6b" metalness={0.9} roughness={0.26} />
      </mesh>

      {/* Raised rim. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.05, 24, 128]} />
        <meshStandardMaterial color="#f5d98f" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* The struck faces, a hair above and below the blank so they never
          z-fight. Low metalness here on purpose: this layer is the dark ink
          pressed into the metal, not more metal. */}
      {face &&
        ([1, -1] as const).map((side) => (
          <mesh
            key={side}
            position={[0, side * 0.101, 0]}
            rotation={[(side * -Math.PI) / 2, 0, 0]}
          >
            <circleGeometry args={[1.5, 128]} />
            <meshStandardMaterial
              map={face}
              transparent
              metalness={0.1}
              roughness={0.6}
              depthWrite={false}
            />
          </mesh>
        ))}
    </group>
  );
}

type Seal3DProps = {
  /** Fired once the canvas has painted frames worth revealing. */
  onReady?: () => void;
  /**
   * Fired when the GPU takes the drawing context away — the canvas is blank from
   * that instant, so whatever is layered under it has to come back.
   *
   * If the context is restored, `onReady` fires again on the other side of it:
   * the two are a pair, and the second one is not a one-shot.
   */
  onLost?: () => void;
};

/**
 * The brand seal as struck gold.
 *
 * A metal needs something to reflect. `meshStandardMaterial` at high `metalness`
 * with only direct lights renders almost black — which is exactly what the first
 * pass of this component did, a dark disc where the gold seal should be. The
 * usual fix, `<Environment preset="…">`, fetches an HDR from a CDN and would put
 * the hero on the network. So the environment is built in-scene instead: a few
 * `<Lightformer>` panels rendered to a cubemap, giving the gold a bright sheet to
 * catch and a warm one to glance off, with no external asset.
 */
export default function Seal3D({ onReady, onLost }: Seal3DProps) {
  // Bumped on every restored context, purely to re-key <ReadySignal/> below.
  // Its frame count is a one-shot by design, and a restored context needs it to
  // be a one-shot again rather than a spent one — remounting is the whole reset.
  const [context, setContext] = useState(0);

  const handleLost = useCallback(() => onLost?.(), [onLost]);
  const handleRestored = useCallback(() => setContext((n) => n + 1), []);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.5, 4.6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 3]} intensity={2.2} color="#fff6e2" castShadow />
      <directionalLight position={[-3, 1, -2]} intensity={0.7} color="#e8eef8" />

      <Environment resolution={256}>
        {/* A big soft key overhead — the sheet the gold reflects. */}
        <Lightformer form="rect" intensity={5} position={[0, 4, 2]} scale={[10, 10, 1]} color="#fffaf0" />
        {/* Warm bounce from below: the paper throwing light back up. */}
        <Lightformer form="rect" intensity={2.4} position={[0, -3, 1]} scale={[8, 6, 1]} color="#ffe6bb" />
        {/* Cool edge so the rim separates from a white page. */}
        <Lightformer form="ring" intensity={2} position={[-4, 1, -2]} scale={[5, 5, 1]} color="#dbe6f5" />
      </Environment>

      <SteadyClock />
      <ContextGuard onLost={handleLost} onRestored={handleRestored} />
      <ReadySignal key={context} onReady={onReady} />

      <Float speed={1.4} rotationIntensity={0.1} floatIntensity={0.5}>
        <Coin />
      </Float>
      <ContactShadows
        position={[0, -2.05, 0]}
        opacity={0.22}
        scale={7}
        blur={3.2}
        far={3}
        color="#2a1a10"
      />
    </Canvas>
  );
}
