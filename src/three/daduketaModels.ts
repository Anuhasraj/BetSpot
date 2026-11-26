import * as THREE from 'three';
import { DaduketaTextureBundle } from './daduketaTextures';

export interface HumanThrowerRig {
  group: THREE.Group;
  rightArmPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  headPivot: THREE.Group;
  handAnchor: THREE.Object3D;
  bodyPivot: THREE.Group;
}

export interface PlankEnclosureAimBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  defaultX: number;
  defaultY: number;
  strikeLocalZ: number;
}

export interface PlankEnclosureRig {
  group: THREE.Group;
  strikePlankPivot: THREE.Group;
  strikePlankBaseZ: number;
  impactRing: THREE.Mesh;
  aimReticleGroup: THREE.Group;
  strikeSurfaceCollider: THREE.Mesh;
  aimBounds: PlankEnclosureAimBounds;
  pitCenterZ: number;
  pitTopY: number;
  strikeFaceZ: number;
}

export interface DaduketaDieRig {
  group: THREE.Group;
  shadowMesh: THREE.Mesh;
  halfSize: number;
}

export interface SpectatorCharacterRig {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  leftElbowPivot: THREE.Group;
  baseYaw: number;
  phaseOffset: number;
}

export function createCourtyardGround(textures: DaduketaTextureBundle): THREE.Group {
  const group = new THREE.Group();

  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floorMat = new THREE.MeshStandardMaterial({
    map: textures.courtyardWood,
    bumpMap: textures.woodBump,
    bumpScale: 0.015,
    roughness: 0.72,
    metalness: 0.06,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  // Subtle inlaid throwing-lane runner connecting foreground player (+Z) to plank enclosure (-Z)
  const laneGeo = new THREE.PlaneGeometry(1.26, 6.2);
  const laneMat = new THREE.MeshStandardMaterial({
    color: textures.theme.runnerHex,
    bumpMap: textures.woodBump,
    bumpScale: 0.008,
    roughness: 0.72,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const lane = new THREE.Mesh(laneGeo, laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.012, 0.25);
  lane.receiveShadow = true;
  group.add(lane);

  // Room-matched metallic lane trim rails along left & right edges of throwing lane
  const railGeo = new THREE.BoxGeometry(0.055, 0.028, 6.2);
  const metalMat = new THREE.MeshStandardMaterial({
    color: textures.theme.metalHex,
    roughness: textures.theme.metalRoughness,
    metalness: textures.theme.metalness,
  });
  const railLeft = new THREE.Mesh(railGeo, metalMat);
  railLeft.position.set(-0.64, 0.018, 0.25);
  const railRight = new THREE.Mesh(railGeo, metalMat);
  railRight.position.set(0.64, 0.018, 0.25);
  group.add(railLeft, railRight);

  // Foul / release line marker bar directly in front of the thrower's lead foot
  const foulLine = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.016, 0.055), metalMat);
  foulLine.position.set(0, 0.016, 2.08);
  foulLine.receiveShadow = true;
  group.add(foulLine);

  // Subtle distance markers inlaid across the runner toward the pit
  for (const mz of [1.1, 0.15]) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.012, 0.024), metalMat);
    marker.position.set(0, 0.014, mz);
    group.add(marker);
  }

  return group;
}

function addLanternMesh(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  brassMat: THREE.Material,
  glowMat: THREE.Material
): void {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.22), brassMat);
  mount.add(bracket);

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.34, 8), glowMat);
  housing.position.set(0, -0.06, 0.18);
  mount.add(housing);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.14, 8), brassMat);
  cap.position.set(0, 0.16, 0.18);
  mount.add(cap);

  const baseRim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.05, 8), brassMat);
  baseRim.position.set(0, -0.25, 0.18);
  mount.add(baseRim);

  parent.add(mount);
}

/**
 * Builds the enclosed architectural courtyard hall (back wall behind plank, side walls, masonry dado,
 * timber beams, central Arena tapestry crest, glowing lanterns, flanking guardrails & benches/barrels)
 * so there is never an empty black void around or behind the plank.
 */
