import { ServerDiceBoardSnapshot } from '../src/domain/DiceBoard';
import { DEFAULT_ECONOMY_CONFIG, EconomyConfig } from '../src/domain/EconomyTypes';
import { PublicPromoConfig, UserReferralSummary } from '../src/domain/PromoTypes';
import { PaymentRequest, TierId } from '../src/domain/types';
import { SerializedUser } from '../src/domain/User';

export class ServerInsufficientTokensError extends Error {
  public readonly code = 'INSUFFICIENT_TOKENS';
  public readonly requiredTokens: number;
  public readonly availableTokens: number;

  constructor(message: string, requiredTokens: number, availableTokens: number) {
    super(message);
    this.name = 'ServerInsufficientTokensError';
    this.requiredTokens = requiredTokens;
    this.availableTokens = availableTokens;
  }
}

export interface ServerWalletTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  heldAfter: number;
  description: string;
  createdAt: number;
  referenceId?: string;
}

export interface ServerSavedBankDetails {
  bankName: string;
  branch: string;
  accountHolder: string;
  accountNumber: string;
}

export interface ServerPendingBonusCredit {
  id: string;
  amountTokens: number;
  type: 'SIGNUP_BONUS' | 'REFERRAL_BONUS';
  description: string;
  referenceId: string;
  createdAt: number;
}

export interface ServerStoredUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  googleUid?: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  role: 'PLAYER' | 'HIGH_ROLLER';
  status: 'ACTIVE' | 'SUSPENDED';
  availableBalance: number;
  heldBalance: number;
  isBot: boolean;
  createdAt: number;
  country?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  ageVerified?: boolean;
  kycStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED';
  kycDocumentName?: string;
  kycDocumentDataUrl?: string;
  kycSubmittedAt?: number;
  kycLastDecision?: 'APPROVED' | 'REJECTED';
  kycReviewNote?: string;
  kycReviewedAt?: number;
  kycReviewedBy?: string;
  savedCryptoAddress?: string;
  savedBankDetails?: ServerSavedBankDetails;
  dailyBetLimitTokens?: number;
  transactions?: ServerWalletTransaction[];
  adminAdjustedAt?: number;
  pendingAdminCreditDelta?: number;
  referralCode?: string;
  referredByCode?: string;
  referredByUserId?: string;
  referredByUsername?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusTokens?: number;
  pendingBonusCredits?: ServerPendingBonusCredit[];
  promoSignupTokensGranted?: number;
  promoReferralTokensGranted?: number;
  promoTokensGrantedTotal?: number;
  promoTokensRemaining?: number;
  promoTokensWagered?: number;
  promoRealizedLossTokens?: number;
  promoRevokedTokens?: number;
  realDepositedTokens?: number;
  realWithdrawnTokens?: number;
  signupIpHash?: string;
  promoRiskFlag?: 'NONE' | 'SHARED_IP_RING' | 'MAX_REFERRAL_CAP' | 'NO_DEPOSIT_FARMER';
  promoAdminNote?: string;
}

export interface ServerPromoConfig {
  welcomeBonusEnabled: boolean;
  welcomeBonusTokens: number;
  referralProgramEnabled: boolean;
  referralBonusTokens: number;
  referralMinDepositTokens: number;
  dailyPromoMintCapTokens: number;
  hourlyPromoMintCapTokens: number;
  autoPauseOnBudgetExhausted: boolean;
  maxReferralsPerUser: number;
  blockSameIpMultiSignupBonus: boolean;
  maxSignupBonusesPerIp: number;
  requireRealDepositToWithdrawPromo: boolean;
  minRealDepositToUnlockTokens: number;
  promoPlaythroughMultiplier: number;
  restrictPurePromoToTier1: boolean;
  updatedAt: number;
  updatedBy?: string;
}

export type ServerPromoLedgerKind =
  | 'WELCOME_MINT'
  | 'REFERRAL_MINT'
  | 'PROMO_PLAY_LOSS_TO_SYSTEM'
  | 'PROMO_PLAY_BURNED'
  | 'PROMO_WITHDRAWAL_LEAKAGE'
  | 'PROMO_REVOKED'
  | 'BUDGET_TOPUP'
  | 'BUDGET_REDUCE';

export interface ServerPromoLedgerEntry {
  id: string;
  kind: ServerPromoLedgerKind;
  userId?: string;
  username: string;
  relatedUsername?: string;
  tokenAmount: number;
  budgetRemainingAfter: number;
  unbackedCirculationAfter: number;
  realLiabilityImpactTokens: number;
  note: string;
  createdAt: number;
}

