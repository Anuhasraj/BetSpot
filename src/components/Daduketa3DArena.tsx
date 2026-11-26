import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Crosshair, Eye, RotateCcw } from 'lucide-react';
import { DiceRollEvent } from '../domain/DiceBoard';
import { DiceFace, TierId } from '../domain/types';
import { soundFx } from '../services/SoundFxService';
import {
  createArenaEnclosureEnvironment,
  createCourtyardGround,
  createCrowdSpectators,
  createDaduketaDie,
  createHumanThrower,
  createPlankEnclosure,
} from '../three/daduketaModels';
import {
  createDaduketaTextures,
  getTargetQuaternionForFace,
  ROOM_ARENA_THEMES,
} from '../three/daduketaTextures';
import { AvatarFrame } from './AvatarFrame';

interface Daduketa3DArenaProps {
  tierId?: TierId;
  pendingRoll: DiceRollEvent | null;
  lastRoll: DiceRollEvent | null;
  currentTurnPlayer?: {
    username: string;
    avatarUrl?: string;
    frameId?: string;
    country?: string;
    countdownProgress?: number;
  } | null;
  watchOnly?: boolean;
  canAim?: boolean;
  autoAimView?: boolean;
}

const OPPOSITE_MAP: Record<DiceFace, DiceFace> = {
  3: 18,
  18: 3,
  6: 15,
  15: 6,
  9: 12,
  12: 9,
};

const DEFAULT_AIM_X = 0;
const DEFAULT_AIM_Y = 0.72;

// Pre-allocated scratch math objects (zero allocations inside render loop or pointer handlers)
const _handWorld = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _spinEuler = new THREE.Euler();
const _camGoal = new THREE.Vector3();
const _lookCurrent = new THREE.Vector3(-0.15, 0.85, 0);
const _lookGoal = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _strikeWorldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _hitPointWorld = new THREE.Vector3();
const _hitPointLocal = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') ||
      probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