export function createArenaEnclosureEnvironment(textures: DaduketaTextureBundle): THREE.Group {
  const group = new THREE.Group();

  const stoneWallMat = new THREE.MeshStandardMaterial({
    map: textures.stoneWall,
    roughness: 0.86,
    metalness: 0.03,
  });
  const brickDadoMat = new THREE.MeshStandardMaterial({
    map: textures.brickDado,
    roughness: 0.88,
    metalness: 0.04,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    map: textures.strikePlankWood,
    bumpMap: textures.woodBump,
    bumpScale: 0.015,
    roughness: 0.62,
    metalness: 0.08,
  });
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: textures.theme.darkTimberHex,
    roughness: 0.68,
    metalness: 0.08,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: textures.theme.metalHex,
    roughness: textures.theme.metalRoughness,
    metalness: textures.theme.metalness,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: textures.theme.lanternGlowHex,
    emissive: textures.theme.lanternEmissiveHex,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    map: textures.arenaBanner,
    roughness: 0.7,
    metalness: 0.06,
  });

  // 1. BACK WALL BEHIND THE PLANK
  const backWallZ = -5.55;
  const backUpper = new THREE.Mesh(new THREE.BoxGeometry(20, 7.2, 0.4), stoneWallMat);
  backUpper.position.set(0, 5.2, backWallZ);
  backUpper.receiveShadow = true;
  group.add(backUpper);

  const backDado = new THREE.Mesh(new THREE.BoxGeometry(20, 1.7, 0.46), brickDadoMat);
  backDado.position.set(0, 0.85, backWallZ + 0.03);
  backDado.receiveShadow = true;
  group.add(backDado);

  const dadoCap = new THREE.Mesh(new THREE.BoxGeometry(20, 0.14, 0.56), darkTimberMat);
  dadoCap.position.set(0, 1.72, backWallZ + 0.06);
  dadoCap.castShadow = true;
  dadoCap.receiveShadow = true;
  group.add(dadoCap);

  // Back wall vertical timber pillars + overhead lintel beam
  for (const px of [-5.8, -3.1, 3.1, 5.8]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, 7.8, 0.48), darkTimberMat);
    col.position.set(px, 3.9, backWallZ + 0.18);
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);

    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 0.6), brassMat);
    basePlinth.position.set(px, 0.18, backWallZ + 0.18);
    group.add(basePlinth);
  }

  const lintelBeam = new THREE.Mesh(new THREE.BoxGeometry(16, 0.44, 0.55), darkTimberMat);
  lintelBeam.position.set(0, 4.95, backWallZ + 0.22);
  lintelBeam.castShadow = true;
  group.add(lintelBeam);

  // Central Heritage Tapestry Crest Banner directly behind the plank box
  const crestFrame = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.85, 0.14), darkTimberMat);
  crestFrame.position.set(0, 3.15, backWallZ + 0.24);
  crestFrame.castShadow = true;
  group.add(crestFrame);

  const crestTrim = new THREE.Mesh(new THREE.BoxGeometry(3.52, 1.68, 0.16), brassMat);
  crestTrim.position.set(0, 3.15, backWallZ + 0.25);
  group.add(crestTrim);

  const crestArt = new THREE.Mesh(new THREE.PlaneGeometry(3.36, 1.54), bannerMat);
  crestArt.position.set(0, 3.15, backWallZ + 0.34);
  group.add(crestArt);

  // Two glowing brass courtyard lanterns flanking the crest behind the plank
  addLanternMesh(group, -2.35, 3.25, backWallZ + 0.32, brassMat, glowMat);
  addLanternMesh(group, 2.35, 3.25, backWallZ + 0.32, brassMat, glowMat);

  // 2. LEFT & RIGHT COURTYARD PERIMETER WALLS (Enclosing both sides cleanly)
  for (const side of [-1, 1]) {
    const wallX = side * 6.45;
    const wallUpper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.2, 18), stoneWallMat);
    wallUpper.position.set(wallX, 5.2, 2.5);
    wallUpper.receiveShadow = true;
    group.add(wallUpper);

    const wallDado = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.7, 18), brickDadoMat);
    wallDado.position.set(wallX - side * 0.03, 0.85, 2.5);
    wallDado.receiveShadow = true;
    group.add(wallDado);

    const wallCap = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 18), darkTimberMat);
    wallCap.position.set(wallX - side * 0.06, 1.72, 2.5);
    group.add(wallCap);

    // Side timber columns along wall
    for (const pz of [-2.8, 0.4, 3.6]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.44, 7.6, 0.4), darkTimberMat);
      pilaster.position.set(wallX - side * 0.16, 3.8, pz);
      pilaster.castShadow = true;
      group.add(pilaster);
    }

    // Side rails separating spectator sidelines from main arena center
    const railPostXs = side * 1.98;
    for (const rz of [-3.3, -1.6, 0.1, 1.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.072, 0.72, 10), darkTimberMat);
      post.position.set(railPostXs, 0.36, rz);
      post.castShadow = true;
      group.add(post);

      const postPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), brassMat);
      postPlinth.position.set(railPostXs, 0.03, rz);
      group.add(postPlinth);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), brassMat);
      finial.position.set(railPostXs, 0.74, rz);
      group.add(finial);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 5.3), timberMat);
    topRail.position.set(railPostXs, 0.64, -0.75);
    topRail.castShadow = true;
    group.add(topRail);

    const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 5.1), darkTimberMat);
    midRail.position.set(railPostXs, 0.34, -0.75);
    group.add(midRail);

    // Wooden spectator viewing bench behind crowd row for authentic tavern/arena depth
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 4.4), timberMat);
    benchSeat.position.set(side * 3.45, 0.42, -0.8);
    benchSeat.castShadow = true;
    benchSeat.receiveShadow = true;
    group.add(benchSeat);

    for (const bz of [-2.6, -0.8, 1.0]) {
      const benchLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.1), darkTimberMat);
      benchLeg.position.set(side * 3.45, 0.2, bz);
      benchLeg.castShadow = true;
      group.add(benchLeg);
    }

    // Traditional wooden arena barrel near back corner flanking the plank
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.82, 14), timberMat);
    barrel.position.set(side * 4.1, 0.41, -4.45);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);

    const hoop1 = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 14), brassMat);
    hoop1.position.set(side * 4.1, 0.68, -4.45);
    const hoop2 = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 14), brassMat);
    hoop2.position.set(side * 4.1, 0.18, -4.45);
    group.add(hoop1, hoop2);
  }

  // Overhead pavilion roof rafters adding real 3D architectural depth
  for (const rz of [-4.1, -2.0, 0.2, 2.4]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.32, 0.28), darkTimberMat);
    beam.position.set(0, 5.4, rz);
    group.add(beam);
  }

  return group;
}

