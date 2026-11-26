import { DiceFace } from './types';
import { WORLD_COUNTRIES } from './worldCountries';

export const DADUKETA_FACES: readonly DiceFace[] = [3, 6, 9, 12, 15, 18];

export const DADUKETA_OPPOSITES: Record<DiceFace, DiceFace> = {
  3: 18,
  18: 3,
  6: 15,
  15: 6,
  9: 12,
  12: 9,
};

export const GLOBAL_COUNTRIES: readonly string[] = WORLD_COUNTRIES.map((c) => c.name);

export const COUNTRY_ISO_CODES: Record<string, string> = Object.fromEntries(
  WORLD_COUNTRIES.map((c) => [c.name, c.iso])
);

export const COUNTRY_PHONE_CODES: Record<string, string> = Object.fromEntries(
  WORLD_COUNTRIES.map((c) => [c.name, c.dialCode])
);

export interface AvatarFrameStyleDef {
  readonly id: string;
  readonly label: string;
  readonly outerClass: string;
  readonly borderClass: string;
}

export const AVATAR_FRAME_STYLES: readonly AvatarFrameStyleDef[] = [
  {
    id: 'classic-gold',
    label: 'Classic Gold',
    outerClass: 'bg-gradient-to-b from-amber-300 via-amber-500 to-amber-800',
    borderClass: 'border border-amber-300/80',
  },
  {
    id: 'emerald-vip',
    label: 'Emerald VIP',
    outerClass: 'bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-900',
    borderClass: 'border border-emerald-300/80',
  },
  {
    id: 'ruby-champion',
    label: 'Ruby Champion',
    outerClass: 'bg-gradient-to-b from-rose-300 via-rose-500 to-rose-900',
    borderClass: 'border border-rose-300/80',
  },
  {
    id: 'sapphire-ice',
    label: 'Sapphire Frost',
    outerClass: 'bg-gradient-to-b from-sky-300 via-blue-500 to-indigo-900',
    borderClass: 'border border-sky-300/80',
  },
  {
    id: 'royal-amethyst',
    label: 'Royal Amethyst',
    outerClass: 'bg-gradient-to-b from-purple-300 via-violet-500 to-purple-950',
    borderClass: 'border border-purple-300/80',
  },
  {
    id: 'obsidian-steel',
    label: 'Obsidian Steel',
    outerClass: 'bg-gradient-to-b from-slate-300 via-slate-600 to-slate-900',
    borderClass: 'border border-slate-300/75',
  },
  {
    id: 'platinum-halo',
    label: 'Platinum Halo',
    outerClass: 'bg-gradient-to-b from-cyan-200 via-teal-400 to-slate-800',
    borderClass: 'border border-cyan-200/85',
  },
  {
    id: 'bronze-crest',
    label: 'Bronze Crest',
    outerClass: 'bg-gradient-to-b from-orange-300 via-amber-700 to-stone-900',
    borderClass: 'border border-orange-300/75',
  },
  {
    id: 'crimson-flame',
    label: 'Crimson Flame',
    outerClass: 'bg-gradient-to-b from-yellow-300 via-red-500 to-red-950',
    borderClass: 'border border-orange-300/85',
  },
  {
    id: 'neon-cyber',
    label: 'Neon Mint',
    outerClass: 'bg-gradient-to-b from-lime-300 via-emerald-400 to-teal-900',
    borderClass: 'border border-lime-300/85',
  },
];

export const SRI_LANKAN_BANKS: readonly string[] = [
  'Bank of Ceylon (BOC)',
  "People's Bank",
  'Commercial Bank of Ceylon PLC',
  'Hatton National Bank PLC (HNB)',
  'Sampath Bank PLC',
  'Seylan Bank PLC',
  'Nations Trust Bank PLC (NTB)',
  'National Development Bank PLC (NDB)',
  'DFCC Bank PLC',
  'Pan Asia Banking Corporation PLC',
  'Union Bank of Colombo PLC',
  'Cargills Bank PLC',
  'National Savings Bank (NSB)',
  'Amana Bank PLC',
  'HSBC Sri Lanka',
  'Standard Chartered Bank Sri Lanka',
];
