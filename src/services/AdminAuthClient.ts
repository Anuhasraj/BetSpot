import type {
  BotConfig,
  BotLiquidityLedgerEntry,
  BotRiskSummary,
  RiskAlertEntry,
} from '../domain/BotRiskTypes';
import type { EconomyConfig } from '../domain/EconomyTypes';
import type {
  PromoConfig,
  PromoLedgerEntry,
  PromoRiskFlag,
  PromoRiskSummary,
  ReferralRecord,
} from '../domain/PromoTypes';
import type { ContactConfig } from './BetSpotEngine';

export interface AdminAuthStatus {
  configuredViaEnv: boolean;
  isClaimed: boolean;
  needsSetup: boolean;
  adminUsernameHint: string | null;
  googleAdminEnabled?: boolean;
  ownerEmailHint?: string;
}

export interface AdminLoginResult {
  username: string;
  email?: string;
  authMethod?: 'password' | 'google';
  expiresAt: number;
  configuredViaEnv: boolean;
}

/**
 * Communicates with server-side /api/admin/auth/* endpoints.
 * Keeps the server-issued Authorization: Bearer token strictly in JS memory
 * (never persisted in localStorage or sessionStorage).
 */
class AdminAuthClientService {
  private memoryBearerToken: string | null = null;

  public get hasToken(): boolean {
    return this.memoryBearerToken !== null;
  }

  public getAuthHeaders(): Record<string, string> {
    if (!this.memoryBearerToken) return {};
    return {
      Authorization: `Bearer ${this.memoryBearerToken}`,
    };
  }

  public clearToken(): void {
    this.memoryBearerToken = null;
  }