type HairStyle = 'sidepart' | 'slick' | 'curly' | 'cap';

interface RealisticHumanSpec {
  shirtHex: number;
  pantHex: number;
  skinHex: number;
  hairHex: number;
  shoeHex: number;
  trimHex: number;
  hairStyle: HairStyle;
  hasBeard?: boolean;
  staggerThrowStance?: boolean;
  isThrower?: boolean;
}

interface BuiltHumanParts {
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  leftElbowPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  handAnchor: THREE.Object3D;
}

/**
 * Builds an anatomically proportioned realistic human figure facing +Z (up = +Y, right side = -X, left side = +X).
 * Includes shoes, knees/thighs/calves, pelvis & belt buckle, sculpted chest & shirt collar/placket,
 * short sleeves, deltoid shoulder caps, elbow joints, forearms, sculpted palms/thumbs/fingers,
 * neck, sculpted jaw/chin, ears, sclera/iris eyes, eyebrows, nose, and varied realistic hairstyles.
 */
function buildRealisticHumanParts(spec: RealisticHumanSpec): BuiltHumanParts {
  const bodyPivot = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: spec.skinHex,
    roughness: 0.62,
    metalness: 0.03,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: spec.shirtHex,
    roughness: 0.66,
    metalness: 0.08,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: spec.shirtHex,
    roughness: 0.56,
    metalness: 0.12,
  });
  const pantMat = new THREE.MeshStandardMaterial({
    color: spec.pantHex,
    roughness: 0.78,
    metalness: 0.05,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: spec.shoeHex,
    roughness: 0.54,
    metalness: 0.12,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.7,
    metalness: 0.04,
  });
  const beltLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.55,
    metalness: 0.12,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: spec.trimHex,
    roughness: 0.34,
    metalness: 0.68,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: spec.hairHex,
    roughness: 0.76,
    metalness: 0.05,
  });
  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.02,
  });
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x171717,
    roughness: 0.2,
    metalness: 0.1,
  });
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x7c3f34,
    roughness: 0.65,
  });

  // Helper to build an articulated leg (hip -> thigh -> knee -> calf -> ankle -> multi-part shoe)
  const buildLeg = (
    hipX: number,
    hipZ: number,
    hipRotX: number,
    kneeRotX: number
  ) => {
    const legRoot = new THREE.Group();
    legRoot.position.set(hipX, 0.86, hipZ);
    legRoot.rotation.x = hipRotX;
    bodyPivot.add(legRoot);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.072, 0.4, 12),
      pantMat
    );
    thigh.scale.set(0.95, 1, 1.05);
    thigh.position.set(0, -0.2, 0);
    thigh.castShadow = true;
    thigh.receiveShadow = true;
    legRoot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.4, 0);
    kneePivot.rotation.x = kneeRotX;
    legRoot.add(kneePivot);

    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), pantMat);
    kneeCap.castShadow = true;
    kneePivot.add(kneeCap);

    const calf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.052, 0.36, 12),
      pantMat
    );
    calf.position.set(0, -0.18, 0);
    calf.castShadow = true;
    calf.receiveShadow = true;
    kneePivot.add(calf);

    // Trouser hem cuff
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.058, 0.035, 12),
      pantMat
    );
    cuff.position.set(0, -0.35, 0);
    kneePivot.add(cuff);

    const ankle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.036, 0.06, 10),
      skinMat
    );
    ankle.position.set(0, -0.38, 0);
    kneePivot.add(ankle);

    // Realistic Sneaker / Shoe anchored flat relative to floor
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(0, -0.43, 0.035);
    shoeGroup.rotation.x = -(hipRotX + kneeRotX);
    kneePivot.add(shoeGroup);

    const outsole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.024, 0.245), soleMat);
    outsole.position.set(0, 0.012, 0.015);
    outsole.castShadow = true;
    shoeGroup.add(outsole);

    const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.062, 0.19), shoeMat);
    shoeBody.position.set(0, 0.052, 0.005);
    shoeBody.castShadow = true;
    shoeGroup.add(shoeBody);

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), shoeMat);
    toeCap.scale.set(0.95, 0.62, 1.35);
    toeCap.position.set(0, 0.044, 0.095);
    toeCap.castShadow = true;
    shoeGroup.add(toeCap);
  };

  if (spec.staggerThrowStance) {
    // Athletic staggered throwing stance: Left foot stepped forward (+Z), right foot braced behind (-Z)
    buildLeg(0.115, 0.06, -0.14, 0.16);
    buildLeg(-0.115, -0.08, 0.16, 0.12);
  } else {
    buildLeg(0.105, 0.01, -0.03, 0.04);
    buildLeg(-0.105, -0.01, 0.02, 0.02);
  }

  // Pelvis / Hips
  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.142, 0.16, 14),
    pantMat
  );
  pelvis.scale.set(1.16, 1, 0.78);
  pelvis.position.set(0, 0.89, 0);
  pelvis.castShadow = true;
  bodyPivot.add(pelvis);

  // Leather Belt & Metallic Buckle
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.158, 0.156, 0.042, 14),
    beltLeatherMat
  );
  belt.scale.set(1.17, 1, 0.8);
  belt.position.set(0, 0.96, 0);
  bodyPivot.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.048, 0.02), trimMat);
  buckle.position.set(0, 0.96, 0.13);
  bodyPivot.add(buckle);

  // Sculpted Athletic Torso (chest V-taper + subtle pectorals + upper back)
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.195, 0.152, 0.45, 16),
    shirtMat
  );
  torso.scale.set(1.16, 1, 0.72);
  torso.position.set(0, 1.19, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // Upper shoulder breadth cap
  const shoulderBridge = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.092, 0.25, 6, 12),
    shirtMat
  );
  shoulderBridge.rotation.z = Math.PI / 2;
  shoulderBridge.scale.set(0.86, 1, 0.9);
  shoulderBridge.position.set(0, 1.375, 0);
  shoulderBridge.castShadow = true;
  bodyPivot.add(shoulderBridge);

  // Front Polo Placket + Trim Stripe + Shirt Collar
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.074, 0.02, 8, 16),
    collarMat
  );
  collar.rotation.x = Math.PI / 2 + 0.16;
  collar.position.set(0, 1.445, 0.008);
  bodyPivot.add(collar);

  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.17, 0.015), trimMat);
  placket.position.set(0, 1.32, 0.136);
  bodyPivot.add(placket);

  if (spec.isThrower) {
    // Championship jersey sash & back accent stripe on main player
    const waistTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.162, 0.036, 14),
      trimMat
    );
    waistTrim.scale.set(1.18, 1, 0.76);
    waistTrim.position.set(0, 1.0, 0);
    bodyPivot.add(waistTrim);

    const backStripe = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.34, 0.018), trimMat);
    backStripe.position.set(0, 1.21, -0.135);
    bodyPivot.add(backStripe);
  }

  // Helper to build an articulated arm (shoulder cap + sleeve -> bicep -> elbow -> forearm -> sculpted hand)
  const buildArm = (isRightSide: boolean) => {
    const signX = isRightSide ? -1 : 1;
    const armPivot = new THREE.Group();
    armPivot.position.set(signX * 0.232, 1.375, 0);
    bodyPivot.add(armPivot);

    // Shoulder Deltoid Sleeve
    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), shirtMat);
    shoulderCap.castShadow = true;
    armPivot.add(shoulderCap);

    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.056, 0.16, 12),
      shirtMat
    );
    sleeve.position.set(0, -0.08, 0);
    sleeve.castShadow = true;
    armPivot.add(sleeve);

    const sleeveTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.02, 12),
      trimMat
    );
    sleeveTrim.position.set(0, -0.155, 0);
    armPivot.add(sleeveTrim);

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.044, 0.12, 10),
      skinMat
    );
    upperArm.position.set(0, -0.2, 0);
    upperArm.castShadow = true;
    armPivot.add(upperArm);

    // Elbow Pivot
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.26, 0);
    armPivot.add(elbowPivot);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 10), skinMat);
    elbowPivot.add(elbowJoint);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.034, 0.24, 10),
      skinMat
    );
    forearm.position.set(0, -0.12, 0);
    forearm.castShadow = true;
    elbowPivot.add(forearm);

    if (!isRightSide) {
      // Subtle wristwatch on left wrist for human realism
      const watch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.024, 12),
        beltLeatherMat
      );
      watch.position.set(0, -0.22, 0);
      elbowPivot.add(watch);
    }

    // Sculpted Human Hand (Palm + Thumb + Curled Finger Cluster)
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.255, 0.008);
    elbowPivot.add(handGroup);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.068, 0.062), skinMat);
    palm.position.set(0, -0.025, 0);
    palm.castShadow = true;
    handGroup.add(palm);

    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.054, 0.056), skinMat);
    fingers.position.set(signX * -0.012, -0.072, 0.012);
    fingers.rotation.z = signX * -0.28;
    fingers.castShadow = true;
    handGroup.add(fingers);

    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.028, 4, 6), skinMat);
    thumb.position.set(signX * -0.016, -0.024, 0.036);
    thumb.rotation.x = 0.55;
    handGroup.add(thumb);

    return { armPivot, elbowPivot, handGroup };
  };

  const rightArm = buildArm(true);
  const leftArm = buildArm(false);

  // Palm anchor point where the Daduketa die rests in pre-roll & stage 1-2
  const handAnchor = new THREE.Object3D();
  handAnchor.position.set(0.028, -0.045, 0.022);
  rightArm.handGroup.add(handAnchor);

  // Neck & Anatomically Sculpted Head
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.054, 0.064, 0.11, 12),
    skinMat
  );
  neck.position.set(0, 1.48, 0);
  neck.castShadow = true;
  bodyPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.535, 0);
  bodyPivot.add(headPivot);

  // Cranium (oval human skull proportion)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.116, 18, 16), skinMat);
  cranium.scale.set(0.92, 1.08, 1.02);
  cranium.position.set(0, 0.125, -0.005);
  cranium.castShadow = true;
  headPivot.add(cranium);

  // Sculpted Jaw / Chin
  const jaw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.094, 0.056, 0.105, 14),
    skinMat
  );
  jaw.scale.set(0.92, 1, 1.05);
  jaw.position.set(0, 0.058, 0.016);
  jaw.castShadow = true;
  headPivot.add(jaw);

  // Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), skinMat);
    ear.scale.set(0.45, 1.15, 0.72);
    ear.position.set(side * 0.108, 0.108, -0.006);
    headPivot.add(ear);
  }

  // Nose Bridge & Tip
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.052, 8), skinMat);
  nose.rotation.x = Math.PI * 0.42;
  nose.position.set(0, 0.1, 0.118);
  headPivot.add(nose);

  // Eyes (White Sclera + Dark Iris) & Sculpted Eyebrows
  for (const side of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), scleraMat);
    sclera.scale.set(1.1, 0.78, 0.65);
    sclera.position.set(side * 0.04, 0.126, 0.102);
    headPivot.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), irisMat);
    iris.position.set(side * 0.04, 0.126, 0.111);
    headPivot.add(iris);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.009, 0.012), hairMat);
    brow.position.set(side * 0.04, 0.146, 0.104);
    brow.rotation.z = side * -0.08;
    headPivot.add(brow);
  }

  // Mouth / Lips
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.01, 0.012), mouthMat);
  mouth.position.set(0, 0.052, 0.1);
  headPivot.add(mouth);

  // Optional Subtle Beard / Jaw Shadow
  if (spec.hasBeard) {
    const beard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.097, 0.059, 0.075, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
      hairMat
    );
    beard.scale.set(0.94, 1, 1.07);
    beard.position.set(0, 0.046, 0.018);
    headPivot.add(beard);
  }

  // Varied Realistic Hairstyles & Caps
  if (spec.hairStyle === 'cap') {
    // Under-cap hair at back of neck
    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.118, 14, 10, Math.PI * 0.65, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.48),
      hairMat
    );
    backHair.scale.set(0.94, 1.05, 1.04);
    backHair.position.set(0, 0.12, -0.01);
    headPivot.add(backHair);

    const capMat = new THREE.MeshStandardMaterial({
      color: spec.shirtHex,
      roughness: 0.65,
      metalness: 0.08,
    });
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.124, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      capMat
    );
    capDome.scale.set(0.95, 1.04, 1.05);
    capDome.position.set(0, 0.142, -0.004);
    capDome.castShadow = true;
    headPivot.add(capDome);

    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.135, 0.014, 14, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
      trimMat
    );
    visor.position.set(0, 0.146, 0.055);
    visor.rotation.x = 0.08;
    visor.castShadow = true;
    headPivot.add(visor);
  } else {
    // Base fitted hair scalp covering top, sides & back cleanly
    const scalp = new THREE.Mesh(
      new THREE.SphereGeometry(0.121, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    scalp.scale.set(0.94, 1.07, 1.06);
    scalp.position.set(0, 0.135, -0.014);
    scalp.rotation.x = -0.18;
    scalp.castShadow = true;
    headPivot.add(scalp);

    // Sideburns
    for (const side of [-1, 1]) {
      const sideburn = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.055, 0.026), hairMat);
      sideburn.position.set(side * 0.104, 0.108, 0.028);
      headPivot.add(sideburn);
    }

    if (spec.hairStyle === 'sidepart') {
      const topSweep = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.042, 0.16), hairMat);
      topSweep.position.set(0.012, 0.236, 0.005);
      topSweep.rotation.z = -0.14;
      headPivot.add(topSweep);
    } else if (spec.hairStyle === 'slick') {
      const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.12, 6, 10), hairMat);
      crest.rotation.x = Math.PI / 2 - 0.18;
      crest.scale.set(1.35, 1, 0.72);
      crest.position.set(0, 0.232, -0.008);
      headPivot.add(crest);
    } else if (spec.hairStyle === 'curly') {
      const offsets: [number, number, number][] = [
        [0, 0.242, 0.03],
        [-0.055, 0.232, 0.015],
        [0.055, 0.232, 0.015],
        [-0.04, 0.228, -0.055],
        [0.04, 0.228, -0.055],
      ];
      for (const [cx, cy, cz] of offsets) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), hairMat);
        curl.position.set(cx, cy, cz);
        headPivot.add(curl);
      }
    }
  }

  return {
    bodyPivot,
    headPivot,
    leftArmPivot: leftArm.armPivot,
    leftElbowPivot: leftArm.elbowPivot,
    rightArmPivot: rightArm.armPivot,
    rightElbowPivot: rightArm.elbowPivot,
    handAnchor,
  };
}

