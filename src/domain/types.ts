export enum TierId {
  TIER_1 = 'TIER_1',
  TIER_2 = 'TIER_2',
  TIER_3 = 'TIER_3',
  TIER_4 = 'TIER_4',
  TIER_5 = 'TIER_5',
  TIER_6 = 'TIER_6',
}

export type DiceFace = 3 | 6 | 9 | 12 | 15 | 18;

export enum GamePhase {
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  LOBBY_COUNTDOWN = 'LOBBY_COUNTDOWN',
  IN_PROGRESS_ROLL = 'IN_PROGRESS_ROLL',
  SIDE_BET_WINDOW = 'SIDE_BET_WINDOW',
  TIE_BREAKER = 'TIE_BREAKER',
  SETTLED = 'SETTLED',
}

export enum SideBetCategory {
  LOW_HIGH = 'LOW_HIGH',
  SINGLE = 'SINGLE',
  COUPLE = 'COUPLE',
}

export type LowHighOption = 'LOW' | 'HIGH';
export type CoupleOption = '3,6' | '9,12' | '15,18';
export type SingleOption = '3' | '6' | '9' | '12' | '15' | '18';
export type SideBetOptionKey = LowHighOption | SingleOption | CoupleOption;

export enum BetStatus {
  ACTIVE = 'ACTIVE',
  MATCHED = 'MATCHED',
  WON = 'WON',
  LOST = 'LOST',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
}

export enum TransactionType {
  DEPOSIT_CRYPTO = 'DEPOSIT_CRYPTO',
  DEPOSIT_BANK = 'DEPOSIT_BANK',
  WITHDRAWAL = 'WITHDRAWAL',
  BET_HOLD = 'BET_HOLD',
  BET_REFUND = 'BET_REFUND',
  BET_WIN = 'BET_WIN',
  BET_LOSS = 'BET_LOSS',
  ENTRY_FEE = 'ENTRY_FEE',
  ADMIN_TOPUP = 'ADMIN_TOPUP',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
  SIGNUP_BONUS = 'SIGNUP_BONUS',
  REFERRAL_BONUS = 'REFERRAL_BONUS',
}

export enum PaymentMethod {
  CRYPTO_USDT = 'CRYPTO_USDT',
  CRYPTO_USDC = 'CRYPTO_USDC',
  SRI_LANKA_BANK = 'SRI_LANKA_BANK',
  MANUAL_ADMIN = 'MANUAL_ADMIN',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum UserRole {
  PLAYER = 'PLAYER',
  HIGH_ROLLER = 'HIGH_ROLLER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum KycStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
}

export interface SavedBankDetails {
  bankName: string;
  branch: string;
  accountHolder: string;
  accountNumber: string;
}

export interface TierDefinition {
  readonly id: TierId;
  readonly label: string;
  readonly minTokens: number;
  readonly maxTokens: number;
  readonly feeRate: number; // e.g., 0.01 = 1%
  readonly spectatorEntryFee: number;
  readonly maxSeats: number;
}

export interface FeeCalculationResult {
  readonly tier: TierDefinition;
  readonly grossAmount: number;
  readonly feeRate: number;
  readonly feeAmount: number;
  readonly netPayout: number;
}

export interface IFeeStrategy {
  resolveTierForAmount(tokens: number): TierDefinition;
  calculateWinnerFee(grossPayout: number, referenceBetAmount: number, explicitTier?: TierId): FeeCalculationResult;
}

export interface IRandomGenerator {
  nextIntInclusive(min: number, max: number): number;
  rollDaduketaFace(): DiceFace;
  getOppositeFace(face: DiceFace): DiceFace;
}

export interface WalletTransaction {
  readonly id: string;
  readonly userId: string;
  readonly type: TransactionType;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly heldAfter: number;
  readonly description: string;
  readonly createdAt: number;
  readonly referenceId?: string;
}

export interface MainSeat {
  readonly seatIndex: number; // 0..9
  userId: string;
  username: string;
  avatarUrl?: string;
  isBot: boolean;
  initialBet: number;
  lockedBet: number;
  rollValue: DiceFace | null;
  initialRollValue?: DiceFace | null;
  tieBreakerRolls: DiceFace[];
  hasRolled: boolean;
  hasLeftMatch?: boolean;
  joinedAt: number;
}

export interface SideBettor {
  readonly userId: string;
  readonly username: string;
  readonly entryFeePaid: number;
  readonly joinedAt: number;
  readonly isBot: boolean;
}

export interface SideBetEntry {
  readonly id: string;
  readonly roundId: string;
  readonly boardId: string;
  readonly userId: string;
  readonly username: string;
  readonly category: SideBetCategory;
  readonly option: SideBetOptionKey;
  readonly originalStake: number;
  matchedStake: number;
  unmatchedRefunded: number;
  status: BetStatus;
  payout: number;
  feeDeducted: number;
  readonly placedAt: number;
}

export interface SideBetOptionPoolSummary {
  readonly category: SideBetCategory;
  readonly option: SideBetOptionKey;
  readonly label: string;
  readonly totalPlaced: number;
  readonly totalMatched: number;
  readonly totalUnmatched: number;
  readonly bettorsCount: number;
  readonly contributors: { username: string; amount: number; matched: number }[];
}

export interface PaymentRequest {
  readonly id: string;
  readonly userId: string;
  readonly username: string;
  readonly kind: 'DEPOSIT' | 'WITHDRAWAL';
  readonly method: PaymentMethod;
  readonly tokenAmount: number;
  readonly usdEquivalent: number;
  readonly localCurrencyEquivalent: number;
  readonly referenceId: string;
  readonly destinationOrBankDetails: string;
  receiptPreviewName?: string;
  receiptDataUrl?: string;
  status: ApprovalStatus;
  readonly createdAt: number;
  reviewedAt?: number;
  adminNote?: string;
}

export type PlatformIncomeSource =
  | 'DICE_MAIN_FEE'
  | 'SIDE_BET_FEE'
  | 'SPECTATOR_ENTRY_FEE'
  | 'SPORTS_FEE';

export interface PlatformIncomeRecord {
  readonly id: string;
  readonly source: PlatformIncomeSource;
  readonly boardOrEventId: string;
  readonly roomOrMatchLabel: string;
  readonly userId: string;
  readonly username: string;
  readonly isBotUser: boolean;
  readonly includesHumanParticipant: boolean;
  readonly grossAmountTokens: number;
  readonly feeRate: number;
  readonly feeAmountTokens: number;
  readonly usdEquivalent: number;
  readonly description: string;
  readonly createdAt: number;
}

export interface PlatformIncomeSummary {
  totalTokens: number;
  diceMainFeeTokens: number;
  sideBetFeeTokens: number;
  entryFeeTokens: number;
  sportsFeeTokens: number;
  humanInvolvedFeeTokens: number;
  recordCount: number;
}
