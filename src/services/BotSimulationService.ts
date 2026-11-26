import {
  BotConfig,
  BotRiskSummary,
} from '../domain/BotRiskTypes';
import { DiceBoard } from '../domain/DiceBoard';
import { SIDE_BET_OPTIONS } from '../domain/SideBetRound';
import { TokenEconomy } from '../domain/TokenEconomy';
import {
  GamePhase,
  SideBetCategory,
  SideBetOptionKey,
  UserRole,
  UserStatus,
} from '../domain/types';
import { PRESET_AVATARS, User } from '../domain/User';

export interface StealthBotProfile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly country: string;
  readonly avatarFrameId: string;
  readonly avatarIndex: number;
}

export const BOT_STEALTH_PROFILES: readonly StealthBotProfile[] = [
  {
    id: 'bot_liquidity_1',
    username: 'kasun',
    displayName: 'Kasun Perera',
    country: 'Sri Lanka',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_2',
    username: 'danushka',
    displayName: 'Danushka Pathirana',
    country: 'Sri Lanka',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_3',
    username: 'nishan',
    displayName: 'Nishan Fernando',
    country: 'Sri Lanka',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_4',
    username: 'kaveesha',
    displayName: 'Kaveesha Madushan',
    country: 'Sri Lanka',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_5',
    username: 'chathura92',
    displayName: 'Chathura Rajapaksa',
    country: 'Sri Lanka',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_6',
    username: 'sajith',
    displayName: 'Sajith Karunaratne',
    country: 'Sri Lanka',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_7',
    username: 'anushka',
    displayName: 'Anushka Dissanayake',
    country: 'Sri Lanka',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_8',
    username: 'dilan',
    displayName: 'Dilan Silva',
    country: 'Sri Lanka',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_9',
    username: 'ravindu',
    displayName: 'Ravindu Mendis',
    country: 'Sri Lanka',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_10',
    username: 'tharindu',
    displayName: 'Tharindu Jayasuriya',
    country: 'Sri Lanka',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_11',
    username: 'dinuka',
    displayName: 'Dinuka Ranasinghe',
    country: 'Sri Lanka',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_12',
    username: 'lakshan',
    displayName: 'Lakshan Wickramasinghe',
    country: 'Sri Lanka',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_13',
    username: 'pradeep',
    displayName: 'Pradeep Kumara',
    country: 'Sri Lanka',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_14',
    username: 'lahiru',
    displayName: 'Lahiru Jayawardena',
    country: 'Sri Lanka',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_15',
    username: 'charith',
    displayName: 'Charith Bandara',
    country: 'Sri Lanka',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_16',
    username: 'chamari',
    displayName: 'Chamari Fonseka',
    country: 'Sri Lanka',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_17',
    username: 'rashmi',
    displayName: 'Rashmi Senanayake',
    country: 'Sri Lanka',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_18',
    username: 'isuru',
    displayName: 'Isuru Bandara',
    country: 'Sri Lanka',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_19',
    username: 'nuwan',
    displayName: 'Nuwan Prasad',
    country: 'Sri Lanka',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_20',
    username: 'malik',
    displayName: 'Malik Jayasinghe',
    country: 'Sri Lanka',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_21',
    username: 'gayan',
    displayName: 'Gayan Seneviratne',
    country: 'Sri Lanka',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_22',
    username: 'nadee',
    displayName: 'Nadeesha Perera',
    country: 'Sri Lanka',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_23',
    username: 'janith',
    displayName: 'Janith Wickramaratne',
    country: 'Sri Lanka',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_24',
    username: 'buddhi',
    displayName: 'Buddhika Alwis',
    country: 'Sri Lanka',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_25',
    username: 'harsha',
    displayName: 'Harsha Fernando',
    country: 'Sri Lanka',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_26',
    username: 'rohit',
    displayName: 'Rohit Sharma',
    country: 'India',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_27',
    username: 'priya',
    displayName: 'Priya Sharma',
    country: 'India',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_28',
    username: 'vikram',
    displayName: 'Vikram Patel',
    country: 'India',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_29',
    username: 'rahul',
    displayName: 'Rahul Nair',
    country: 'India',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_30',
    username: 'amit',
    displayName: 'Amit Kumar',
    country: 'India',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_31',
    username: 'sneha',
    displayName: 'Sneha Reddy',
    country: 'India',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_32',
    username: 'aditya',
    displayName: 'Aditya Joshi',
    country: 'India',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_33',
    username: 'deepak',
    displayName: 'Deepak Verma',
    country: 'India',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_34',
    username: 'manoj',
    displayName: 'Manoj Gupta',
    country: 'India',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_35',
    username: 'ananya',
    displayName: 'Ananya Sen',
    country: 'India',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_36',
    username: 'karan',
    displayName: 'Karan Malhotra',
    country: 'India',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_37',
    username: 'pooja',
    displayName: 'Pooja Singh',
    country: 'India',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_38',
    username: 'siddharth',
    displayName: 'Siddharth Menon',
    country: 'India',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_39',
    username: 'neha',
    displayName: 'Neha Iyer',
    country: 'India',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_40',
    username: 'rajesh',
    displayName: 'Rajesh Rao',
    country: 'India',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_41',
    username: 'oliver',
    displayName: 'Oliver Smith',
    country: 'United Kingdom',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_42',
    username: 'harry',
    displayName: 'Harry Wright',
    country: 'United Kingdom',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_43',
    username: 'jack',
    displayName: 'Jack Davies',
    country: 'United Kingdom',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_44',
    username: 'charlie',
    displayName: 'Charlie Brown',
    country: 'United Kingdom',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_45',
    username: 'george',
    displayName: 'George Taylor',
    country: 'United Kingdom',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_46',
    username: 'liam',
    displayName: 'Liam Wilson',
    country: 'United Kingdom',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_47',
    username: 'callum',
    displayName: 'Callum Jones',
    country: 'United Kingdom',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_48',
    username: 'sophie',
    displayName: 'Sophie Clarke',
    country: 'United Kingdom',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_49',
    username: 'james',
    displayName: 'James Miller',
    country: 'United Kingdom',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_50',
    username: 'emily',
    displayName: 'Emily Walker',
    country: 'United Kingdom',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_51',
    username: 'tariq',
    displayName: 'Tariq Al-Mansoori',
    country: 'United Arab Emirates',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_52',
    username: 'khalid',
    displayName: 'Khalid Al-Falasi',
    country: 'United Arab Emirates',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_53',
    username: 'omar',
    displayName: 'Omar Rashid',
    country: 'United Arab Emirates',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_54',
    username: 'rashid',
    displayName: 'Rashid Al-Maktoum',
    country: 'United Arab Emirates',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_55',
    username: 'zayed',
    displayName: 'Zayed Al-Nahyan',
    country: 'United Arab Emirates',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_56',
    username: 'faisal',
    displayName: 'Faisal Al-Nuaimi',
    country: 'United Arab Emirates',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_57',
    username: 'hamad',
    displayName: 'Hamad Al-Ketbi',
    country: 'United Arab Emirates',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_58',
    username: 'salem',
    displayName: 'Salem Al-Zaabi',
    country: 'United Arab Emirates',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_59',
    username: 'mitch',
    displayName: 'Mitchell Miller',
    country: 'Australia',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_60',
    username: 'lachlan',
    displayName: 'Lachlan Smith',
    country: 'Australia',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_61',
    username: 'connor',
    displayName: 'Connor Kelly',
    country: 'Australia',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_62',
    username: 'cooper',
    displayName: 'Cooper White',
    country: 'Australia',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_63',
    username: 'riley',
    displayName: 'Riley Baker',
    country: 'Australia',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_64',
    username: 'harrison',
    displayName: 'Harrison Davis',
    country: 'Australia',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_65',
    username: 'chloe',
    displayName: 'Chloe Thompson',
    country: 'Australia',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_66',
    username: 'blake',
    displayName: 'Blake Murphy',
    country: 'Australia',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_67',
    username: 'lucas',
    displayName: 'Lucas Tremblay',
    country: 'Canada',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_68',
    username: 'noah',
    displayName: 'Noah Campbell',
    country: 'Canada',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_69',
    username: 'ethan',
    displayName: 'Ethan Ross',
    country: 'Canada',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_70',
    username: 'logan',
    displayName: 'Logan Clark',
    country: 'Canada',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_71',
    username: 'owen',
    displayName: 'Owen MacDonald',
    country: 'Canada',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_72',
    username: 'maya',
    displayName: 'Maya Beaudoin',
    country: 'Canada',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_73',
    username: 'weijie',
    displayName: 'Wei Jie Tan',
    country: 'Singapore',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_74',
    username: 'junhao',
    displayName: 'Jun Hao Lim',
    country: 'Singapore',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_75',
    username: 'ziyang',
    displayName: 'Zi Yang Wong',
    country: 'Singapore',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_76',
    username: 'alicia',
    displayName: 'Alicia Lee',
    country: 'Singapore',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_77',
    username: 'marcus',
    displayName: 'Marcus Ng',
    country: 'Singapore',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_78',
    username: 'haikal',
    displayName: 'Haikal Azman',
    country: 'Malaysia',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_79',
    username: 'farhan',
    displayName: 'Farhan Razak',
    country: 'Malaysia',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_80',
    username: 'amirul',
    displayName: 'Amirul Shah',
    country: 'Malaysia',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_81',
    username: 'chong',
    displayName: 'Chong Wei Tan',
    country: 'Malaysia',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_82',
    username: 'hafiz',
    displayName: 'Hafiz Malik',
    country: 'Malaysia',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_83',
    username: 'tyler',
    displayName: 'Tyler Brooks',
    country: 'United States',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_84',
    username: 'brandon',
    displayName: 'Brandon Miller',
    country: 'United States',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_85',
    username: 'austin',
    displayName: 'Austin Hunt',
    country: 'United States',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_86',
    username: 'mason',
    displayName: 'Mason Reed',
    country: 'United States',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_87',
    username: 'chase',
    displayName: 'Chase Walker',
    country: 'United States',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_88',
    username: 'dakota',
    displayName: 'Dakota Evans',
    country: 'United States',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_89',
    username: 'max',
    displayName: 'Maximilian Schmidt',
    country: 'Germany',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_90',
    username: 'lukas',
    displayName: 'Lukas Weber',
    country: 'Germany',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
  {
    id: 'bot_liquidity_91',
    username: 'felix',
    displayName: 'Felix Bauer',
    country: 'Germany',
    avatarFrameId: 'classic-gold',
    avatarIndex: 0,
  },
  {
    id: 'bot_liquidity_92',
    username: 'niklas',
    displayName: 'Niklas Meyer',
    country: 'Germany',
    avatarFrameId: 'emerald-vip',
    avatarIndex: 1,
  },
  {
    id: 'bot_liquidity_93',
    username: 'julien',
    displayName: 'Julien Moreau',
    country: 'France',
    avatarFrameId: 'ruby-champion',
    avatarIndex: 2,
  },
  {
    id: 'bot_liquidity_94',
    username: 'matteo',
    displayName: 'Matteo Rossi',
    country: 'Italy',
    avatarFrameId: 'sapphire-ice',
    avatarIndex: 3,
  },
  {
    id: 'bot_liquidity_95',
    username: 'carlos',
    displayName: 'Carlos Garcia',
    country: 'Spain',
    avatarFrameId: 'royal-amethyst',
    avatarIndex: 4,
  },
  {
    id: 'bot_liquidity_96',
    username: 'kenji',
    displayName: 'Kenji Sato',
    country: 'Japan',
    avatarFrameId: 'obsidian-steel',
    avatarIndex: 5,
  },
  {
    id: 'bot_liquidity_97',
    username: 'minjun',
    displayName: 'Min-jun Kim',
    country: 'South Korea',
    avatarFrameId: 'platinum-halo',
    avatarIndex: 6,
  },
  {
    id: 'bot_liquidity_98',
    username: 'lars',
    displayName: 'Lars van den Berg',
    country: 'Netherlands',
    avatarFrameId: 'bronze-crest',
    avatarIndex: 7,
  },
  {
    id: 'bot_liquidity_99',
    username: 'kieran',
    displayName: 'Kieran Williams',
    country: 'New Zealand',
    avatarFrameId: 'crimson-flame',
    avatarIndex: 8,
  },
  {
    id: 'bot_liquidity_100',
    username: 'sibusiso',
    displayName: 'Sibusiso Dlamini',
    country: 'South Africa',
    avatarFrameId: 'neon-cyber',
    avatarIndex: 9,
  },
] as const;

function cryptoRandomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }
  return 0;
}

