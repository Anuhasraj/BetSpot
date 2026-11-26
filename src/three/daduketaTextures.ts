import * as THREE from 'three';
import { DiceFace, TierId } from '../domain/types';

export interface RoomArenaTheme {
  tierId: TierId;
  roomTitle: string;
  roomSubtitle: string;
  sceneBgHex: number;
  fogHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  keyLightHex: number;
  rimLightHex: number;
  lanternLightHex: number;
  lanternGlowHex: number;
  lanternEmissiveHex: number;
  floorBase: string;
  floorGrain: string;
  floorHighlight: string;
  runnerHex: number;
  metalHex: number;
  metalRoughness: number;
  metalness: number;
  pitInnerHex: string;
  pitMidHex: string;
  pitOuterHex: string;
  pitRingColor: string;
  pitDashColor: string;
  pitEmblemColor: string;
  strikeBase: string;
  strikeGrain: string;
  strikeHighlight: string;
  guardBase: string;
  guardGrain: string;
  guardHighlight: string;
  wallTop: string;
  wallMid: string;
  wallBot: string;
  dadoBg: string;
  brickA: string;
  brickB: string;
  brickC: string;
  darkTimberHex: number;
  bannerInner: string;
  bannerMid: string;
  bannerOuter: string;
  bannerBorder: string;
  bannerInnerTrim: string;
  bannerTitleColor: string;
  bannerSubColor: string;
  jerseyHex: number;
  jerseyTrimHex: number;
  impactRingHex: number;
  uiWrapperClass: string;
  uiCanvasClass: string;
  uiBadgeClass: string;
}