export interface ServerPromoRiskSummary {
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

export type ServerReferralStatus = 'PENDING_DEPOSIT' | 'REWARDED';

export interface ServerReferralRecord {
  id: string;
  referrerUserId: string;
  referrerUsername: string;
  referrerCode: string;
  refereeUserId: string;
  refereeUsername: string;
  status: ServerReferralStatus;
  qualifyingDepositTokens: number;
  qualifyingPaymentId?: string;
  referrerRewardTokens: number;
  refereeRewardTokens: number;
  createdAt: number;
  rewardedAt?: number;
}

export interface ServerPaymentRequest {
  id: string;
  userId: string;
  username: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  method: string;
  tokenAmount: number;
  usdEquivalent: number;
  localCurrencyEquivalent: number;
  referenceId: string;
  destinationOrBankDetails: string;
  receiptPreviewName?: string;
  receiptDataUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: number;
  reviewedAt?: number;
  adminNote?: string;
}

export interface ServerSupportTicket {
  id: string;
  name: string;
  email: string;
  category: string;
  referenceId: string;
  subject: string;
  message: string;
  createdAt: string;
  createdTimestamp: number;
  status: 'Open · Under Review' | 'In Progress' | 'Resolved';
  adminReply?: string;
  updatedAt?: number;
}

export interface ServerAuditLogEntry {
  id: string;
  adminUsername: string;
  action: string;
  target: string;
  details: string;
  createdAt: number;
}

export interface PlatformTelemetryData {
  diceBoards: unknown[];
  sportsEvents: unknown[];
  updatedAt: number;
}

export type ServerIncomeSource = 'DICE_MAIN_FEE' | 'SIDE_BET_FEE' | 'SPECTATOR_ENTRY_FEE' | 'SPORTS_FEE';

export interface ServerIncomeRecord {
  id: string;
  source: ServerIncomeSource;
  boardOrEventId: string;
  roomOrMatchLabel: string;
  userId: string;
  username: string;
  isBotUser: boolean;
  includesHumanParticipant: boolean;
  grossAmountTokens: number;
  feeRate: number;
  feeAmountTokens: number;
  usdEquivalent: number;
  description: string;
  createdAt: number;
}

export interface ServerIncomeSummary {
  totalTokens: number;
  diceMainFeeTokens: number;
  sideBetFeeTokens: number;
  entryFeeTokens: number;
  sportsFeeTokens: number;
  humanInvolvedFeeTokens: number;
  recordCount: number;
}

export interface ServerBotConfig {
  enabled: boolean;
  sideBetBotsEnabled: boolean;
  triggerWaitSeconds: number;
  sideBetTriggerDelaySeconds: number;
  maxPerMatchStakeTokens: number;
  maxPerRoundSideBetTokens: number;
  maxHourlyLossTokens: number;
  maxDailyLossTokens: number;
  cooldownAfterLosses: number;
  cooldownMatchCount: number;
  winStreakAlertThreshold: number;
  allowedTierIds: TierId[];
  updatedAt: number;
  updatedBy?: string;
}

export interface ServerBotLiquidityLedgerEntry {
  id: string;
  kind: 'MAIN_MATCH' | 'SIDE_BET' | 'POOL_TOPUP' | 'POOL_WITHDRAW' | 'POOL_SET' | 'POOL_BURN_SURPLUS';
  boardId?: string;
  roomLabel: string;
  botUsername: string;
  opponentSummary: string;
  stakeTokens: number;
  payoutTokens: number;
  netTokens: number;
  poolBalanceAfter: number;
  note: string;
  createdAt: number;
}

export interface ServerRiskAlertEntry {
  id: string;
  type:
    | 'WIN_STREAK'
    | 'HIGH_WIN_RATE'
    | 'BOT_LOSS_CAP_HIT'
    | 'BOT_POOL_LOW'
    | 'STATE_TAMPER_ATTEMPT'
    | 'PROMO_BUDGET_CAP_HIT'
    | 'PROMO_IP_CLUSTER_ALERT'
    | 'PROMO_WITHDRAWAL_REVIEW';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
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

export type ServerRoomInviteStatus = 'WAITING' | 'STARTED' | 'FULL' | 'CANCELLED' | 'EXPIRED';

export interface ServerRoomInviteSeat {
  seatIndex: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  country?: string;
  betAmountTokens: number;
  isBot?: boolean;
}

export interface ServerRoomInvite {
  id: string;
  boardId: string;
  tierId: string;
  tierLabel: string;
  roomLabel: string;
  tableNumber: number;
  hostUserId: string;
  hostUsername: string;
  hostDisplayName: string;
  hostAvatarUrl?: string;
  hostAvatarFrameId?: string;
  hostCountry?: string;
  betAmountTokens: number;
  currentMinBet: number;
  minBetTokens: number;
  maxBetTokens: number;
  occupiedCount: number;
  maxSeats: number;
  seats: ServerRoomInviteSeat[];
  status: ServerRoomInviteStatus;
  createdAt: number;
  updatedAt: number;
  lastBroadcastAt: number;
  lobbyEndsAt: number;
}

export interface ServerPlayerRiskStat {
  userId: string;
  username: string;
  totalResolved: number;
  totalWins: number;
  consecutiveWins: number;
  lastWinAt: number;
  lastFlaggedStreak: number;
  lastFlaggedWinRateMatches: number;
}

export interface ServerBotRiskSummary {
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

export interface ServerContactConfig {
  supportEmail: string;
  telegramUsername: string;
  telegramLink: string;
  updatedAt: number;
  updatedBy?: string;
}

export interface PlatformStoreData {
  users: ServerStoredUser[];
  payments: ServerPaymentRequest[];
  tickets: ServerSupportTicket[];
  auditLogs: ServerAuditLogEntry[];
  incomeRecords: ServerIncomeRecord[];
  incomeSummary: ServerIncomeSummary;
  telemetry: PlatformTelemetryData;
  economyConfig: EconomyConfig;
  contactConfig?: ServerContactConfig;
  botConfig: ServerBotConfig;
  botPoolBalanceTokens: number;
  botConsecutiveLosses: number;
  botCooldownMatchesRemaining: number;
  botLiquidityLedger: ServerBotLiquidityLedgerEntry[];
  riskAlerts: ServerRiskAlertEntry[];
  playerRiskStats: Record<string, ServerPlayerRiskStat>;
  promoConfig: ServerPromoConfig;
  promoPoolBudgetTokens: number;
  promoTokenLedger: ServerPromoLedgerEntry[];
  referrals: ServerReferralRecord[];
}

export interface PublicPlayerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  country?: string;
}

export interface PublicArenaSnapshot {
  version: number;
  serverTime: number;
  economyConfig: EconomyConfig;
  promoConfig: PublicPromoConfig;
  contactConfig?: ServerContactConfig;
  diceBoards: ServerDiceBoardSnapshot[];
  publicProfiles: PublicPlayerProfile[];
  activeInvites: ServerRoomInvite[];
}

export interface PrivatePlayerSnapshot {
  version: number;
  user: SerializedUser;
  payments: PaymentRequest[];
  referralSummary: UserReferralSummary;
  promoConfig: PublicPromoConfig;
  economyConfig: EconomyConfig;
}

export type StreamBroadcastEvent = {
  type: 'arena' | 'player' | 'all';
  userIds?: string[];
};

export type CommitChangesFn = (options?: {
  persistNow?: boolean;
  affectedUserIds?: string[];
  broadcastArena?: boolean;
}) => void;

export const DEFAULT_PROMO_BUDGET_POOL = 30000;

export function defaultEconomyConfig(): EconomyConfig {
  return { ...DEFAULT_ECONOMY_CONFIG };
}

export function defaultBotConfig(): ServerBotConfig {
  return {
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
}

export function defaultPromoConfig(): ServerPromoConfig {
  return {
    welcomeBonusEnabled: true,
    welcomeBonusTokens: 150,
    referralProgramEnabled: true,
    referralBonusTokens: 50,
    referralMinDepositTokens: 300,
    dailyPromoMintCapTokens: 3000,
    hourlyPromoMintCapTokens: 900,
    autoPauseOnBudgetExhausted: true,
    maxReferralsPerUser: 20,
    blockSameIpMultiSignupBonus: true,
    maxSignupBonusesPerIp: 2,
    requireRealDepositToWithdrawPromo: true,
    minRealDepositToUnlockTokens: 300,
    promoPlaythroughMultiplier: 3,
    restrictPurePromoToTier1: true,
    updatedAt: 0,
  };
}

export function toPublicPromoConfig(cfg: ServerPromoConfig): PublicPromoConfig {
  return {
    welcomeBonusEnabled: cfg.welcomeBonusEnabled,
    welcomeBonusTokens: cfg.welcomeBonusTokens,
    referralProgramEnabled: cfg.referralProgramEnabled,
    referralBonusTokens: cfg.referralBonusTokens,
    referralMinDepositTokens: cfg.referralMinDepositTokens,
    updatedAt: cfg.updatedAt,
  };
}

export function defaultContactConfig(): ServerContactConfig {
  return {
    supportEmail: 'support@betspot.gg',
    telegramUsername: 'BetSpotSupport',
    telegramLink: 'https://t.me/BetSpotSupport',
    updatedAt: 0,
    updatedBy: 'System',
  };
}

export function emptyIncomeSummary(): ServerIncomeSummary {
  return {
    totalTokens: 0,
    diceMainFeeTokens: 0,
    sideBetFeeTokens: 0,
    entryFeeTokens: 0,
    sportsFeeTokens: 0,
    humanInvolvedFeeTokens: 0,
    recordCount: 0,
  };
}