/**
 * Risk-guarded automated bot matchmaker & counter-liquidity provider.
 * Uses stealth player identities (natural handles, country flags, avatar frames)
 * while retaining strict internal `isBot: true` & `bot_liquidity_*` tracking for
 * Admin Panel telemetry and separate `bot_liquidity_ledger` accounting.
 */
export class BotSimulationService {
  public seedBotAccounts(users: Map<string, User>): User[] {
    const takenUsernames = new Set(
      Array.from(users.values())
        .filter((u) => !u.isBot)
        .map((u) => u.username.toLowerCase())
    );
    const seeded: User[] = [];
    BOT_STEALTH_PROFILES.forEach((profile) => {
      let bot = users.get(profile.id);
      if (!bot) {
        let candidateUsername = profile.username;
        let suffix = 2;
        while (takenUsernames.has(candidateUsername.toLowerCase())) {
          candidateUsername = `${profile.username}${suffix}`;
          suffix += 1;
        }
        takenUsernames.add(candidateUsername.toLowerCase());
        bot = new User({
          id: profile.id,
          username: candidateUsername,
          displayName: profile.displayName,
          email: `${profile.id}@system.betspot.local`,
          passwordHash: '',
          avatarUrl: PRESET_AVATARS[profile.avatarIndex % PRESET_AVATARS.length],
          avatarFrameId: profile.avatarFrameId,
          country: profile.country,
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
          initialBalance: 0,
          isBot: true,
        });
        users.set(bot.id, bot);
      } else {
        bot.username = profile.username;
        bot.displayName = profile.displayName;
        bot.country = profile.country;
        bot.avatarUrl = PRESET_AVATARS[profile.avatarIndex % PRESET_AVATARS.length];
        bot.avatarFrameId = profile.avatarFrameId;
      }
      seeded.push(bot);
    });
    return seeded;
  }