export const ROOM_ARENA_THEMES: Record<TierId, RoomArenaTheme> = {
  [TierId.TIER_1]: {
    tierId: TierId.TIER_1,
    roomTitle: 'BRONZE ROOM',
    roomSubtitle: 'TIER 1 · 20-PLAYER COURTYARD',
    sceneBgHex: 0x32170d,
    fogHex: 0x32170d,
    hemiSkyHex: 0xfff0d6,
    hemiGroundHex: 0x4b2010,
    keyLightHex: 0xfff3de,
    rimLightHex: 0xffb36b,
    lanternLightHex: 0xffa742,
    lanternGlowHex: 0xfef08a,
    lanternEmissiveHex: 0xff9826,
    floorBase: '#6B351B',
    floorGrain: '#331408',
    floorHighlight: '#9C5932',
    runnerHex: 0x4b1d0d,
    metalHex: 0xd97736,
    metalRoughness: 0.3,
    metalness: 0.84,
    pitInnerHex: '#E5BC82',
    pitMidHex: '#C28947',
    pitOuterHex: '#8E5821',
    pitRingColor: 'rgba(72, 26, 10, 0.38)',
    pitDashColor: 'rgba(110, 44, 16, 0.42)',
    pitEmblemColor: 'rgba(255, 208, 150, 0.45)',
    strikeBase: '#7A3217',
    strikeGrain: '#2F0F06',
    strikeHighlight: '#BA6232',
    guardBase: '#612712',
    guardGrain: '#2B0E06',
    guardHighlight: '#9B4E27',
    wallTop: '#5B3120',
    wallMid: '#77432B',
    wallBot: '#4B2718',
    dadoBg: '#33170E',
    brickA: '#5C2C1B',
    brickB: '#4E2416',
    brickC: '#683420',
    darkTimberHex: 0x3b170b,
    bannerInner: '#782818',
    bannerMid: '#4A150D',
    bannerOuter: '#260905',
    bannerBorder: '#D97706',
    bannerInnerTrim: '#FDBA74',
    bannerTitleColor: '#FFEDD5',
    bannerSubColor: '#FDBA74',
    jerseyHex: 0x7c2d12,
    jerseyTrimHex: 0xd97736,
    impactRingHex: 0xfdba74,
    uiWrapperClass: 'border-amber-600/50 bg-[#1B0A07]',
    uiCanvasClass: 'border-amber-600/30 bg-[#1B0A07]',
    uiBadgeClass: 'border-amber-600/50 bg-[#2E140B] text-amber-200',
  },
  [TierId.TIER_2]: {
    tierId: TierId.TIER_2,
    roomTitle: 'SILVER ROOM',
    roomSubtitle: 'TIER 2 · 20-PLAYER STONE HALL',
    sceneBgHex: 0x161f2b,
    fogHex: 0x161f2b,
    hemiSkyHex: 0xe2e8f0,
    hemiGroundHex: 0x1e293b,
    keyLightHex: 0xf8fafc,
    rimLightHex: 0x93c5fd,
    lanternLightHex: 0xbae6fd,
    lanternGlowHex: 0xe0f2fe,
    lanternEmissiveHex: 0x7dd3fc,
    floorBase: '#475569',
    floorGrain: '#1E293B',
    floorHighlight: '#94A3B8',
    runnerHex: 0x1e293b,
    metalHex: 0xe2e8f0,
    metalRoughness: 0.2,
    metalness: 0.92,
    pitInnerHex: '#E2E8F0',
    pitMidHex: '#94A3B8',
    pitOuterHex: '#475569',
    pitRingColor: 'rgba(15, 23, 42, 0.42)',
    pitDashColor: 'rgba(30, 41, 59, 0.45)',
    pitEmblemColor: 'rgba(241, 245, 249, 0.65)',
    strikeBase: '#334155',
    strikeGrain: '#0F172A',
    strikeHighlight: '#64748B',
    guardBase: '#283548',
    guardGrain: '#0F172A',
    guardHighlight: '#475569',
    wallTop: '#334155',
    wallMid: '#475569',
    wallBot: '#1E293B',
    dadoBg: '#111827',
    brickA: '#293548',
    brickB: '#1E293B',
    brickC: '#334155',
    darkTimberHex: 0x1e293b,
    bannerInner: '#334155',
    bannerMid: '#1E293B',
    bannerOuter: '#0F172A',
    bannerBorder: '#CBD5E1',
    bannerInnerTrim: '#F1F5F9',
    bannerTitleColor: '#F8FAFC',
    bannerSubColor: '#CBD5E1',
    jerseyHex: 0x334155,
    jerseyTrimHex: 0xe2e8f0,
    impactRingHex: 0xe0f2fe,
    uiWrapperClass: 'border-slate-400/50 bg-[#101824]',
    uiCanvasClass: 'border-slate-400/30 bg-[#101824]',
    uiBadgeClass: 'border-slate-300/45 bg-[#1E293B] text-slate-100',
  },
  [TierId.TIER_3]: {
    tierId: TierId.TIER_3,
    roomTitle: 'GOLD ROOM',
    roomSubtitle: 'TIER 3 · 10-PLAYER ROYAL PAVILION',
    sceneBgHex: 0x361608,
    fogHex: 0x361608,
    hemiSkyHex: 0xfef3c7,
    hemiGroundHex: 0x5c2408,
    keyLightHex: 0xfff7dc,
    rimLightHex: 0xfbbf24,
    lanternLightHex: 0xfbbf24,
    lanternGlowHex: 0xfef08a,
    lanternEmissiveHex: 0xf59e0b,
    floorBase: '#783B14',
    floorGrain: '#3D1906',
    floorHighlight: '#B46927',
    runnerHex: 0x6b1010,
    metalHex: 0xfbbf24,
    metalRoughness: 0.18,
    metalness: 0.92,
    pitInnerHex: '#FEF08A',
    pitMidHex: '#D97706',
    pitOuterHex: '#92400E',
    pitRingColor: 'rgba(92, 34, 6, 0.45)',
    pitDashColor: 'rgba(120, 53, 15, 0.5)',
    pitEmblemColor: 'rgba(254, 243, 199, 0.75)',
    strikeBase: '#7C2D12',
    strikeGrain: '#3B1105',
    strikeHighlight: '#C2591B',
    guardBase: '#63240E',
    guardGrain: '#2D0D04',
    guardHighlight: '#A14617',
    wallTop: '#6E3818',
    wallMid: '#8C491F',
    wallBot: '#52260F',
    dadoBg: '#3D1609',
    brickA: '#6E2A14',
    brickB: '#581F0E',
    brickC: '#7D351A',
    darkTimberHex: 0x451806,
    bannerInner: '#991B1B',
    bannerMid: '#5C0D0D',
    bannerOuter: '#2D0606',
    bannerBorder: '#FBBF24',
    bannerInnerTrim: '#FEF08A',
    bannerTitleColor: '#FEF9C3',
    bannerSubColor: '#FDE047',
    jerseyHex: 0x991b1b,
    jerseyTrimHex: 0xfbbf24,
    impactRingHex: 0xfef08a,
    uiWrapperClass: 'border-amber-400/55 bg-[#1D0B05]',
    uiCanvasClass: 'border-amber-400/35 bg-[#1D0B05]',
    uiBadgeClass: 'border-amber-400/55 bg-[#3A1907] text-amber-200',
  },
  [TierId.TIER_4]: {
    tierId: TierId.TIER_4,
    roomTitle: 'PLATINUM ROOM',
    roomSubtitle: 'TIER 4 · 10-PLAYER ROYAL VAULT',
    sceneBgHex: 0x1b1033,
    fogHex: 0x1b1033,
    hemiSkyHex: 0xf3e8ff,
    hemiGroundHex: 0x2e1065,
    keyLightHex: 0xfaf5ff,
    rimLightHex: 0xc084fc,
    lanternLightHex: 0xd8b4fe,
    lanternGlowHex: 0xf5f3ff,
    lanternEmissiveHex: 0xa855f7,
    floorBase: '#4C1D95',
    floorGrain: '#1E0845',
    floorHighlight: '#8B5CF6',
    runnerHex: 0x2e1065,
    metalHex: 0xf5f3ff,
    metalRoughness: 0.14,
    metalness: 0.96,
    pitInnerHex: '#FAF5FF',
    pitMidHex: '#A78BFA',
    pitOuterHex: '#4C1D95',
    pitRingColor: 'rgba(46, 16, 101, 0.5)',
    pitDashColor: 'rgba(91, 33, 182, 0.5)',
    pitEmblemColor: 'rgba(245, 243, 255, 0.85)',
    strikeBase: '#3B0764',
    strikeGrain: '#17032B',
    strikeHighlight: '#7E22CE',
    guardBase: '#2E1065',
    guardGrain: '#140533',
    guardHighlight: '#6D28D9',
    wallTop: '#3B1D6E',
    wallMid: '#4C1D95',
    wallBot: '#240E4A',
    dadoBg: '#160730',
    brickA: '#3B1373',
    brickB: '#2D0D59',
    brickC: '#4D1A94',
    darkTimberHex: 0x1e093d,
    bannerInner: '#6D28D9',
    bannerMid: '#4C1D95',
    bannerOuter: '#1E0845',
    bannerBorder: '#F5F3FF',
    bannerInnerTrim: '#DDD6FE',
    bannerTitleColor: '#FFFFFF',
    bannerSubColor: '#DDD6FE',
    jerseyHex: 0x4c1d95,
    jerseyTrimHex: 0xf5f3ff,
    impactRingHex: 0xe9d5ff,
    uiWrapperClass: 'border-violet-300/60 bg-[#160B2B]',
    uiCanvasClass: 'border-violet-300/35 bg-[#160B2B]',
    uiBadgeClass: 'border-violet-300/55 bg-[#2D1459] text-violet-100',
  },
  [TierId.TIER_5]: {
    tierId: TierId.TIER_5,
    roomTitle: 'DIAMOND ROOM',
    roomSubtitle: 'TIER 5 · 6-PLAYER CRYSTAL SANCTUM',
    sceneBgHex: 0x062836,
    fogHex: 0x062836,
    hemiSkyHex: 0xecfeff,
    hemiGroundHex: 0x0e7490,
    keyLightHex: 0xf0fdfa,
    rimLightHex: 0x22d3ee,
    lanternLightHex: 0x22d3ee,
    lanternGlowHex: 0xecfeff,
    lanternEmissiveHex: 0x06b6d4,
    floorBase: '#0E7490',
    floorGrain: '#063242',
    floorHighlight: '#22D3EE',
    runnerHex: 0x164e63,
    metalHex: 0xecfeff,
    metalRoughness: 0.08,
    metalness: 0.96,
    pitInnerHex: '#ECFEFF',
    pitMidHex: '#22D3EE',
    pitOuterHex: '#0E7490',
    pitRingColor: 'rgba(8, 51, 68, 0.5)',
    pitDashColor: 'rgba(14, 116, 144, 0.55)',
    pitEmblemColor: 'rgba(236, 254, 255, 0.9)',
    strikeBase: '#155E75',
    strikeGrain: '#083344',
    strikeHighlight: '#06B6D4',
    guardBase: '#0E4B5E',
    guardGrain: '#062836',
    guardHighlight: '#0891B2',
    wallTop: '#0E6078',
    wallMid: '#0E7490',
    wallBot: '#083D4E',
    dadoBg: '#062630',
    brickA: '#0E627A',
    brickB: '#0A4B5E',
    brickC: '#137B99',
    darkTimberHex: 0x083344,
    bannerInner: '#0891B2',
    bannerMid: '#0E7490',
    bannerOuter: '#083344',
    bannerBorder: '#A5F3FC',
    bannerInnerTrim: '#ECFEFF',
    bannerTitleColor: '#FFFFFF',
    bannerSubColor: '#A5F3FC',
    jerseyHex: 0x0891b2,
    jerseyTrimHex: 0xecfeff,
    impactRingHex: 0x67e8f9,
    uiWrapperClass: 'border-cyan-300/65 bg-[#05202B]',
    uiCanvasClass: 'border-cyan-300/40 bg-[#05202B]',
    uiBadgeClass: 'border-cyan-300/60 bg-[#0A3D4F] text-cyan-100',
  },
  [TierId.TIER_6]: {
    tierId: TierId.TIER_6,
    roomTitle: 'VIP ROOM',
    roomSubtitle: 'TIER 6 · 2-PLAYER SOVEREIGN SUITE',
    sceneBgHex: 0x1a0610,
    fogHex: 0x1a0610,
    hemiSkyHex: 0xffe4e6,
    hemiGroundHex: 0x3b071e,
    keyLightHex: 0xfff1d6,
    rimLightHex: 0xfb7185,
    lanternLightHex: 0xfde047,
    lanternGlowHex: 0xfef9c3,
    lanternEmissiveHex: 0xf59e0b,
    floorBase: '#2A101B',
    floorGrain: '#0D0307',
    floorHighlight: '#6B1D3B',
    runnerHex: 0x7f1d3a,
    metalHex: 0xfde047,
    metalRoughness: 0.14,
    metalness: 0.96,
    pitInnerHex: '#4C1D2D',
    pitMidHex: '#2B0D19',
    pitOuterHex: '#13040A',
    pitRingColor: 'rgba(253, 224, 71, 0.55)',
    pitDashColor: 'rgba(251, 191, 36, 0.5)',
    pitEmblemColor: 'rgba(254, 240, 138, 0.85)',
    strikeBase: '#3D1022',
    strikeGrain: '#14040B',
    strikeHighlight: '#881337',
    guardBase: '#2B0B18',
    guardGrain: '#100309',
    guardHighlight: '#6B1531',
    wallTop: '#360E1F',
    wallMid: '#4C132B',
    wallBot: '#210712',
    dadoBg: '#120309',
    brickA: '#3D0F23',
    brickB: '#2E0A1A',
    brickC: '#4D142C',
    darkTimberHex: 0x1c050f,
    bannerInner: '#881337',
    bannerMid: '#4C0519',
    bannerOuter: '#1F020B',
    bannerBorder: '#FDE047',
    bannerInnerTrim: '#FEF08A',
    bannerTitleColor: '#FEF9C3',
    bannerSubColor: '#FDE047',
    jerseyHex: 0x1c0611,
    jerseyTrimHex: 0xfde047,
    impactRingHex: 0xfde047,
    uiWrapperClass: 'border-amber-300/65 bg-[#18050D]',
    uiCanvasClass: 'border-amber-300/40 bg-[#18050D]',
    uiBadgeClass: 'border-amber-300/60 bg-[#3B0D21] text-amber-200',
  },
};