export const Daduketa3DArena: React.FC<Daduketa3DArenaProps> = ({
  tierId = TierId.TIER_1,
  pendingRoll,
  lastRoll,
  currentTurnPlayer,
  watchOnly = false,
  canAim,
  autoAimView = false,
}) => {
  const effectiveCanAim = canAim ?? !watchOnly;
  const theme = ROOM_ARENA_THEMES[tierId] ?? ROOM_ARENA_THEMES[TierId.TIER_1];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [forcePerspectivePreview, setForcePerspectivePreview] = useState<boolean>(false);
  const [isDieStoppedTopView, setIsDieStoppedTopView] = useState<boolean>(false);
  const [hasCustomAim, setHasCustomAim] = useState<boolean>(false);

  const aimRef = useRef<{
    x: number;
    y: number;
    isCustom: boolean;
    isDragging: boolean;
    isHovered: boolean;
  }>({
    x: DEFAULT_AIM_X,
    y: DEFAULT_AIM_Y,
    isCustom: false,
    isDragging: false,
    isHovered: false,
  });

  const sceneStateRef = useRef<{
    pendingId: string | null;
    pendingFace: DiceFace | null;
    rollStartedAt: number;
    strikeFired: boolean;
    bounceFired: boolean;
    chimeFired: boolean;
    lastRollId: string | null;
    lastFace: DiceFace | null;
    forcePerspective: boolean;
    canAim: boolean;
    throwAim: { x: number; y: number };
  }>({
    pendingId: null,
    pendingFace: null,
    rollStartedAt: 0,
    strikeFired: false,
    bounceFired: false,
    chimeFired: false,
    lastRollId: lastRoll?.id ?? null,
    lastFace: lastRoll?.face ?? null,
    forcePerspective: false,
    canAim: effectiveCanAim,
    throwAim: { x: DEFAULT_AIM_X, y: DEFAULT_AIM_Y },
  });

  useEffect(() => {
    sceneStateRef.current.canAim = effectiveCanAim;
    if (!effectiveCanAim) {
      aimRef.current.isDragging = false;
      aimRef.current.isHovered = false;
    }
  }, [effectiveCanAim]);

  // Automatically bring up the behind-player 3D plank aiming view when it becomes the user's roll turn
  useEffect(() => {
    if (autoAimView && !pendingRoll && lastRoll) {
      setForcePerspectivePreview(true);
      sceneStateRef.current.forcePerspective = true;
      setIsDieStoppedTopView(false);
    }
  }, [autoAimView, pendingRoll, lastRoll]);

  // Synchronize React props to the WebGL animation state without remounting Three.js
  useEffect(() => {
    const st = sceneStateRef.current;
    if (pendingRoll) {
      if (st.pendingId !== pendingRoll.id) {
        st.pendingId = pendingRoll.id;
        st.pendingFace = pendingRoll.face;
        st.rollStartedAt = performance.now();
        st.strikeFired = false;
        st.bounceFired = false;
        st.chimeFired = false;
        st.throwAim = st.canAim
          ? { x: aimRef.current.x, y: aimRef.current.y }
          : { x: DEFAULT_AIM_X, y: DEFAULT_AIM_Y };
        aimRef.current.isDragging = false;
        setForcePerspectivePreview(false);
        st.forcePerspective = false;
        setIsDieStoppedTopView(false);
        soundFx.playRollClick();
      }
    } else {
      st.pendingId = null;
      st.pendingFace = null;
      if (lastRoll) {
        if (st.lastRollId !== lastRoll.id) {
          st.lastRollId = lastRoll.id;
          st.lastFace = lastRoll.face;
          setForcePerspectivePreview(false);
          st.forcePerspective = false;
        }
        setIsDieStoppedTopView(!st.forcePerspective);
      } else {
        st.lastRollId = null;
        st.lastFace = null;
        setIsDieStoppedTopView(false);
      }
    }
  }, [pendingRoll?.id, pendingRoll?.face, lastRoll?.id, lastRoll?.face]);

  useEffect(() => {
    sceneStateRef.current.forcePerspective = forcePerspectivePreview;
    if (!sceneStateRef.current.pendingId && sceneStateRef.current.lastFace !== null) {
      setIsDieStoppedTopView(!forcePerspectivePreview);
    }
  }, [forcePerspectivePreview]);

  const handleResetAim = () => {
    aimRef.current.x = DEFAULT_AIM_X;
    aimRef.current.y = DEFAULT_AIM_Y;
    aimRef.current.isCustom = false;
    setHasCustomAim(false);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 140);
    const height = Math.max(container.clientHeight, 160);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const roomTheme = ROOM_ARENA_THEMES[tierId] ?? ROOM_ARENA_THEMES[TierId.TIER_1];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(roomTheme.sceneBgHex);
    scene.fog = new THREE.Fog(roomTheme.fogHex, 18, 42);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.85;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 80);
    const initialAsp = width / height;
    const initCamX = initialAsp < 0.95 ? 0.5 : initialAsp < 1.35 ? 0.64 : 0.72;
    const initCamY = initialAsp < 0.95 ? 3.45 : initialAsp < 1.35 ? 3.18 : 3.05;
    const initCamZ = initialAsp < 0.95 ? 6.9 : initialAsp < 1.35 ? 6.38 : 6.5;
    camera.position.set(initCamX, initCamY, initCamZ);
    _lookCurrent.set(0, 0.85, -0.6);
    camera.lookAt(_lookCurrent);

    // Room-Themed Three-Point Pavilion Lighting (Key, Hemisphere, Rim, + Wall Lanterns)
    const hemiLight = new THREE.HemisphereLight(
      roomTheme.hemiSkyHex,
      roomTheme.hemiGroundHex,
      1.05
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(roomTheme.keyLightHex, 2.7);
    keyLight.position.set(4.5, 9.5, 4.8);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    keyLight.shadow.camera.left = -6.5;
    keyLight.shadow.camera.right = 6.5;
    keyLight.shadow.camera.top = 7.5;
    keyLight.shadow.camera.bottom = -7.5;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(roomTheme.rimLightHex, 1.2);
    rimLight.position.set(-5.5, 5.2, -6.5);
    scene.add(rimLight);

    const leftLanternLight = new THREE.PointLight(roomTheme.lanternLightHex, 5.5, 14, 1.6);
    leftLanternLight.position.set(-2.35, 3.1, -4.9);
    const rightLanternLight = new THREE.PointLight(roomTheme.lanternLightHex, 5.5, 14, 1.6);
    rightLanternLight.position.set(2.35, 3.1, -4.9);
    scene.add(leftLanternLight, rightLanternLight);

    // Build Procedural Textures, Courtyard Walls, Spectators & 3D Arena Props for this Room Tier
    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const textures = createDaduketaTextures(maxAnisotropy, tierId);
    const courtyard = createCourtyardGround(textures);
    const wallsEnv = createArenaEnclosureEnvironment(textures);
    const spectators = createCrowdSpectators(textures);
    const thrower = createHumanThrower(textures);
    const enclosure = createPlankEnclosure(textures);
    const die = createDaduketaDie(textures);

    scene.add(courtyard, wallsEnv, thrower.group, enclosure.group, die.group, die.shadowMesh);
    for (const spec of spectators) {
      scene.add(spec.group);
    }

    const reticleOuterMesh = enclosure.aimReticleGroup.getObjectByName('aimReticleOuter') as
      | THREE.Mesh
      | undefined;
    const reticleOuterMat = reticleOuterMesh?.material as THREE.MeshBasicMaterial | undefined;

    // Mathematical plane coplanar with the front face of the wooden strike plank (z = strikeFaceZ)
    _strikeWorldPlane.normal.set(0, 0, 1);
    _strikeWorldPlane.constant = -enclosure.strikeFaceZ;

    const restPitY = enclosure.pitTopY + die.halfSize;
    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let activePointerId: number | null = null;
    let lastHoverCheckAt = 0;
    let lastTouchAction = '';

    const isAimInteractable = () => {
      const st = sceneStateRef.current;
      return st.canAim && !st.pendingId && (st.lastFace === null || st.forcePerspective);
    };

    const updatePointerNdc = (clientX: number, clientY: number): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    // Intersect pointer ray with the plank front plane & strictly clamp inside the wooden strike plank bounds
    const updateAimFromStrikePlane = (clientX: number, clientY: number): boolean => {
      if (!updatePointerNdc(clientX, clientY)) return false;
      camera.updateMatrixWorld();
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hit = _raycaster.ray.intersectPlane(_strikeWorldPlane, _hitPointWorld);
      if (!hit) return false;

      enclosure.strikePlankPivot.updateMatrixWorld(true);
      _hitPointLocal.copy(_hitPointWorld);
      enclosure.strikePlankPivot.worldToLocal(_hitPointLocal);

      const clampedX = THREE.MathUtils.clamp(
        _hitPointLocal.x,
        enclosure.aimBounds.minX,
        enclosure.aimBounds.maxX
      );
      const clampedY = THREE.MathUtils.clamp(
        _hitPointLocal.y,
        enclosure.aimBounds.minY,
        enclosure.aimBounds.maxY
      );

      aimRef.current.x = clampedX;
      aimRef.current.y = clampedY;
      const custom =
        Math.abs(clampedX - enclosure.aimBounds.defaultX) > 0.02 ||
        Math.abs(clampedY - enclosure.aimBounds.defaultY) > 0.02;
      aimRef.current.isCustom = custom;
      setHasCustomAim(custom);
      return true;
    };

    const isPointerOnStrikePlank = (clientX: number, clientY: number): boolean => {
      if (!updatePointerNdc(clientX, clientY)) return false;
      camera.updateMatrixWorld();
      enclosure.strikeSurfaceCollider.updateMatrixWorld(true);
      _raycaster.setFromCamera(_pointerNdc, camera);
      return _raycaster.intersectObject(enclosure.strikeSurfaceCollider, false).length > 0;
    };

    const releaseAimDrag = (pointerId?: number) => {
      aimRef.current.isDragging = false;
      if (
        pointerId !== undefined &&
        typeof renderer.domElement.hasPointerCapture === 'function' &&
        renderer.domElement.hasPointerCapture(pointerId)
      ) {
        try {
          renderer.domElement.releasePointerCapture(pointerId);
        } catch {
          // Ignore if already released
        }
      }
      activePointerId = null;
      renderer.domElement.style.cursor = aimRef.current.isHovered ? 'crosshair' : 'default';
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isAimInteractable()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!isPointerOnStrikePlank(e.clientX, e.clientY)) return;

      e.preventDefault();
      aimRef.current.isDragging = true;
      aimRef.current.isHovered = true;
      activePointerId = e.pointerId;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignore on synthetic pointer events
      }
      renderer.domElement.style.cursor = 'grabbing';
      updateAimFromStrikePlane(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (aimRef.current.isDragging) {
        if (!isAimInteractable()) {
          releaseAimDrag(e.pointerId);
          return;
        }
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        e.preventDefault();
        updateAimFromStrikePlane(e.clientX, e.clientY);
        return;
      }

      if (!isAimInteractable()) {
        if (aimRef.current.isHovered) {
          aimRef.current.isHovered = false;
          renderer.domElement.style.cursor = 'default';
        }
        return;
      }

      const now = performance.now();
      if (now - lastHoverCheckAt < 32) return;
      lastHoverCheckAt = now;

      const hovered = isPointerOnStrikePlank(e.clientX, e.clientY);
      if (hovered !== aimRef.current.isHovered) {
        aimRef.current.isHovered = hovered;
        renderer.domElement.style.cursor = hovered ? 'crosshair' : 'default';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (aimRef.current.isDragging) {
        releaseAimDrag(e.pointerId);
      }
    };

    const onPointerLeave = () => {
      if (!aimRef.current.isDragging) {
        aimRef.current.isHovered = false;
        renderer.domElement.style.cursor = 'default';
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (!isAimInteractable()) return;
      if (isPointerOnStrikePlank(e.clientX, e.clientY)) {
        aimRef.current.x = enclosure.aimBounds.defaultX;
        aimRef.current.y = enclosure.aimBounds.defaultY;
        aimRef.current.isCustom = false;
        setHasCustomAim(false);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);

    const glCtx = isSoftwareGl ? (renderer.getContext() as WebGL2RenderingContext) : null;
    const afterDraw = (fn: () => void) => {
      if (!isSoftwareGl || !glCtx || typeof glCtx.fenceSync !== 'function') {
        frameId = window.requestAnimationFrame(fn);
        return;
      }
      const sync = glCtx.fenceSync(glCtx.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        window.setTimeout(() => {
          if (!disposed) fn();
        }, 80);
        return;
      }
      glCtx.flush();
      const poll = () => {
        if (disposed) {
          glCtx.deleteSync(sync);
          return;
        }
        const status = glCtx.clientWaitSync(sync, 0, 0);
        if (
          status === glCtx.WAIT_FAILED ||
          status === glCtx.CONDITION_SATISFIED ||
          status === glCtx.ALREADY_SIGNALED
        ) {
          glCtx.deleteSync(sync);
          window.setTimeout(() => {
            if (!disposed) fn();
          }, 80);
        } else {
          window.setTimeout(poll, 16);
        }
      };
      window.setTimeout(poll, 16);
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 140);
      const h = Math.max(container.clientHeight, 160);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const animate = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const st = sceneStateRef.current;
      let wantsTopView = false;

      const nextTouchAction = isAimInteractable() ? 'none' : 'auto';
      if (nextTouchAction !== lastTouchAction) {
        lastTouchAction = nextTouchAction;
        renderer.domElement.style.touchAction = nextTouchAction;
      }

      if (st.pendingId && st.pendingFace !== null) {
        const elapsed = (now - st.rollStartedAt) / 1000;
        const aimX = st.throwAim.x;
        const aimY = st.throwAim.y;
        const bounceEndX = THREE.MathUtils.clamp(aimX * 0.42, -0.55, 0.55);

        if (elapsed < 0.38) {
          // Stage 1: Toss Up in Air above throwing palm
          const p = elapsed / 0.38;
          const arcY = Math.sin(p * Math.PI);
          thrower.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.42, -1.15, arcY);
          thrower.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(-0.88, -0.35, arcY);
          thrower.bodyPivot.rotation.set(THREE.MathUtils.lerp(0, 0.05, arcY), -aimX * 0.06, 0);
          thrower.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.24, -0.08, arcY);
          thrower.headPivot.rotation.set(THREE.MathUtils.lerp(0, 0.14, arcY), -aimX * 0.12, 0);
          thrower.group.updateMatrixWorld(true);
          thrower.handAnchor.getWorldPosition(_handWorld);

          die.group.position.set(
            _handWorld.x * (1 - p * 0.18),
            _handWorld.y + arcY * 1.25,
            _handWorld.z - p * 0.22
          );
          die.group.rotation.set(elapsed * 11.5, elapsed * 8.2, elapsed * 5.4);
          (enclosure.impactRing.material as THREE.MeshBasicMaterial).opacity = 0;
          enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ;
        } else if (elapsed < 0.72) {
          // Stage 2: Catch & Athletic Wind-Up Back
          const p = (elapsed - 0.38) / 0.34;
          thrower.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.55, 0.92, p);
          thrower.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(-0.72, -1.18, p);
          thrower.bodyPivot.rotation.set(
            THREE.MathUtils.lerp(0.02, -0.09, p),
            THREE.MathUtils.lerp(-aimX * 0.06, -0.18 - aimX * 0.05, p),
            0
          );
          thrower.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.18, -0.58, p);
          thrower.headPivot.rotation.set(0.02, THREE.MathUtils.lerp(-aimX * 0.12, 0.16 - aimX * 0.14, p), 0);
          thrower.group.updateMatrixWorld(true);
          thrower.handAnchor.getWorldPosition(_handWorld);

          die.group.position.copy(_handWorld);
          die.group.rotation.set(elapsed * 4.5, elapsed * 3.1, 0);
        } else if (elapsed < 1.14) {
          // Stage 3: Whip Arm Forward Down Lane & Strike Chosen Spot on Main Plank!
          const p = (elapsed - 0.72) / 0.42;
          const followThrough = Math.min(1, p * 2.2);
          thrower.rightArmPivot.rotation.x = THREE.MathUtils.lerp(0.92, -1.48, followThrough);
          thrower.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(-1.18, -0.16, followThrough);
          thrower.bodyPivot.rotation.set(
            THREE.MathUtils.lerp(-0.09, 0.2, followThrough),
            THREE.MathUtils.lerp(-0.18 - aimX * 0.05, 0.14 - aimX * 0.14, followThrough),
            0
          );
          thrower.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.58, 0.32, followThrough);
          thrower.headPivot.rotation.set(
            -0.06 + (DEFAULT_AIM_Y - aimY) * 0.1,
            THREE.MathUtils.lerp(0.16 - aimX * 0.14, -0.08 - aimX * 0.18, followThrough),
            0
          );
          thrower.group.updateMatrixWorld(true);
          thrower.handAnchor.getWorldPosition(_handWorld);

          const startZ = 2.15;
          const endZ = enclosure.strikeFaceZ + die.halfSize + 0.03;
          const x = THREE.MathUtils.lerp(0.08, aimX, p);
          const y = THREE.MathUtils.lerp(1.42, aimY, p) + Math.sin(p * Math.PI) * 0.78;
          const z = THREE.MathUtils.lerp(startZ, endZ, p);

          die.group.position.set(x, y, z);
          die.group.rotation.set(elapsed * 15.0, elapsed * 11.5, elapsed * 9.0);
        } else if (elapsed < 1.66) {
          // Stage 4a: Impact Plank Recoil at Aim Spot + Rebound Into 3-Guard-Plank Pit
          if (!st.strikeFired) {
            st.strikeFired = true;
            soundFx.playPlankStrike();
          }

          enclosure.impactRing.position.set(aimX, aimY, 0.175);

          const p = (elapsed - 1.14) / 0.52;
          const recoilEnv = p < 0.28 ? Math.sin((p / 0.28) * Math.PI) : 0;
          enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ - recoilEnv * 0.15;

          const ringMat = enclosure.impactRing.material as THREE.MeshBasicMaterial;
          if (p < 0.65) {
            const rp = p / 0.65;
            ringMat.opacity = (1 - rp) * 0.9;
            const s = 1 + rp * 2.2;
            enclosure.impactRing.scale.set(s, s, s);
          } else {
            ringMat.opacity = 0;
          }

          const settleP = Math.min(1, p * 1.6);
          thrower.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-1.48, -0.22, settleP);
          thrower.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(-0.16, -0.46, settleP);
          thrower.bodyPivot.rotation.set(
            THREE.MathUtils.lerp(0.2, 0.03, settleP),
            THREE.MathUtils.lerp(0.14 - aimX * 0.14, 0, settleP),
            0
          );
          thrower.leftArmPivot.rotation.x = THREE.MathUtils.lerp(0.32, -0.22, settleP);
          thrower.headPivot.rotation.set(0.05, THREE.MathUtils.lerp(-aimX * 0.18, 0, settleP), 0);

          const startZ = enclosure.strikeFaceZ + die.halfSize + 0.03;
          const bounceZ = enclosure.pitCenterZ + 0.14;
          const easedP = easeOutCubic(p);
          const z = THREE.MathUtils.lerp(startZ, bounceZ, easedP);
          const lateralCurve = Math.sin(p * Math.PI) * 0.14 * (aimX >= 0 ? -1 : 1);
          const x = THREE.MathUtils.lerp(aimX, bounceEndX, easedP) + lateralCurve;
          const bounceBaseY = THREE.MathUtils.lerp(aimY, restPitY, easedP);
          const hop = Math.sin(p * Math.PI) * (0.36 + (1.16 - aimY) * 0.18);
          const y = Math.max(restPitY, bounceBaseY + hop);

          if (p > 0.56 && !st.bounceFired) {
            st.bounceFired = true;
            soundFx.playSpinTick();
          }

          die.group.position.set(x, y, z);
          die.group.rotation.set(elapsed * 13.0, elapsed * 10.0, elapsed * 7.5);
        } else if (elapsed < 2.15) {
          // Stage 4b: Spin Inside Box & Smoothly Decelerate to Exact Target Face Up
          const p = (elapsed - 1.66) / 0.49;
          const eased = easeOutCubic(p);

          enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ;
          (enclosure.impactRing.material as THREE.MeshBasicMaterial).opacity = 0;
          thrower.rightArmPivot.rotation.x = -0.22;
          thrower.rightElbowPivot.rotation.x = -0.46;
          thrower.bodyPivot.rotation.set(0.03 * (1 - eased), 0, 0);
          thrower.leftArmPivot.rotation.x = -0.22;
          thrower.headPivot.rotation.set(0.04, 0, 0);

          die.group.position.set(
            THREE.MathUtils.lerp(bounceEndX, 0, eased),
            restPitY,
            THREE.MathUtils.lerp(enclosure.pitCenterZ + 0.14, enclosure.pitCenterZ, eased)
          );

          _targetQuat.copy(getTargetQuaternionForFace(st.pendingFace));
          const spinDecay = (1 - eased) * Math.PI * 2.1;
          _spinEuler.set(spinDecay * 0.7, spinDecay * 1.3, spinDecay * 0.5);
          _spinQuat.setFromEuler(_spinEuler);
          die.group.quaternion.copy(_targetQuat).multiply(_spinQuat);
        } else {
          // Stage 5: Stopped! Lock exact face up and switch camera to Overhead Top View!
          enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ;
          (enclosure.impactRing.material as THREE.MeshBasicMaterial).opacity = 0;
          thrower.rightArmPivot.rotation.x = -0.22;
          thrower.rightElbowPivot.rotation.x = -0.46;
          thrower.bodyPivot.rotation.set(0, 0, 0);
          thrower.leftArmPivot.rotation.x = -0.22;
          thrower.headPivot.rotation.set(0.04, 0, 0);

          die.group.position.set(0, restPitY, enclosure.pitCenterZ);
          die.group.quaternion.copy(getTargetQuaternionForFace(st.pendingFace));
          wantsTopView = true;

          if (!st.chimeFired) {
            st.chimeFired = true;
            setIsDieStoppedTopView(true);
            soundFx.playWinChime();
          }
        }
      } else if (st.lastFace !== null) {
        // Post-roll rest: die rests cleanly in pit center on winning face (or user switches to 3D View to aim)
        const breath = Math.sin(now * 0.002);
        const aimYaw = st.canAim && st.forcePerspective ? -aimRef.current.x * 0.16 : 0;
        const aimPitch = st.canAim && st.forcePerspective ? (DEFAULT_AIM_Y - aimRef.current.y) * 0.14 : 0;
        enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ;
        (enclosure.impactRing.material as THREE.MeshBasicMaterial).opacity = 0;
        thrower.rightArmPivot.rotation.x = -0.18 + breath * 0.025;
        thrower.rightElbowPivot.rotation.x = -0.38;
        thrower.bodyPivot.rotation.set(0, aimYaw * 0.5, 0);
        thrower.leftArmPivot.rotation.x = -0.2 - breath * 0.02;
        thrower.headPivot.rotation.set(
          0.05 + aimPitch,
          aimYaw + Math.sin(now * 0.0009) * 0.04,
          0
        );

        die.group.position.set(0, restPitY, enclosure.pitCenterZ);
        die.group.quaternion.copy(getTargetQuaternionForFace(st.lastFace));
        wantsTopView = !st.forcePerspective;
      } else {
        // Pre-roll idle: natural breathing + thrower subtly eyes & aligns with the player's plank aim point
        const idleBreath = Math.sin(now * 0.0022);
        const aimYaw = st.canAim ? -aimRef.current.x * 0.16 : 0;
        const aimPitch = st.canAim ? (DEFAULT_AIM_Y - aimRef.current.y) * 0.14 : 0;
        enclosure.strikePlankPivot.position.z = enclosure.strikePlankBaseZ;
        (enclosure.impactRing.material as THREE.MeshBasicMaterial).opacity = 0;
        thrower.rightArmPivot.rotation.x = -0.42 + idleBreath * 0.035;
        thrower.rightElbowPivot.rotation.x = -0.88 + idleBreath * 0.03;
        thrower.bodyPivot.rotation.set(idleBreath * 0.012, aimYaw * 0.5, 0);
        thrower.leftArmPivot.rotation.x = -0.24 - idleBreath * 0.025;
        thrower.headPivot.rotation.set(
          0.03 + aimPitch,
          aimYaw + Math.sin(now * 0.0011) * 0.04,
          0
        );
        thrower.group.updateMatrixWorld(true);
        thrower.handAnchor.getWorldPosition(_handWorld);

        die.group.position.copy(_handWorld);
        die.group.quaternion.copy(getTargetQuaternionForFace(18));
        wantsTopView = false;
      }

      // Position & animate the on-plank aim reticle when player can aim (and during outgoing throw before impact)
      const showAimDuringThrow = Boolean(
        st.pendingId && st.canAim && (now - st.rollStartedAt) / 1000 < 1.18
      );
      const showReticle = isAimInteractable() || showAimDuringThrow;
      enclosure.aimReticleGroup.visible = showReticle;

      if (showReticle) {
        const activeAim = st.pendingId ? st.throwAim : aimRef.current;
        enclosure.aimReticleGroup.position.set(activeAim.x, activeAim.y, 0.172);
        const pulse = aimRef.current.isDragging
          ? 1.14
          : 1 + Math.sin(now * 0.006) * 0.05;
        enclosure.aimReticleGroup.scale.set(pulse, pulse, 1);

        if (reticleOuterMat) {
          if (aimRef.current.isDragging) {
            reticleOuterMat.color.setHex(0x34d399);
            reticleOuterMat.opacity = 1;
          } else if (aimRef.current.isHovered) {
            reticleOuterMat.color.setHex(0xfde68a);
            reticleOuterMat.opacity = 0.98;
          } else {
            reticleOuterMat.color.setHex(0xfbbf24);
            reticleOuterMat.opacity = 0.9;
          }
        }
      }

      // Sync Die Contact Shadow Position & Scale
      const groundFloorY =
        die.group.position.z < enclosure.pitCenterZ + 1.35 ? enclosure.pitTopY + 0.006 : 0.018;
      const heightAboveGround = Math.max(0, die.group.position.y - die.halfSize - groundFloorY);
      die.shadowMesh.position.set(die.group.position.x, groundFloorY, die.group.position.z);
      const shadowScale = THREE.MathUtils.clamp(1 + heightAboveGround * 0.25, 0.9, 1.85);
      die.shadowMesh.scale.set(shadowScale, shadowScale, 1);
      (die.shadowMesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(
        0.72 - heightAboveGround * 0.24,
        0.14,
        0.72
      );

      // Smooth Damped Camera Transition (Behind-the-Player Lane View <-> Overhead Top View)
      if (wantsTopView) {
        _camGoal.set(0, camera.aspect < 0.95 ? 2.65 : 2.3, enclosure.pitCenterZ + 0.08);
        _lookGoal.set(0, enclosure.pitTopY + 0.1, enclosure.pitCenterZ);
      } else {
        const camX = camera.aspect < 0.95 ? 0.5 : camera.aspect < 1.35 ? 0.64 : 0.72;
        const camY = camera.aspect < 0.95 ? 3.45 : camera.aspect < 1.35 ? 3.18 : 3.05;
        const camZ = camera.aspect < 0.95 ? 6.9 : camera.aspect < 1.35 ? 6.38 : 6.5;
        _camGoal.set(camX, camY, camZ);
        _lookGoal.set(0, 0.85, -0.6);
      }

      const dampLambda = wantsTopView ? 6.5 : 5.5;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, dampLambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, dampLambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, dampLambda, dt);

      _lookCurrent.x = THREE.MathUtils.damp(_lookCurrent.x, _lookGoal.x, dampLambda, dt);
      _lookCurrent.y = THREE.MathUtils.damp(_lookCurrent.y, _lookGoal.y, dampLambda, dt);
      _lookCurrent.z = THREE.MathUtils.damp(_lookCurrent.z, _lookGoal.z, dampLambda, dt);
      camera.lookAt(_lookCurrent);

      // Animate Flanking Spectators (Natural Breathing, Head Glance Following Die/Pit, Asymmetric Arm Reactions)
      const isExcited = Boolean(st.pendingId && st.strikeFired);
      const tSec = now * 0.0022;
      for (const spec of spectators) {
        const wave = Math.sin(tSec + spec.phaseOffset);
        spec.bodyPivot.position.y = wave * 0.012;
        spec.headPivot.rotation.y = Math.sin(tSec * 0.6 + spec.phaseOffset) * 0.16;
        spec.headPivot.rotation.x = isExcited ? -0.08 : 0.03 + Math.cos(tSec * 0.5 + spec.phaseOffset) * 0.03;

        const targetRightArm = isExcited ? -1.15 - Math.abs(wave) * 0.35 : -0.16 + wave * 0.06;
        const targetRightElbow = isExcited ? -1.05 : -0.42 + wave * 0.04;
        const targetLeftArm = isExcited ? -0.82 - Math.abs(Math.cos(tSec + spec.phaseOffset)) * 0.28 : -0.18 - wave * 0.05;
        const targetLeftElbow = isExcited ? -0.92 : -0.44;

        spec.rightArmPivot.rotation.x = THREE.MathUtils.damp(spec.rightArmPivot.rotation.x, targetRightArm, 6, dt);
        spec.rightElbowPivot.rotation.x = THREE.MathUtils.damp(spec.rightElbowPivot.rotation.x, targetRightElbow, 6, dt);
        spec.leftArmPivot.rotation.x = THREE.MathUtils.damp(spec.leftArmPivot.rotation.x, targetLeftArm, 5.5, dt);
        spec.leftElbowPivot.rotation.x = THREE.MathUtils.damp(spec.leftElbowPivot.rotation.x, targetLeftElbow, 5.5, dt);
      }

      renderer.render(scene, camera);
      afterDraw(animate);
    };

    afterDraw(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
          disposedGeos.add(mesh.geometry);
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (!disposedMats.has(m)) {
              disposedMats.add(m);
              m.dispose();
            }
          }
        }
      });
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [tierId]);

  const settledFace = !pendingRoll && lastRoll ? lastRoll.face : null;
  const rollerName =
    pendingRoll?.rollerUsername ?? currentTurnPlayer?.username ?? lastRoll?.rollerUsername ?? null;
  const canShowAimHint =
    effectiveCanAim && !pendingRoll && (lastRoll === null || forcePerspectivePreview);

  return (
    <div
      className={`relative rounded-xl sm:rounded-2xl border-2 p-1.5 sm:p-3 shadow-2xl select-none ${theme.uiWrapperClass}`}
    >
      {/* Compact Camera Header Bar — All details visible across Mobile, Tablet, Desktop */}
      <div className="mb-1.5 sm:mb-2.5 flex flex-wrap items-center justify-between gap-1.5 text-[11px] sm:text-xs">
        <div className="flex flex-wrap items-center gap-1.5 font-semibold text-amber-200 min-w-0">
          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" />
          <span className="whitespace-nowrap">
            {isDieStoppedTopView ? 'Top View' : '3D Ground'}
          </span>
          <span
            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${theme.uiBadgeClass}`}
          >
            {theme.roomTitle}
          </span>
          {currentTurnPlayer && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-[#2B100A] px-2 py-0.5 text-[11px] font-bold text-amber-100">
              <AvatarFrame
                src={currentTurnPlayer.avatarUrl}
                username={currentTurnPlayer.username}
                size="sm"
                highlighted
                countdownProgress={currentTurnPlayer.countdownProgress}
                frameId={currentTurnPlayer.frameId}
                country={currentTurnPlayer.country}
              />
              <span className="max-w-[90px] truncate">{currentTurnPlayer.username}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canShowAimHint && (
            <div className="flex items-center gap-1 rounded-lg border border-amber-400/35 bg-[#2A1009] px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-amber-200">
              <Crosshair className="h-3 w-3 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">Aim Plank</span>
              {hasCustomAim && (
                <button
                  type="button"
                  onClick={handleResetAim}
                  className="ml-1 rounded border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-200 hover:bg-amber-400/30 cursor-pointer whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {settledFace !== null && isDieStoppedTopView && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-[#132A1E] px-2 py-0.5 font-mono-tabular text-[10px] sm:text-xs font-extrabold text-emerald-300">
              <span>Top:{settledFace}</span>
              <span className="text-emerald-500/60">|</span>
              <span className="text-amber-200">Opp:{OPPOSITE_MAP[settledFace]}</span>
              {rollerName && (
                <>
                  <span className="text-emerald-500/60">|</span>
                  <span className="text-amber-100 font-semibold">{rollerName}</span>
                </>
              )}
            </div>
          )}

          {(effectiveCanAim || !watchOnly) && !pendingRoll && lastRoll && (
            <button
              type="button"
              onClick={() => setForcePerspectivePreview((p) => !p)}
              className="flex items-center gap-1 rounded-lg border border-amber-400/35 bg-[#32130C] px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-amber-200 hover:bg-[#461B11] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-3 w-3 shrink-0" />
              <span>{forcePerspectivePreview ? 'Top View' : effectiveCanAim ? 'Aim 3D' : '3D View'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Isolated WebGL Mount Point (Zero React children or backdrop-filter overlays) */}
      <div
        ref={mountRef}
        className={`w-full h-[240px] sm:h-[325px] md:h-[365px] lg:h-[400px] rounded-lg sm:rounded-xl overflow-hidden border ${theme.uiCanvasClass}`}
      />
    </div>
  );
};
