import { TierId } from './types';

export interface BotConfig {
  enabled: boolean;
  sideBetBotsEnabled: boolean;
  /** Seconds a solo human waits in a room before opponent pairing triggers if no other real player enters (default 25s) */
  triggerWaitSeconds: number;
  /** Seconds into the side-bet window before a counter-bet triggers if unmatched */
  sideBetTriggerDelaySeconds: number;
  /** Maximum token stake a bot can risk in a single main dice match */
  maxPerMatchStakeTokens: number;
  /** Maximum token stake a bot can risk in a single side-bet round */
  maxPerRoundSideBetTokens: number;
  /** Maximum cumulative net loss allowed for bots in any rolling 1-hour window */
  maxHourlyLossTokens: number;
  /** Maximum cumulative net loss allowed for bots in any rolling 24-hour window */
  maxDailyLossTokens: number;
  /** Pause bots for cooldownMatches matches after this many consecutive bot losses (zero Martingale) */
  cooldownAfterLosses: number;
  /** Number of matches bots sit out when consecutive-loss cooldown triggers */
  cooldownMatchCount: number;
  /** Flag a human player for Admin review if consecutive wins reach this threshold */
  winStreakAlertThreshold: number;
  /** Only allow bots inside these room tiers (defaults to Tier 1 low stakes) */
  allowedTierIds: TierId[];
  updatedAt: number;
  updatedBy?: string;
}

export interface BotLiquidityLedgerEntry {
  id: string;
  kind: 'MAIN_MATCH' | 'SIDE_BET' | 'POOL_TOPUP' | 'POOL_WITHDRAW' | 'POOL_SET' | 'POOL_BURN_SURPLUS';
  boardId?: string;
  roomLabel: string;
  botUsername: string;
  opponentSummary: string;
  stakeTokens: number;
  payoutTokens: number;
  /** Positive = bot pool profit, Negative = bot pool loss */
  netTokens: number;
  poolBalanceAfter: number;
  note: string;
  createdAt: number;
}

export type RiskAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type RiskAlertType =
  | 'WIN_STREAK'
  | 'HIGH_WIN_RATE'
  | 'BOT_LOSS_CAP_HIT'
  | 'BOT_POOL_LOW'
  | 'STATE_TAMPER_ATTEMPT'
  | 'PROMO_BUDGET_CAP_HIT'
  | 'PROMO_IP_CLUSTER_ALERT'
  | 'PROMO_WITHDRAWAL_REVIEW';

export interface RiskAlertEntry {
  id: string;
  type: RiskAlertType;
  severity: RiskAlertSeverity;
  userId?: string;
  username?: string;
  title: string;
  details: string;
  metrics?: Record<string, string | number>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  createdAt: number;
}

export interface BotRiskSummary {
  poolBalanceTokens: number;
  hourlyNetPnlTokens: number;
  dailyNetPnlTokens: number;
  hourlyLossUsedTokens: number;
  dailyLossUsedTokens: number;
  consecutiveLosses: number;
  cooldownMatchesRemaining: number;
  isAutoPaused: boolean;
  autoPausedReason: string | null;
}

export interface BotRuntimeSnapshot {
  config: BotConfig;
  summary: BotRiskSummary;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: true,
  sideBetBotsEnabled: true,
  triggerWaitSeconds: 25,
  sideBetTriggerDelaySeconds: 8,
  maxPerMatchStakeTokens: 1500,
  maxPerRoundSideBetTokens: 300,
  maxHourlyLossTokens: 1500,
  maxDailyLossTokens: 5000,
  cooldownAfterLosses: 3,
  cooldownMatchCount: 2,
  winStreakAlertThreshold: 5,
  allowedTierIds: [TierId.TIER_1, TierId.TIER_2, TierId.TIER_3],
  updatedAt: 0,
};

export const DEFAULT_BOT_POOL_BALANCE_TOKENS = 50000;