export interface DaduketaTextureBundle {
  theme: RoomArenaTheme;
  courtyardWood: THREE.CanvasTexture;
  strikePlankWood: THREE.CanvasTexture;
  guardPlankWood: THREE.CanvasTexture;
  pitSurface: THREE.CanvasTexture;
  stoneWall: THREE.CanvasTexture;
  brickDado: THREE.CanvasTexture;
  arenaBanner: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  dieFaces: Record<DiceFace, THREE.CanvasTexture>;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeWoodTexture(
  baseHex: string,
  grainHex: string,
  highlightHex: string,
  plankRows: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const plankHeight = size / plankRows;
  for (let row = 0; row < plankRows; row++) {
    const y0 = row * plankHeight;
    ctx.fillStyle = row % 2 === 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, y0, size, plankHeight);

    for (let i = 0; i < 24; i++) {
      const gy = y0 + (i / 24) * plankHeight + ((i * 7) % 5);
      ctx.strokeStyle = i % 3 === 0 ? highlightHex : grainHex;
      ctx.globalAlpha = i % 4 === 0 ? 0.22 : 0.14;
      ctx.lineWidth = 1.2 + (i % 3) * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= size; x += 64) {
        const wave = Math.sin((x / size) * Math.PI * 2 + row * 1.7 + i) * 2.5;
        ctx.lineTo(x, gy + wave);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(0, y0, size, 2.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makePitSurfaceTexture(theme: RoomArenaTheme, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 360);
  grad.addColorStop(0, theme.pitInnerHex);
  grad.addColorStop(0.58, theme.pitMidHex);
  grad.addColorStop(1, theme.pitOuterHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1.4;
  for (let y = 8; y < size; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 48) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.1) * 2.2);
    }
    ctx.stroke();
  }

