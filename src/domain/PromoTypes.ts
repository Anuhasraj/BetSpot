export interface PublicPromoConfig {
  welcomeBonusEnabled: boolean;
  welcomeBonusTokens: number;
  referralProgramEnabled: boolean;
  referralBonusTokens: number;
  referralMinDepositTokens: number;
  updatedAt: number;
}

export interface PromoConfig extends PublicPromoConfig {
  /** Anti-inflation: maximum free/promo tokens minted across rolling 24h window */
  dailyPromoMintCapTokens: number;
  /** Anti-inflation: maximum free/promo tokens minted across rolling 1h window */
  hourlyPromoMintCapTokens: number;
  /** Auto-turn OFF welcome bonus when global mint budget or daily/hourly cap is hit */
  autoPauseOnBudgetExhausted: boolean;
  /** Maximum rewarded referrals any single account can earn */
  maxReferralsPerUser: number;
  /** Block welcome/referral free tokens if same IP exceeds max free signups */
  blockSameIpMultiSignupBonus: boolean;
  /** Maximum new accounts from the same IP that can receive free signup tokens */
  maxSignupBonusesPerIp: number;
  /** Flag withdrawals for Admin review until user deposits real funds & hits playthrough */
  requireRealDepositToWithdrawPromo: boolean;
  /** Minimum real deposited tokens required before bonus-backed winnings pass Admin real-deposit audit */
  minRealDepositToUnlockTokens: number;
  /** Rollover multiplier on granted free tokens (e.g. 3x = must wager 3x bonus tokens) */
  promoPlaythroughMultiplier: number;
  /** Legacy Admin toggle kept for server compatibility */
  restrictPurePromoToTier1: boolean;
  updatedBy?: string;
}

export const DEFAULT_PROMO_BUDGET_POOL_TOKENS = 30000;

export const DEFAULT_PUBLIC_PROMO_CONFIG: PublicPromoConfig = {
  welcomeBonusEnabled: true,
  welcomeBonusTokens: 150,
  referralProgramEnabled: true,
  referralBonusTokens: 50,
  referralMinDepositTokens: 300,
  updatedAt: 0,
};

export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  ...DEFAULT_PUBLIC_PROMO_CONFIG,
  dailyPromoMintCapTokens: 3000,
  hourlyPromoMintCapTokens: 900,
  autoPauseOnBudgetExhausted: true,
  maxReferralsPerUser: 20,
  blockSameIpMultiSignupBonus: true,
  maxSignupBonusesPerIp: 2,
  requireRealDepositToWithdrawPromo: true,
  minRealDepositToUnlockTokens: 300,
  promoPlaythroughMultiplier: 3,
  restrictPurePromoToTier1: false,
};

export type ReferralStatus = 'PENDING_DEPOSIT' | 'REWARDED';

export interface ReferralRecord {
  id: string;
  referrerUserId: string;
  referrerUsername: string;
  referrerCode: string;
  refereeUserId: string;
  refereeUsername: string;
  status: ReferralStatus;
  qualifyingDepositTokens: number;
  qualifyingPaymentId?: string;
  referrerRewardTokens: number;
  refereeRewardTokens: number;
  createdAt: number;
  rewardedAt?: number;
}

export interface PendingBonusCredit {
  id: string;
  amountTokens: number;
  type: 'SIGNUP_BONUS' | 'REFERRAL_BONUS';
  description: string;
  referenceId: string;
  createdAt: number;
}

export interface UserReferralSummary {
  referralCode: string;
  totalInvited: number;
  pendingCount: number;
  qualifiedCount: number;
  totalEarnedTokens: number;
  referredByUsername?: string;
  referredByCode?: string;
  myReferralStatus?: ReferralStatus;
  referrals: ReferralRecord[];
}

export type PromoRiskFlag =
  | 'NONE'
  | 'SHARED_IP_RING'
  | 'MAX_REFERRAL_CAP'
  | 'NO_DEPOSIT_FARMER';

export type PromoLedgerKind =
  | 'WELCOME_MINT'
  | 'REFERRAL_MINT'
  | 'PROMO_PLAY_LOSS_TO_SYSTEM'
  | 'PROMO_PLAY_BURNED'
  | 'PROMO_WITHDRAWAL_LEAKAGE'
  | 'PROMO_REVOKED'
  | 'BUDGET_TOPUP'
  | 'BUDGET_REDUCE';

export interface PromoLedgerEntry {
  id: string;
  kind: PromoLedgerKind;
  userId?: string;
  username: string;
  relatedUsername?: string;
  tokenAmount: number;
  budgetRemainingAfter: number;
  unbackedCirculationAfter: number;
  /** Negative = system cost / real-money damage; Positive = fake tokens burned/revoked */
  realLiabilityImpactTokens: number;
  note: string;
  createdAt: number;
}

export interface PromoRiskSummary {
  budgetPoolTokens: number;
  totalMintedTokens: number;
  signupMintedTokens: number;
  referralMintedTokens: number;
  hourlyMintedTokens: number;
  dailyMintedTokens: number;
  unbackedCirculationTokens: number;
  burnedOrRecoveredTokens: number;
  systemLossToBotPoolTokens: number;
  realWithdrawalLeakageTokens: number;
  netUnbackedExposureTokens: number;
  promoHoldersCount: number;
  sharedIpFlaggedCount: number;
  isBudgetAutoPaused: boolean;
  autoPausedReason: string | null;
}