  private async parseJsonResponse<T>(res: Response): Promise<T> {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Unexpected server response (${res.status}).`);
    }
    if (!res.ok) {
      const errObj = data as { error?: string } | null;
      throw new Error(errObj?.error || `Request failed with status ${res.status}.`);
    }
    return data as T;
  }

  public async fetchStatus(): Promise<AdminAuthStatus> {
    const res = await fetch('/api/admin/auth/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return this.parseJsonResponse<AdminAuthStatus>(res);
  }

  public async setupInitialAdmin(input: {
    username: string;
    password: string;
    confirmPassword: string;
  }): Promise<AdminLoginResult> {
    const res = await fetch('/api/admin/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await this.parseJsonResponse<AdminLoginResult & { token: string }>(res);
    this.memoryBearerToken = data.token;
    return {
      username: data.username,
      email: data.email,
      authMethod: data.authMethod ?? 'password',
      expiresAt: data.expiresAt,
      configuredViaEnv: data.configuredViaEnv,
    };
  }

  public async login(username: string, password: string): Promise<AdminLoginResult> {
    const res = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await this.parseJsonResponse<AdminLoginResult & { token: string }>(res);
    this.memoryBearerToken = data.token;
    return {
      username: data.username,
      email: data.email,
      authMethod: data.authMethod ?? 'password',
      expiresAt: data.expiresAt,
      configuredViaEnv: data.configuredViaEnv,
    };
  }

  public async loginWithGoogle(idToken: string): Promise<AdminLoginResult> {
    const res = await fetch('/api/admin/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await this.parseJsonResponse<AdminLoginResult & { token: string }>(res);
    this.memoryBearerToken = data.token;
    return {
      username: data.username,
      email: data.email,
      authMethod: 'google',
      expiresAt: data.expiresAt,
      configuredViaEnv: data.configuredViaEnv,
    };
  }

  public async verifySession(): Promise<AdminLoginResult | null> {
    if (!this.memoryBearerToken) return null;
    try {
      const res = await fetch('/api/admin/auth/session', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.getAuthHeaders(),
        },
      });
      if (!res.ok) {
        this.memoryBearerToken = null;
        return null;
      }
      const data = await this.parseJsonResponse<AdminLoginResult & { authenticated: boolean }>(res);
      return {
        username: data.username,
        email: data.email,
        authMethod: data.authMethod,
        expiresAt: data.expiresAt,
        configuredViaEnv: data.configuredViaEnv,
      };
    } catch {
      return null;
    }
  }

  public async changePassword(input: {
    currentPassword: string;
    newUsername?: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<AdminLoginResult> {
    const res = await fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(input),
    });
    const data = await this.parseJsonResponse<AdminLoginResult & { token: string }>(res);
    this.memoryBearerToken = data.token;
    return {
      username: data.username,
      expiresAt: data.expiresAt,
      configuredViaEnv: data.configuredViaEnv,
    };
  }

  public async logout(): Promise<void> {
    const token = this.memoryBearerToken;
    this.memoryBearerToken = null;
    if (!token) return;
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Ignore network errors on logout after clearing local memory token
    }
  }

  public async fetchAdminStore(): Promise<AdminServerStore> {
    const res = await fetch('/api/admin/store', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    return this.parseJsonResponse<AdminServerStore>(res);
  }

  public async createUser(payload: {
    username: string;
    displayName: string;
    email: string;
    role: string;
    initialBalance: number;
  }): Promise<{ store: AdminServerStore }> {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async updateUser(
    userId: string,
    updates: {
      displayName?: string;
      email?: string;
      role?: string;
      status?: string;
      balanceOverride?: number;
      skipPendingDelta?: boolean;
    }
  ): Promise<{ store: AdminServerStore }> {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(updates),
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async reviewKyc(
    userId: string,
    approve: boolean,
    note?: string,
    fallbackProfile?: { username?: string; displayName?: string; email?: string }
  ): Promise<{ store: AdminServerStore }> {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/kyc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ approve, note, fallbackProfile }),
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async removeUser(userId: string): Promise<{ store: AdminServerStore }> {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async resetAllPlayersAndTelemetry(): Promise<{ store: AdminServerStore }> {
    const res = await fetch('/api/admin/system/reset-players', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async manualTopUp(
    userId: string,
    payload: {
      amountTokens: number;
      fundingSource: string;
      referenceCode: string;
      reason: string;
      skipPendingDelta?: boolean;
    }
  ): Promise<{ store: AdminServerStore }> {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  public async reviewPayment(
    paymentId: string,
    approve: boolean,
    note: string
  ): Promise<{
    payment?: AdminServerPayment;
    referralRewardInfo?: {
      awarded: boolean;
      reason?: string;
      rewardTokens: number;
      referrerUsername?: string;
      refereeUsername?: string;
    } | null;
    store: AdminServerStore;
  }> {
    const res = await fetch(`/api/admin/payments/${encodeURIComponent(paymentId)}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ approve, note }),
    });
    return this.parseJsonResponse<{
      payment?: AdminServerPayment;
      referralRewardInfo?: {
        awarded: boolean;
        reason?: string;
        rewardTokens: number;
        referrerUsername?: string;
        refereeUsername?: string;
      } | null;
      store: AdminServerStore;
    }>(res);
  }

  public async updateSupportTicket(
    ticketId: string,
    status: 'Open · Under Review' | 'In Progress' | 'Resolved',
    adminReply?: string
  ): Promise<{ store: AdminServerStore }> {
    const res = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ status, adminReply }),
    });
    return this.parseJsonResponse<{ store: AdminServerStore }>(res);
  }

  private broadcastBotRuntime(config?: BotConfig, summary?: BotRiskSummary): void {
    if (!config || !summary || typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel('betspot_bot_runtime');
      ch.postMessage({ config, summary });
      ch.close();
    } catch {
      // Ignore BroadcastChannel restriction
    }
  }

  public async updateBotConfig(
    configPatch: Partial<BotConfig>
  ): Promise<{ config: BotConfig; summary: BotRiskSummary; store: AdminServerStore }> {
    const res = await fetch('/api/admin/bot-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(configPatch),
    });
    const data = await this.parseJsonResponse<{
      config: BotConfig;
      summary: BotRiskSummary;
      store: AdminServerStore;
    }>(res);
    this.broadcastBotRuntime(data.config, data.summary);
    return data;
  }

  public async adjustBotPool(
    action: 'TOPUP' | 'WITHDRAW' | 'SET' | 'BURN_SURPLUS',
    amountTokens: number,
    note?: string
  ): Promise<{ summary: BotRiskSummary; store: AdminServerStore }> {
    const res = await fetch('/api/admin/bot-pool/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ action, amountTokens, note }),
    });
    const data = await this.parseJsonResponse<{
      summary: BotRiskSummary;
      store: AdminServerStore;
    }>(res);
    this.broadcastBotRuntime(data.store.botConfig, data.summary);
    return data;
  }

  public async acknowledgeRiskAlert(
    alertId: string
  ): Promise<{ alert: RiskAlertEntry; store: AdminServerStore }> {
    const res = await fetch(`/api/admin/risk-alerts/${encodeURIComponent(alertId)}/ack`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    return this.parseJsonResponse<{ alert: RiskAlertEntry; store: AdminServerStore }>(res);
  }

  private broadcastEconomyConfig(config?: EconomyConfig): void {
    if (!config || typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel('betspot_economy_config');
      ch.postMessage({ config });
      ch.close();
    } catch {
      // Ignore BroadcastChannel restriction
    }
  }

  public async updateEconomyConfig(
    configPatch: Partial<EconomyConfig> & { syncReferralMinDeposit?: boolean }
  ): Promise<{ config: EconomyConfig; promoConfig?: PromoConfig; store: AdminServerStore }> {
    const res = await fetch('/api/admin/economy-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(configPatch),
    });
    const data = await this.parseJsonResponse<{
      config: EconomyConfig;
      promoConfig?: PromoConfig;
      store: AdminServerStore;
    }>(res);
    this.broadcastEconomyConfig(data.config);
    if (data.promoConfig) {
      this.broadcastPromoConfig(data.promoConfig);
    }
    return data;
  }

  private broadcastPromoConfig(config?: PromoConfig): void {
    if (!config || typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel('betspot_promo_config');
      ch.postMessage({ config });
      ch.close();
    } catch {
      // Ignore BroadcastChannel restriction
    }
  }

  public async updatePromoConfig(
    configPatch: Partial<PromoConfig>
  ): Promise<{ config: PromoConfig; promoSummary?: PromoRiskSummary; store: AdminServerStore }> {
    const res = await fetch('/api/admin/promo-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(configPatch),
    });
    const data = await this.parseJsonResponse<{
      config: PromoConfig;
      promoSummary?: PromoRiskSummary;
      store: AdminServerStore;
    }>(res);
    this.broadcastPromoConfig(data.config);
    return data;
  }

  public async adjustPromoBudget(
    action: 'TOPUP' | 'REDUCE',
    amountTokens: number,
    note?: string
  ): Promise<{ promoSummary?: PromoRiskSummary; store: AdminServerStore }> {
    const res = await fetch('/api/admin/promo-budget/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ action, amountTokens, note }),
    });
    return this.parseJsonResponse<{ promoSummary?: PromoRiskSummary; store: AdminServerStore }>(res);
  }

  public async revokeUserPromoTokens(
    userId: string,
    amountTokens?: number,
    reason?: string
  ): Promise<{ revokedTokens: number; promoSummary?: PromoRiskSummary; store: AdminServerStore }> {
    const res = await fetch(`/api/admin/promo/users/${encodeURIComponent(userId)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ amountTokens, reason }),
    });
    return this.parseJsonResponse<{
      revokedTokens: number;
      promoSummary?: PromoRiskSummary;
      store: AdminServerStore;
    }>(res);
  }

  public async updateUserPromoNote(
    userId: string,
    note: string,
    flag?: PromoRiskFlag
  ): Promise<{ promoSummary?: PromoRiskSummary; store: AdminServerStore }> {
    const res = await fetch(`/api/admin/promo/users/${encodeURIComponent(userId)}/note`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ note, flag }),
    });
    return this.parseJsonResponse<{ promoSummary?: PromoRiskSummary; store: AdminServerStore }>(res);
  }

  public async updateContactConfig(payload: {
    supportEmail?: string;
    telegramUsername?: string;
    telegramLink?: string;
    usdtDepositAddress?: string;
  }): Promise<{ config: ContactConfig; store: AdminServerStore }> {
    const res = await fetch('/api/admin/contact-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return this.parseJsonResponse<{ config: ContactConfig; store: AdminServerStore }>(res);
  }

  public async cancelDiceMatch(boardId: string): Promise<{ ok: boolean; store: AdminServerStore }> {
    const res = await fetch(`/api/admin/arena/boards/${encodeURIComponent(boardId)}/cancel`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    return this.parseJsonResponse<{ ok: boolean; store: AdminServerStore }>(res);
  }

  public async cancelSideBet(
    boardId: string,
    betId: string
  ): Promise<{ ok: boolean; store: AdminServerStore }> {
    const res = await fetch(
      `/api/admin/arena/boards/${encodeURIComponent(boardId)}/sidebets/${encodeURIComponent(betId)}/cancel`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...this.getAuthHeaders(),
        },
      }
    );
    return this.parseJsonResponse<{ ok: boolean; store: AdminServerStore }>(res);
  }

  public async suspendSideBet(
    boardId: string,
    betId: string
  ): Promise<{ ok: boolean; store: AdminServerStore }> {
    const res = await fetch(
      `/api/admin/arena/boards/${encodeURIComponent(boardId)}/sidebets/${encodeURIComponent(betId)}/suspend`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...this.getAuthHeaders(),
        },
      }
    );
    return this.parseJsonResponse<{ ok: boolean; store: AdminServerStore }>(res);
  }
}

export interface AdminWalletTransaction {
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

export interface AdminServerUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'PLAYER' | 'HIGH_ROLLER';
  status: 'ACTIVE' | 'SUSPENDED';
  availableBalance: number;
  heldBalance: number;
  isBot?: boolean;
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
  savedBankDetails?: {
    bankName: string;
    branch: string;
    accountHolder: string;
    accountNumber: string;
  };
  dailyBetLimitTokens?: number;
  referralCode?: string;
  referredByCode?: string;
  referredByUsername?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusTokens?: number;
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
  promoRiskFlag?: PromoRiskFlag;
  promoAdminNote?: string;
  transactions?: AdminWalletTransaction[];
}

export interface AdminDiceSeatSnapshot {
  seatIndex: number;
  userId: string;
  username: string;
  isBot: boolean;
  initialBet: number;
  lockedBet: number;
  rollValue: number | null;
  tieBreakerRolls: number[];
  hasRolled: boolean;
  joinedAt: number;
}

export interface AdminSideBetSnapshot {
  id: string;
  roundId: string;
  boardId: string;
  userId: string;
  username: string;
  isBot?: boolean;
  category: string;
  option: string;
  originalStake: number;
  matchedStake: number;
  unmatchedRefunded: number;
  status: string;
  payout: number;
  feeDeducted: number;
  placedAt: number;
}

export interface AdminDiceMatchResultSnapshot {
  matchNumber: number;
  winnerUserId: string;
  winnerUsername: string;
  winnerIsBot?: boolean;
  winningFace: number;
  grossPot: number;
  feeAmount: number;
  netPayout: number;
  feeRate: number;
  hadTieBreaker: boolean;
  timestamp: number;
}

export interface AdminDiceBoardSnapshot {
  id: string;
  tierId: string;
  tierLabel: string;
  feeRate: number;
  maxSeats: number;
  tableNumber: number;
  tableLabel: string;
  phase: string;
  lockedPot: number;
  matchCounter: number;
  occupiedCount: number;
  seats: AdminDiceSeatSnapshot[];
  activeSideBetRound: {
    id: string;
    roundNumber: number;
    rollerUsername: string;
    secondsRemaining: number;
    isClosed: boolean;
    rolledFace: number | null;
    bets: AdminSideBetSnapshot[];
  } | null;
  pastSideBetReports: {
    roundId: string;
    rolledFace: number;
    totalPoolPlaced: number;
    totalMatched: number;
    totalRefunded: number;
    totalFeesCollected: number;
    winners: { username: string; option: string; netPayout: number; fee: number }[];
  }[];
  matchHistory: AdminDiceMatchResultSnapshot[];
}

export interface AdminServerPayment {
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

export interface AdminServerTicket {
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

export interface AdminServerAuditLog {
  id: string;
  adminUsername: string;
  action: string;
  target: string;
  details: string;
  createdAt: number;
}

export interface AdminServerIncomeRecord {
  id: string;
  source: 'DICE_MAIN_FEE' | 'SIDE_BET_FEE' | 'SPECTATOR_ENTRY_FEE' | 'SPORTS_FEE';
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

export interface AdminServerIncomeSummary {
  totalTokens: number;
  diceMainFeeTokens: number;
  sideBetFeeTokens: number;
  entryFeeTokens: number;
  sportsFeeTokens: number;
  humanInvolvedFeeTokens: number;
  recordCount: number;
}

export interface AdminServerStore {
  users: AdminServerUser[];
  payments: AdminServerPayment[];
  tickets: AdminServerTicket[];
  auditLogs: AdminServerAuditLog[];
  incomeRecords?: AdminServerIncomeRecord[];
  incomeSummary?: AdminServerIncomeSummary;
  economyConfig?: EconomyConfig;
  contactConfig?: ContactConfig;
  botConfig?: BotConfig;
  botPoolBalanceTokens?: number;
  botSummary?: BotRiskSummary;
  botLiquidityLedger?: BotLiquidityLedgerEntry[];
  riskAlerts?: RiskAlertEntry[];
  promoConfig?: PromoConfig;
  promoPoolBudgetTokens?: number;
  promoTokenLedger?: PromoLedgerEntry[];
  promoSummary?: PromoRiskSummary;
  referrals?: ReferralRecord[];
  telemetry?: {
    diceBoards: AdminDiceBoardSnapshot[];
    sportsEvents?: unknown[];
    updatedAt: number;
  };
}

export const adminAuthClient = new AdminAuthClientService();