const SPECTATOR_SLOTS: {
  x: number;
  z: number;
  yaw: number;
  shirtHex: number;
  pantHex: number;
  skinHex: number;
  hairHex: number;
  shoeHex: number;
  hairStyle: HairStyle;
  hasBeard: boolean;
  scale: number;
}[] = [
  // Left flank (5 realistic spectators flanking the plank box & throwing lane)
  { x: -2.42, z: -2.95, yaw: Math.PI * 0.35, shirtHex: 0x065f46, pantHex: 0x1e293b, skinHex: 0xd99b66, hairHex: 0x1c1917, shoeHex: 0x3b2314, hairStyle: 'cap', hasBeard: true, scale: 0.98 },
  { x: -2.65, z: -1.85, yaw: Math.PI * 0.46, shirtHex: 0x1d4ed8, pantHex: 0x334155, skinHex: 0xe3a876, hairHex: 0x292524, shoeHex: 0x1e293b, hairStyle: 'sidepart', hasBeard: false, scale: 1.02 },
  { x: -2.48, z: -0.75, yaw: Math.PI * 0.52, shirtHex: 0xb45309, pantHex: 0x1f2937, skinHex: 0xc27e4c, hairHex: 0x171717, shoeHex: 0x451a03, hairStyle: 'curly', hasBeard: true, scale: 0.96 },
  { x: -2.72, z: 0.32, yaw: Math.PI * 0.58, shirtHex: 0x7e22ce, pantHex: 0x1e293b, skinHex: 0xebb98e, hairHex: 0x451a03, shoeHex: 0x27272a, hairStyle: 'slick', hasBeard: false, scale: 1.01 },
  { x: -2.5, z: 1.38, yaw: Math.PI * 0.65, shirtHex: 0xbe123c, pantHex: 0x27272a, skinHex: 0xd99b66, hairHex: 0x1c1917, shoeHex: 0x3f2e21, hairStyle: 'cap', hasBeard: false, scale: 0.99 },
  // Right flank (5 realistic spectators flanking the plank box & throwing lane)
  { x: 2.42, z: -2.95, yaw: -Math.PI * 0.35, shirtHex: 0x0f766e, pantHex: 0x1e293b, skinHex: 0xe3a876, hairHex: 0x27272a, shoeHex: 0x292524, hairStyle: 'sidepart', hasBeard: false, scale: 1.0 },
  { x: 2.65, z: -1.85, yaw: -Math.PI * 0.46, shirtHex: 0x9a3412, pantHex: 0x27272a, skinHex: 0xc98856, hairHex: 0x1c1917, shoeHex: 0x451a03, hairStyle: 'cap', hasBeard: true, scale: 0.97 },
  { x: 2.48, z: -0.75, yaw: -Math.PI * 0.52, shirtHex: 0x1e40af, pantHex: 0x1e293b, skinHex: 0xd99b66, hairHex: 0x3f2e21, shoeHex: 0x1f2937, hairStyle: 'slick', hasBeard: false, scale: 1.03 },
  { x: 2.72, z: 0.32, yaw: -Math.PI * 0.58, shirtHex: 0x15803d, pantHex: 0x334155, skinHex: 0xebb98e, hairHex: 0x171717, shoeHex: 0x3b2314, hairStyle: 'curly', hasBeard: true, scale: 0.98 },
  { x: 2.5, z: 1.38, yaw: -Math.PI * 0.65, shirtHex: 0xa16207, pantHex: 0x1f2937, skinHex: 0xc27e4c, hairHex: 0x1c1917, shoeHex: 0x27272a, hairStyle: 'sidepart', hasBeard: false, scale: 1.01 },
];