  public syncBotWalletForStake(bot: User, stakeNeeded: number): void {
    const cleanNeeded = Math.max(0, Math.round(stakeNeeded));
    const current = bot.wallet.availableBalance;
    if (current < cleanNeeded) {
      bot.wallet.adjustAvailableByAdmin(
        cleanNeeded - current,
        'Allocated capped bot liquidity from Bot Pool'
      );
    }
  }

  public getRemainingLossBudget(config: BotConfig, summary: BotRiskSummary): number {
    const hourlyLeft = Math.max(0, config.maxHourlyLossTokens - summary.hourlyLossUsedTokens);
    const dailyLeft = Math.max(0, config.maxDailyLossTokens - summary.dailyLossUsedTokens);
    return Math.min(hourlyLeft, dailyLeft);
  }

  public canSeatBotOnBoard(
    board: DiceBoard,
    config: BotConfig,
    summary: BotRiskSummary,
    allowAdditionalBot: boolean = false
  ): { ok: boolean; reason?: string } {
    if (!config.enabled) {
      return { ok: false, reason: 'Bot Matchmaker is turned OFF by Admin.' };
    }
    if (summary.isAutoPaused) {
      return { ok: false, reason: summary.autoPausedReason ?? 'Bot risk cap reached.' };
    }
    if (!config.allowedTierIds.includes(board.tier.id)) {
      return { ok: false, reason: `${board.tier.label} is restricted to real players only.` };
    }
    if (board.phase !== GamePhase.LOBBY_COUNTDOWN) {
      return { ok: false, reason: 'Board is not in lobby countdown.' };
    }
    if (allowAdditionalBot) {
      if (board.occupiedCount >= board.maxSeats || board.humanOccupiedCount < 1) {
        return { ok: false, reason: 'Room is full or has no human players.' };
      }
    } else if (board.occupiedCount !== 1 || board.hasBotSeated) {
      return { ok: false, reason: 'Real players already present or bot already seated.' };
    }
    const remainingBudget = this.getRemainingLossBudget(config, summary);
    if (remainingBudget < board.tier.minTokens || summary.poolBalanceTokens < board.tier.minTokens) {
      return { ok: false, reason: 'Remaining bot liquidity / loss budget below tier minimum.' };
    }
    return { ok: true };
  }