  // Concentric center landing rings
  ctx.strokeStyle = theme.pitRingColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(256, 256, 178, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = theme.pitDashColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center room emblem ring
  ctx.strokeStyle = theme.pitEmblemColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(256, 256, 186, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function drawWhitePip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.arc(x, y + 1.5, r + 2.5, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.82, '#F8FAFC');
  grad.addColorStop(1, '#D1D5DB');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function getDaduketaPipLayout(face: DiceFace): { points: [number, number][]; radius: number } {
  switch (face) {
    case 3:
      return {
        radius: 28,
        points: [
          [128, 128],
          [256, 256],
          [384, 384],
        ],
      };
    case 6:
      return {
        radius: 27,
        points: [
          [172, 128],
          [340, 128],
          [172, 256],
          [340, 256],
          [172, 384],
          [340, 384],
        ],
      };
    case 9:
      return {
        radius: 23,
        points: [
          [256, 256],
          [122, 122],
          [189, 189],
          [323, 323],
          [390, 390],
          [390, 122],
          [323, 189],
          [189, 323],
          [122, 390],
        ],
      };
    case 12:
      return {
        radius: 22,
        points: [
          [106, 106],
          [184, 106],
          [106, 184],
          [406, 106],
          [328, 106],
          [406, 184],
          [106, 406],
          [184, 406],
          [106, 328],
          [406, 406],
          [328, 406],
          [406, 328],
        ],
      };
    case 15: {
      const pts: [number, number][] = [[256, 256]];
      const ringR = 152;
      for (let i = 0; i < 14; i++) {
        const angle = (i * Math.PI * 2) / 14 - Math.PI / 2;
        pts.push([256 + Math.cos(angle) * ringR, 256 + Math.sin(angle) * ringR]);
      }
      return { radius: 19, points: pts };
    }
    case 18: {
      const xs = [94, 159, 224, 288, 353, 418];
      const ys = [142, 256, 370];
      const pts: [number, number][] = [];
      for (const y of ys) {
        for (const x of xs) {
          pts.push([x, y]);
        }
      }
      return { radius: 19, points: pts };
    }
  }
}

function makeDieFaceTexture(face: DiceFace, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createRadialGradient(256, 256, 24, 256, 256, 340);
  bg.addColorStop(0, '#1C1C21');
  bg.addColorStop(0.7, '#111115');
  bg.addColorStop(1, '#070709');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#2E2E36';
  ctx.lineWidth = 14;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  ctx.strokeStyle = '#3F3F46';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, size - 72, size - 72);

  const { points, radius } = getDaduketaPipLayout(face);
  for (const [px, py] of points) {
    drawWhitePip(ctx, px, py, radius);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
  grad.addColorStop(0, 'rgba(10, 3, 2, 0.72)');
  grad.addColorStop(0.55, 'rgba(14, 5, 2, 0.34)');
  grad.addColorStop(1, 'rgba(14, 5, 2, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeStoneWallTexture(theme: RoomArenaTheme, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const wallGrad = ctx.createLinearGradient(0, 0, 0, size);
  wallGrad.addColorStop(0, theme.wallTop);
  wallGrad.addColorStop(0.45, theme.wallMid);
  wallGrad.addColorStop(1, theme.wallBot);
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const r = 6 + (i % 14);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.07)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.lineWidth = 3;
  for (let y = 64; y < size; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeBrickDadoTexture(theme: RoomArenaTheme, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = theme.dadoBg;
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const bh = size / rows;
  const bw = size / cols;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : bw / 2;
    for (let c = -1; c <= cols; c++) {
      const bx = c * bw + offset;
      const by = r * bh;
      const shade = (r * 7 + c * 11) % 3;
      ctx.fillStyle = shade === 0 ? theme.brickA : shade === 1 ? theme.brickB : theme.brickC;
      ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(bx + 3, by + 3, bw - 6, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeArenaBannerTexture(theme: RoomArenaTheme, maxAnisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 540);
  grad.addColorStop(0, theme.bannerInner);
  grad.addColorStop(0.65, theme.bannerMid);
  grad.addColorStop(1, theme.bannerOuter);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = theme.bannerBorder;
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.strokeStyle = theme.bannerInnerTrim;
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, w - 72, h - 72);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 165, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = theme.bannerTitleColor;
  ctx.font = 'bold 84px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(theme.roomTitle, w / 2, h / 2 - 24);

  ctx.fillStyle = theme.bannerSubColor;
  ctx.font = '600 30px sans-serif';
  ctx.fillText(theme.roomSubtitle, w / 2, h / 2 + 54);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeWoodBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    const shade = 112 + ((y * 19) % 36);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createDaduketaTextures(
  maxAnisotropy: number,
  tierId: TierId = TierId.TIER_1
): DaduketaTextureBundle {
  const theme = ROOM_ARENA_THEMES[tierId] ?? ROOM_ARENA_THEMES[TierId.TIER_1];

  const courtyardWood = makeWoodTexture(
    theme.floorBase,
    theme.floorGrain,
    theme.floorHighlight,
    6,
    maxAnisotropy
  );
  courtyardWood.repeat.set(5, 5);

  const strikePlankWood = makeWoodTexture(
    theme.strikeBase,
    theme.strikeGrain,
    theme.strikeHighlight,
    4,
    maxAnisotropy
  );
  const guardPlankWood = makeWoodTexture(
    theme.guardBase,
    theme.guardGrain,
    theme.guardHighlight,
    3,
    maxAnisotropy
  );
  const pitSurface = makePitSurfaceTexture(theme, maxAnisotropy);
  const stoneWall = makeStoneWallTexture(theme, maxAnisotropy);
  const brickDado = makeBrickDadoTexture(theme, maxAnisotropy);
  const arenaBanner = makeArenaBannerTexture(theme, maxAnisotropy);
  const woodBump = makeWoodBumpTexture(maxAnisotropy);
  const contactShadow = makeContactShadowTexture();

  const dieFaces: Record<DiceFace, THREE.CanvasTexture> = {
    3: makeDieFaceTexture(3, maxAnisotropy),
    6: makeDieFaceTexture(6, maxAnisotropy),
    9: makeDieFaceTexture(9, maxAnisotropy),
    12: makeDieFaceTexture(12, maxAnisotropy),
    15: makeDieFaceTexture(15, maxAnisotropy),
    18: makeDieFaceTexture(18, maxAnisotropy),
  };

  return {
    theme,
    courtyardWood,
    strikePlankWood,
    guardPlankWood,
    pitSurface,
    stoneWall,
    brickDado,
    arenaBanner,
    woodBump,
    dieFaces,
    contactShadow,
    dispose: () => {
      courtyardWood.dispose();
      strikePlankWood.dispose();
      guardPlankWood.dispose();
      pitSurface.dispose();
      stoneWall.dispose();
      brickDado.dispose();
      arenaBanner.dispose();
      woodBump.dispose();
      contactShadow.dispose();
      Object.values(dieFaces).forEach((t) => t.dispose());
    },
  };
}

export function getTargetQuaternionForFace(face: DiceFace): THREE.Quaternion {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  switch (face) {
    case 18:
      euler.set(0, 0, 0, 'YXZ');
      break;
    case 3:
      euler.set(Math.PI, 0, 0, 'YXZ');
      break;
    case 9:
      euler.set(-Math.PI / 2, 0, 0, 'YXZ');
      break;
    case 12:
      euler.set(Math.PI / 2, Math.PI, 0, 'YXZ');
      break;
    case 6:
      euler.set(0, -Math.PI / 2, Math.PI / 2, 'YZX');
      break;
    case 15:
      euler.set(0, Math.PI / 2, -Math.PI / 2, 'YZX');
      break;
  }
  return new THREE.Quaternion().setFromEuler(euler);
}