/**
 * Places 10 realistic articulated 3D spectators flanking both sides of the plank
 * and throwing lane so the courtyard looks like a populated live arena.
 */
export function createCrowdSpectators(textures: DaduketaTextureBundle): SpectatorCharacterRig[] {
  const rigs: SpectatorCharacterRig[] = [];

  SPECTATOR_SLOTS.forEach((slot, idx) => {
    const group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    group.rotation.y = slot.yaw;
    group.scale.setScalar(slot.scale);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 1.05),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.016;
    group.add(shadow);

    const built = buildRealisticHumanParts({
      shirtHex: slot.shirtHex,
      pantHex: slot.pantHex,
      skinHex: slot.skinHex,
      hairHex: slot.hairHex,
      shoeHex: slot.shoeHex,
      trimHex: textures.theme.jerseyTrimHex,
      hairStyle: slot.hairStyle,
      hasBeard: slot.hasBeard,
    });

    // Natural relaxed spectator arm stance (slight bend at elbows, varied slightly per person)
    const asym = idx % 2 === 0 ? 0.08 : -0.06;
    built.leftArmPivot.rotation.set(-0.18 + asym, 0, 0.12);
    built.leftElbowPivot.rotation.set(-0.42, 0, 0);
    built.rightArmPivot.rotation.set(-0.15 - asym, 0, -0.12);
    built.rightElbowPivot.rotation.set(-0.38, 0, 0);

    group.add(built.bodyPivot);

    rigs.push({
      group,
      bodyPivot: built.bodyPivot,
      headPivot: built.headPivot,
      rightArmPivot: built.rightArmPivot,
      rightElbowPivot: built.rightElbowPivot,
      leftArmPivot: built.leftArmPivot,
      leftElbowPivot: built.leftElbowPivot,
      baseYaw: slot.yaw,
      phaseOffset: idx * 0.85,
    });
  });

  return rigs;
}