  public computeCappedMainStake(
    board: DiceBoard,
    config: BotConfig,
    summary: BotRiskSummary
  ): number {
    const humanSeat = board.occupiedSeats.find((s) => !s.isBot);
    const humanBet = humanSeat?.initialBet ?? board.tier.minTokens;
    const remainingLossBudget = this.getRemainingLossBudget(config, summary);
    const capped = Math.floor(
      Math.min(
        humanBet,
        config.maxPerMatchStakeTokens,
        remainingLossBudget,
        summary.poolBalanceTokens,
        board.tier.maxTokens
      )
    );
    return capped >= Math.max(TokenEconomy.MIN_BET_TOKENS, board.tier.minTokens) ? capped : 0;
  }

  public addBotsToBoard(
    board: DiceBoard,
    bots: readonly User[],
    config: BotConfig,
    summary: BotRiskSummary,
    requestedCount?: number
  ): User[] {
    const openSeats = board.maxSeats - board.occupiedCount;
    if (openSeats <= 0) return [];

    const desiredCount =
      requestedCount !== undefined
        ? Math.max(1, Math.min(openSeats, requestedCount))
        : 1 + cryptoRandomIndex(openSeats);

    const added: User[] = [];
    let remainingBudget = this.getRemainingLossBudget(config, summary);
    let remainingPool = summary.poolBalanceTokens;

    for (let i = 0; i < desiredCount; i += 1) {
      const check = this.canSeatBotOnBoard(board, config, summary, i > 0);
      if (!check.ok) break;

      const stake = this.computeCappedMainStake(board, config, summary);
      if (stake <= 0 || stake > remainingBudget || stake > remainingPool) break;

      const availableBots = bots.filter((b) => b.isBot && !board.isUserSeated(b.id));
      if (availableBots.length === 0) break;
      const availableBot = availableBots[cryptoRandomIndex(availableBots.length)];

      this.syncBotWalletForStake(availableBot, stake);
      board.joinMainSeat(availableBot, stake);
      remainingBudget -= stake;
      remainingPool -= stake;
      added.push(availableBot);
    }

    return added;
  }