export function createHumanThrower(textures: DaduketaTextureBundle): HumanThrowerRig {
  const group = new THREE.Group();
  // Positioned behind the foul line slightly left of lane center; rotated 180deg around Y so +Z local faces -Z forward toward plank box
  group.position.set(-0.28, 0, 2.75);
  group.rotation.y = Math.PI;

  // Ground contact shadow
  const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  group.add(shadow);

  const built = buildRealisticHumanParts({
    shirtHex: textures.theme.jerseyHex,
    pantHex: 0x1e293b,
    skinHex: 0xe3a876,
    hairHex: 0x1c1917,
    shoeHex: 0x78350f,
    trimHex: textures.theme.jerseyTrimHex,
    hairStyle: 'cap',
    hasBeard: true,
    staggerThrowStance: true,
    isThrower: true,
  });

  // Left balance arm in natural relaxed athletic offset
  built.leftArmPivot.rotation.set(-0.24, 0, 0.22);
  built.leftElbowPivot.rotation.set(-0.48, 0, 0);

  // Ready throwing right arm poised naturally in front of hip
  built.rightArmPivot.rotation.set(-0.42, 0, -0.14);
  built.rightElbowPivot.rotation.set(-0.88, 0, 0);

  group.add(built.bodyPivot);

  return {
    group,
    rightArmPivot: built.rightArmPivot,
    rightElbowPivot: built.rightElbowPivot,
    leftArmPivot: built.leftArmPivot,
    headPivot: built.headPivot,
    handAnchor: built.handAnchor,
    bodyPivot: built.bodyPivot,
  };
}