  public addBotToBoard(
    board: DiceBoard,
    bots: readonly User[],
    config: BotConfig,
    summary: BotRiskSummary
  ): User | null {
    return this.addBotsToBoard(board, bots, config, summary, 1)[0] ?? null;
  }

  /** Places a counter-bet against the largest unmatched human side-bet pool, if any. */
  private tryPlaceCounterLiquidityBet(
    round: NonNullable<DiceBoard['activeSideBetRound']>,
    bots: readonly User[],
    config: BotConfig,
    remainingBudget: number,
    remainingPool: number
  ): { spent: number; summary?: string } {
    const unmatchedPools = round
      .getPoolSummaries()
      .filter((s) => s.totalUnmatched >= TokenEconomy.MIN_BET_TOKENS)
      .sort((a, b) => b.totalUnmatched - a.totalUnmatched);

    if (unmatchedPools.length === 0) return { spent: 0 };

    const target = unmatchedPools[0];
    const hasHumanContributor = round.bets.some(
      (b) =>
        b.category === target.category &&
        b.option === target.option &&
        !bots.some((bot) => bot.id === b.userId)
    );
    if (!hasHumanContributor) return { spent: 0 };

    const opposingOptions = SIDE_BET_OPTIONS[target.category as SideBetCategory].filter(
      (o) => o.key !== target.option
    );
    if (opposingOptions.length === 0) return { spent: 0 };

    const chosenOpposing: SideBetOptionKey =
      opposingOptions[cryptoRandomIndex(opposingOptions.length)].key;
    const stake = Math.floor(
      Math.min(
        target.totalUnmatched,
        config.maxPerRoundSideBetTokens,
        remainingBudget,
        remainingPool
      )
    );
    if (stake < TokenEconomy.MIN_BET_TOKENS) return { spent: 0 };

    const candidateBots = bots.filter((b) => b.isBot);
    if (candidateBots.length === 0) return { spent: 0 };
    const bot = candidateBots[cryptoRandomIndex(candidateBots.length)];

    try {
      this.syncBotWalletForStake(bot, stake);
      round.placeBet(bot, target.category, chosenOpposing, stake);
      return {
        spent: stake,
        summary: `${bot.username} bet ${stake.toLocaleString()} TKN on ${chosenOpposing}`,
      };
    } catch {
      return { spent: 0 };
    }
  }