export function createPlankEnclosure(textures: DaduketaTextureBundle): PlankEnclosureRig {
  const pitCenterZ = -2.15;
  const pitTopY = 0.08;
  const strikePlankBaseZ = -1.44;
  const group = new THREE.Group();
  group.position.set(0, 0, pitCenterZ);

  // Golden-oak landing pit slab inside the 4-plank box
  const pitGeo = new THREE.BoxGeometry(2.68, pitTopY, 2.68);
  const pitMat = new THREE.MeshStandardMaterial({
    map: textures.pitSurface,
    bumpMap: textures.woodBump,
    bumpScale: 0.008,
    roughness: 0.5,
    metalness: 0.08,
  });
  const pit = new THREE.Mesh(pitGeo, pitMat);
  pit.position.y = pitTopY / 2;
  pit.receiveShadow = true;
  group.add(pit);

  const strikeWoodMat = new THREE.MeshStandardMaterial({
    map: textures.strikePlankWood,
    bumpMap: textures.woodBump,
    bumpScale: 0.02,
    roughness: 0.48,
    metalness: 0.1,
  });
  const guardWoodMat = new THREE.MeshStandardMaterial({
    map: textures.guardPlankWood,
    bumpMap: textures.woodBump,
    bumpScale: 0.015,
    roughness: 0.54,
    metalness: 0.08,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: textures.theme.metalHex,
    roughness: textures.theme.metalRoughness,
    metalness: textures.theme.metalness,
  });

  // 1 LARGE MAIN STRIKE PLANK (at the far -Z edge directly facing the player!)
  const strikePlankPivot = new THREE.Group();
  strikePlankPivot.position.set(0, 0, strikePlankBaseZ);
  group.add(strikePlankPivot);

  const strikeGeo = new THREE.BoxGeometry(3.04, 1.32, 0.32);
  const strikeMesh = new THREE.Mesh(strikeGeo, strikeWoodMat);
  strikeMesh.position.y = 0.66;
  strikeMesh.castShadow = true;
  strikeMesh.receiveShadow = true;
  strikePlankPivot.add(strikeMesh);

  // Top metallic cap rail & front face studs + corner plates on Main Strike Plank
  const capGeo = new THREE.BoxGeometry(3.08, 0.06, 0.35);
  const capMesh = new THREE.Mesh(capGeo, brassMat);
  capMesh.position.y = 1.33;
  strikePlankPivot.add(capMesh);

  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.1, 0.38), brassMat);
  basePlinth.position.y = 0.05;
  strikePlankPivot.add(basePlinth);

  const studGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14);
  for (const sx of [-1.18, 1.18]) {
    const stud = new THREE.Mesh(studGeo, brassMat);
    stud.rotation.x = Math.PI / 2;
    stud.position.set(sx, 1.02, 0.165);
    strikePlankPivot.add(stud);
  }

  // Impact flash ring mounted on the inner strike face (+Z side facing player)
  const ringGeo = new THREE.RingGeometry(0.14, 0.28, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: textures.theme.impactRingHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const impactRing = new THREE.Mesh(ringGeo, ringMat);
  impactRing.position.set(0, 0.72, 0.175);
  strikePlankPivot.add(impactRing);

  // Safe inner boundaries on the main wooden strike plank face (clears base plinth, top cap, and side guards/studs)
  const aimBounds: PlankEnclosureAimBounds = {
    minX: -1.08,
    maxX: 1.08,
    minY: 0.24,
    maxY: 1.15,
    defaultX: 0,
    defaultY: 0.72,
    strikeLocalZ: 0.16,
  };

  // Interactive Target Aim Reticle mounted just in front of the strike plank face (+Z)
  const aimReticleGroup = new THREE.Group();
  aimReticleGroup.name = 'plankAimReticle';
  aimReticleGroup.position.set(aimBounds.defaultX, aimBounds.defaultY, 0.172);

  const reticleBackdropMat = new THREE.MeshBasicMaterial({
    color: 0x160705,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const reticleBackdrop = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.17, 32), reticleBackdropMat);
  aimReticleGroup.add(reticleBackdrop);

  const reticleOuterMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const reticleOuterRing = new THREE.Mesh(new THREE.RingGeometry(0.112, 0.146, 32), reticleOuterMat);
  reticleOuterRing.name = 'aimReticleOuter';
  aimReticleGroup.add(reticleOuterRing);

  const reticleInnerMat = new THREE.MeshBasicMaterial({
    color: 0xfef3c7,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const reticleInnerRing = new THREE.Mesh(new THREE.RingGeometry(0.032, 0.05, 24), reticleInnerMat);
  reticleInnerRing.position.z = 0.002;
  aimReticleGroup.add(reticleInnerRing);

  const reticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), reticleOuterMat);
  reticleDot.position.z = 0.003;
  aimReticleGroup.add(reticleDot);

  const tickHorizGeo = new THREE.PlaneGeometry(0.056, 0.016);
  const tickVertGeo = new THREE.PlaneGeometry(0.016, 0.056);
  for (const dir of [-1, 1]) {
    const hTick = new THREE.Mesh(tickHorizGeo, reticleOuterMat);
    hTick.position.set(dir * 0.165, 0, 0.002);
    aimReticleGroup.add(hTick);

    const vTick = new THREE.Mesh(tickVertGeo, reticleOuterMat);
    vTick.position.set(0, dir * 0.165, 0.002);
    aimReticleGroup.add(vTick);
  }
  strikePlankPivot.add(aimReticleGroup);

  // Invisible Raycast Collider covering the strike plank face for accurate click/drag aiming
  const colliderGeo = new THREE.PlaneGeometry(3.2, 1.48);
  const colliderMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const strikeSurfaceCollider = new THREE.Mesh(colliderGeo, colliderMat);
  strikeSurfaceCollider.position.set(0, 0.66, 0.165);
  strikePlankPivot.add(strikeSurfaceCollider);

  // 3 SMALLER GUARD PLANKS enclosing the landing pit (Left -X, Right +X, Entry +Z)
  const sideGuardGeo = new THREE.BoxGeometry(0.2, 0.38, 2.78);
  const leftGuard = new THREE.Mesh(sideGuardGeo, guardWoodMat);
  leftGuard.position.set(-1.42, 0.19, 0.04);
  leftGuard.castShadow = true;
  leftGuard.receiveShadow = true;

  const rightGuard = new THREE.Mesh(sideGuardGeo, guardWoodMat);
  rightGuard.position.set(1.42, 0.19, 0.04);
  rightGuard.castShadow = true;
  rightGuard.receiveShadow = true;

  // Front entry-side guard plank (+Z side, lower profile so throws clear it and behind-player view sees full pit floor)
  const entryGuardGeo = new THREE.BoxGeometry(3.04, 0.22, 0.2);
  const entryGuard = new THREE.Mesh(entryGuardGeo, guardWoodMat);
  entryGuard.position.set(0, 0.11, 1.42);
  entryGuard.castShadow = true;
  entryGuard.receiveShadow = true;

  // Brass top accents & corner brackets on guard planks
  const sideRailGeo = new THREE.BoxGeometry(0.22, 0.028, 2.78);
  const leftRail = new THREE.Mesh(sideRailGeo, brassMat);
  leftRail.position.set(-1.42, 0.385, 0.04);
  const rightRail = new THREE.Mesh(sideRailGeo, brassMat);
  rightRail.position.set(1.42, 0.385, 0.04);

  const entryRailGeo = new THREE.BoxGeometry(3.04, 0.024, 0.22);
  const entryRail = new THREE.Mesh(entryRailGeo, brassMat);
  entryRail.position.set(0, 0.225, 1.42);

  for (const [bx, bz] of [
    [-1.42, 1.42],
    [1.42, 1.42],
  ]) {
    const cornerCap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), brassMat);
    cornerCap.position.set(bx, 0.13, bz);
    group.add(cornerCap);
  }

  group.add(leftGuard, rightGuard, entryGuard, leftRail, rightRail, entryRail);

  return {
    group,
    strikePlankPivot,
    strikePlankBaseZ,
    impactRing,
    aimReticleGroup,
    strikeSurfaceCollider,
    aimBounds,
    pitCenterZ,
    pitTopY,
    strikeFaceZ: pitCenterZ + strikePlankBaseZ + 0.16,
  };
}