  /** Places 1-2 organic side-bets by random bots across available categories. */
  private tryPlaceOrganicSideBets(
    board: DiceBoard,
    round: NonNullable<DiceBoard['activeSideBetRound']>,
    bots: readonly User[],
    config: BotConfig,
    remainingBudget: number,
    remainingPool: number
  ): { spent: number; summaries: string[] } {
    const organicBotCount = 1 + cryptoRandomIndex(2);
    const categories: SideBetCategory[] = [
      SideBetCategory.LOW_HIGH,
      SideBetCategory.COUPLE,
      SideBetCategory.SINGLE,
    ];
    let spent = 0;
    const summaries: string[] = [];

    for (let i = 0; i < organicBotCount; i += 1) {
      const maxStakeCap = Math.min(
        config.maxPerRoundSideBetTokens,
        remainingBudget - spent,
        remainingPool - spent,
        Math.max(TokenEconomy.MIN_BET_TOKENS * 4, board.tier.minTokens * 2)
      );
      if (maxStakeCap < TokenEconomy.MIN_BET_TOKENS) break;

      const candidateBots = bots.filter((b) => b.isBot);
      if (candidateBots.length === 0) break;
      const bot = candidateBots[cryptoRandomIndex(candidateBots.length)];
      const cat = categories[cryptoRandomIndex(categories.length)];
      const optionsInCat = SIDE_BET_OPTIONS[cat];
      if (!optionsInCat || optionsInCat.length === 0) continue;
      const opt = optionsInCat[cryptoRandomIndex(optionsInCat.length)].key;

      const minStake = TokenEconomy.MIN_BET_TOKENS;
      const span = Math.max(1, Math.floor(maxStakeCap) - minStake + 1);
      const rawStake = minStake + cryptoRandomIndex(span);
      const stake =
        rawStake >= 10
          ? Math.max(minStake, Math.min(Math.floor(maxStakeCap), Math.round(rawStake / 5) * 5))
          : rawStake;

      try {
        this.syncBotWalletForStake(bot, stake);
        round.placeBet(bot, cat, opt, stake);
        spent += stake;
        summaries.push(`${bot.username} bet ${stake.toLocaleString()} TKN on ${opt}`);
      } catch {
        // Ignore if bot already hedged on this category
      }
    }

    return { spent, summaries };
  }

  public placeAutomatedBotSideBets(
    board: DiceBoard,
    bots: readonly User[],
    config: BotConfig,
    summary: BotRiskSummary
  ): boolean {
    if (!config.enabled || !config.sideBetBotsEnabled || summary.isAutoPaused) {
      return false;
    }
    if (!config.allowedTierIds.includes(board.tier.id)) {
      return false;
    }
    const round = board.activeSideBetRound;
    if (!round || round.isClosed || round.isSettled) {
      return false;
    }

    const remainingBudget = this.getRemainingLossBudget(config, summary);
    const remainingPool = summary.poolBalanceTokens;
    const counter = this.tryPlaceCounterLiquidityBet(
      round,
      bots,
      config,
      remainingBudget,
      remainingPool
    );
    const organic = this.tryPlaceOrganicSideBets(
      board,
      round,
      bots,
      config,
      remainingBudget - counter.spent,
      remainingPool - counter.spent
    );

    const statusMessages = [
      ...(counter.summary ? [counter.summary] : []),
      ...organic.summaries,
    ];
    if (statusMessages.length > 0) {
      board.statusBanner = `${statusMessages[0]}.`;
      return true;
    }
    return false;
  }
}