export function createDaduketaDie(textures: DaduketaTextureBundle): DaduketaDieRig {
  const halfSize = 0.105;
  const size = halfSize * 2;
  const group = new THREE.Group();

  // Order matches BoxGeometry: +X(6), -X(15), +Y(18), -Y(3), +Z(9), -Z(12)
  const faceOrder: (3 | 6 | 9 | 12 | 15 | 18)[] = [6, 15, 18, 3, 9, 12];
  const materials = faceOrder.map(
    (face) =>
      new THREE.MeshPhysicalMaterial({
        map: textures.dieFaces[face],
        roughness: 0.24,
        metalness: 0.05,
        clearcoat: 0.55,
        clearcoatRoughness: 0.18,
      })
  );

  const dieGeo = new THREE.BoxGeometry(size, size, size);
  const dieMesh = new THREE.Mesh(dieGeo, materials);
  dieMesh.castShadow = true;
  dieMesh.receiveShadow = true;
  group.add(dieMesh);

  // Subtle dark-slate edge wireframe border for crisp silhouette on black die
  const edgesGeo = new THREE.EdgesGeometry(dieGeo);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x52525b, transparent: true, opacity: 0.7 });
  const edges = new THREE.LineSegments(edgesGeo, edgesMat);
  group.add(edges);

  // Contact shadow disc tracked underneath die
  const shadowGeo = new THREE.PlaneGeometry(0.46, 0.46);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;

  return { group, shadowMesh, halfSize };
}
