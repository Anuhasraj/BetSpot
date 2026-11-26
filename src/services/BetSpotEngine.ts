import { User as FirebaseUser } from 'firebase/auth';
import {
  BotConfig,
  BotRiskSummary,
  BotRuntimeSnapshot,
  DEFAULT_BOT_CONFIG,
  DEFAULT_BOT_POOL_BALANCE_TOKENS,
} from '../domain/BotRiskTypes';
import { DiceBoard, DiceRollEvent, ServerDiceBoardSnapshot } from '../domain/DiceBoard';
import { DEFAULT_ECONOMY_CONFIG, EconomyConfig } from '../domain/EconomyTypes';
import {
  DEFAULT_PUBLIC_PROMO_CONFIG,
  PromoConfig,
  PublicPromoConfig,
  UserReferralSummary,
} from '../domain/PromoTypes';
import {
  ALL_INVITE_TIER_IDS,
  DEFAULT_INVITE_PREFERENCES,
  RoomInvite,
  RoomInvitePreferences,
} from '../domain/RoomInviteTypes';
import { TierFeeStrategy, TokenEconomy } from '../domain/TokenEconomy';
import {
  DiceFace,
  GamePhase,
  IRandomGenerator,
  PaymentMethod,
  PaymentRequest,
  SavedBankDetails,
  SideBetCategory,
  SideBetOptionKey,
  TierId,
  UserRole,
  UserStatus,
} from '../domain/types';
import { auth } from '../infrastructure/firebase/firebaseClient';
import { syncActivePlayerToFirestore } from '../infrastructure/firebase/FirestoreSyncService';
import { DomainEventDispatcher } from '../core/DomainEventDispatcher';
import { SerializedUser, User } from '../domain/User';
import { adminAuthClient } from './AdminAuthClient';

export interface RegisterUserInput {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  avatarUrl?: string;
  referralCode?: string;
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
  diceBoards: ServerDiceBoardSnapshot[];
  publicProfiles: PublicPlayerProfile[];
  activeInvites: RoomInvite[];
}

export interface PrivatePlayerSnapshot {
  version: number;
  user: SerializedUser;
  payments: PaymentRequest[];
  referralSummary: UserReferralSummary | null;
  promoConfig: PublicPromoConfig;
  economyConfig: EconomyConfig;
}

export interface ContactConfig {
  supportEmail: string;
  telegramUsername: string;
  telegramLink: string;
  updatedAt: number;
}

export const DEFAULT_CONTACT_CONFIG: ContactConfig = {
  supportEmail: 'support@betspot.gg',
  telegramUsername: 'BetSpotSupport',
  telegramLink: 'https://t.me/BetSpotSupport',
  updatedAt: 0,
};

export class InsufficientTokensError extends Error {
  public readonly requiredTokens: number;
  public readonly availableTokens: number;

  constructor(message: string, requiredTokens: number, availableTokens: number) {
    super(message);
    this.name = 'InsufficientTokensError';
    this.requiredTokens = requiredTokens;
    this.availableTokens = availableTokens;
  }
}

/**
 * Browser client never generates RNG outcomes or game math.
 * This stub satisfies DiceBoard's constructor when hydrating read-only server snapshots.
 */
const SERVER_AUTHORITATIVE_RNG_STUB: IRandomGenerator = {
  nextIntInclusive(): number {
    throw new Error('Dice RNG is executed exclusively on the authoritative backend.');
  },
  rollDaduketaFace(): DiceFace {
    throw new Error('Dice RNG is executed exclusively on the authoritative backend.');
  },
  getOppositeFace(): DiceFace {
    throw new Error('Dice RNG is executed exclusively on the authoritative backend.');
  },
};

export class BetSpotEngine {
  public readonly eventBus = new DomainEventDispatcher();
  public readonly feeStrategy = new TierFeeStrategy();

  public diceBoards: DiceBoard[] = [];

  private _currentUser: User | null = null;
  private _playerBearerToken: string | null = null;
  private _payments: PaymentRequest[] = [];
  private _publicProfileUsers = new Map<string, User>();
  private _activeInvites: RoomInvite[] = [];
  private readonly _dismissedInviteIds = new Set<string>();
  private _invitePrefs: RoomInvitePreferences = {
    muted: DEFAULT_INVITE_PREFERENCES.muted,
    enabledTierIds: [...ALL_INVITE_TIER_IDS],
  };

  private _adminSession: {
    username: string;
    email?: string;
    authMethod?: 'password' | 'google';
    expiresAt: number;
    configuredViaEnv: boolean;
  } | null = null;
  private _lastToast: { id: string; message: string; kind: 'info' | 'success' | 'error' } | null = null;

  private _economyConfig: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  private _promoConfig: PublicPromoConfig = { ...DEFAULT_PUBLIC_PROMO_CONFIG };
  private _contactConfig: ContactConfig = { ...DEFAULT_CONTACT_CONFIG };
  private _botConfig: BotConfig = { ...DEFAULT_BOT_CONFIG };
  private _botSummary: BotRiskSummary = {
    poolBalanceTokens: DEFAULT_BOT_POOL_BALANCE_TOKENS,
    hourlyNetPnlTokens: 0,
    dailyNetPnlTokens: 0,
    hourlyLossUsedTokens: 0,
    dailyLossUsedTokens: 0,
    consecutiveLosses: 0,
    cooldownMatchesRemaining: 0,
    isAutoPaused: false,
    autoPausedReason: null,
  };
  private _pendingReferralCode: string | null = null;
  private _referralSummary: UserReferralSummary | null = null;

  private arenaStream: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;

  constructor() {
    this.diceBoards = DiceBoard.createDefaultBoards(SERVER_AUTHORITATIVE_RNG_STUB, this.feeStrategy);
    this.captureReferralCodeFromUrl();
    if (typeof window !== 'undefined') {
      void this.bootstrapFromServer();
      window.addEventListener('focus', () => {
        void this.refreshArenaFromServer();
        if (this.hasPlayerSession) {
          void this.syncActivePlayerWithServer();
        }
      });
    }
  }

  // --- Read-Only State & Profile Lookups ---

  public get payments(): PaymentRequest[] {
    return this._payments;
  }

  public get paymentService(): { requests: PaymentRequest[] } {
    return { requests: this._payments };
  }

  public get currentUser(): User | null {
    if (!this._currentUser || !this._currentUser.isActive) return null;
    return this._currentUser;
  }

  public get activeUser(): User {
    const u = this.currentUser;
    if (!u) {
      throw new Error('Please sign in to your account to continue.');
    }
    return u;
  }

  public get activeUserId(): string {
    return this.currentUser?.id ?? '';
  }

  public get hasPlayerSession(): boolean {
    return this.currentUser !== null;
  }

  public get adminSession(): {
    username: string;
    email?: string;
    authMethod?: 'password' | 'google';
    expiresAt: number;
    configuredViaEnv: boolean;
  } | null {
    if (!this._adminSession) return null;
    if (Date.now() >= this._adminSession.expiresAt || !adminAuthClient.hasToken) {
      this._adminSession = null;
      return null;
    }
    return this._adminSession;
  }

  public get isAuthenticated(): boolean {
    return this.currentUser !== null || this.isAdmin;
  }

  public get isAdmin(): boolean {
    return this.adminSession !== null;
  }

  public get lastToast() {
    return this._lastToast;
  }

  public get economyConfig(): EconomyConfig {
    return { ...this._economyConfig };
  }

  public get promoConfig(): PublicPromoConfig {
    return { ...this._promoConfig };
  }

  public get contactConfig(): ContactConfig {
    return { ...this._contactConfig };
  }

  public get botConfig(): BotConfig {
    return this._botConfig;
  }

  public get botRiskSummary(): BotRiskSummary {
    return this._botSummary;
  }

  public get pendingReferralCode(): string | null {
    return this._pendingReferralCode;
  }

  public get referralSummary(): UserReferralSummary | null {
    return this._referralSummary;
  }

  public get activeRoomInvites(): RoomInvite[] {
    const now = Date.now();
    return this._activeInvites
      .filter((inv) => {
        if (inv.status !== 'WAITING') return false;
        if (now > inv.lobbyEndsAt + 1000) return false;
        if (inv.occupiedCount >= inv.maxSeats) return false;
        const board = this.diceBoards.find((b) => b.id === inv.boardId);
        if (board) {
          if (
            board.phase !== GamePhase.WAITING_FOR_PLAYERS &&
            board.phase !== GamePhase.LOBBY_COUNTDOWN
          ) {
            return false;
          }
          if (this.activeUserId && board.isUserSeated(this.activeUserId)) {
            return false;
          }
        }
        if (this.activeUserId && inv.seats.some((s) => s.userId === this.activeUserId)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public get liveInviteAlerts(): RoomInvite[] {
    if (this._invitePrefs.muted) return [];
    const allowedTiers = new Set(this._invitePrefs.enabledTierIds);
    return this.activeRoomInvites.filter(
      (inv) =>
        allowedTiers.has(inv.tierId) &&
        !this._dismissedInviteIds.has(inv.id) &&
        inv.hostUserId !== this.activeUserId
    );
  }

  public get invitePreferences(): RoomInvitePreferences {
    return {
      muted: this._invitePrefs.muted,
      enabledTierIds: [...this._invitePrefs.enabledTierIds],
    };
  }

  public userLookup = (id: string): User | undefined => {
    if (this._currentUser && this._currentUser.id === id) {
      return this._currentUser;
    }
    return this._publicProfileUsers.get(id);
  };

  public getBoard(boardId: string): DiceBoard {
    const board = this.diceBoards.find((b) => b.id === boardId);
    if (!board) {
      throw new Error('Dice room not found.');
    }
    return board;
  }

  public getActivePlayingBoardsForTier(tierId: TierId): DiceBoard[] {
    return this.diceBoards.filter(
      (b) =>
        b.tier.id === tierId &&
        b.occupiedCount > 0 &&
        b.phase !== GamePhase.SETTLED
    );
  }

  public clearToast(): void {
    this._lastToast = null;
    this.eventBus.emit('state:changed');
  }

  public notify(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
    this._lastToast = {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      message,
      kind,
    };
    this.eventBus.emit('state:changed');
  }

  public dismissInviteAlert(inviteId: string): void {
    this._dismissedInviteIds.add(inviteId);
    this.eventBus.emit('state:changed');
  }

  public updateInvitePreferences(updates: Partial<RoomInvitePreferences>): void {
    const nextMuted =
      typeof updates.muted === 'boolean' ? updates.muted : this._invitePrefs.muted;
    const nextTiers = Array.isArray(updates.enabledTierIds)
      ? updates.enabledTierIds.filter((id) => ALL_INVITE_TIER_IDS.includes(id))
      : this._invitePrefs.enabledTierIds;

    this._invitePrefs = {
      muted: nextMuted,
      enabledTierIds: nextTiers,
    };
    this.eventBus.emit('state:changed');
  }

  public setPendingReferralCode(code: string | null): void {
    const clean = code ? code.trim().toUpperCase().slice(0, 32) : '';
    this._pendingReferralCode = clean || null;
    this.eventBus.emit('state:changed');
  }

  private captureReferralCodeFromUrl(): void {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = (params.get('ref') || params.get('referral') || '').trim();
      if (fromUrl) {
        this._pendingReferralCode = fromUrl.toUpperCase().slice(0, 32);
      }
    } catch {
      // Ignore malformed URL search params
    }
  }

  // --- Config Synchronizers (Populated from Backend Responses / SSE) ---

  public applyEconomyConfig(config?: Partial<EconomyConfig> | null): void {
    if (!config) return;
    const prev = this._economyConfig;
    const next = TokenEconomy.applyConfig(config);
    const changed =
      prev.tokensPerUsd !== next.tokensPerUsd ||
      prev.lkrPerUsd !== next.lkrPerUsd ||
      prev.minBetTokens !== next.minBetTokens ||
      prev.minDepositUsd !== next.minDepositUsd ||
      prev.minWithdrawUsd !== next.minWithdrawUsd ||
      prev.updatedAt !== next.updatedAt;
    this._economyConfig = next;
    if (changed) {
      this.eventBus.emit('state:changed');
    }
  }

  public applyPromoConfig(config?: PublicPromoConfig | PromoConfig | null): void {
    if (!config) return;
    const nextMinDep = Math.max(1, Math.round(config.referralMinDepositTokens));
    this._promoConfig = {
      welcomeBonusEnabled: Boolean(config.welcomeBonusEnabled),
      welcomeBonusTokens: Math.max(0, Math.round(config.welcomeBonusTokens)),
      referralProgramEnabled: Boolean(config.referralProgramEnabled),
      referralBonusTokens: Math.max(0, Math.round(config.referralBonusTokens)),
      referralMinDepositTokens: nextMinDep,
      updatedAt: Number(config.updatedAt) || 0,
    };
    this.eventBus.emit('state:changed');
  }

  public applyBotRuntime(runtime?: BotRuntimeSnapshot | null): void {
    if (!runtime?.config || !runtime?.summary) return;
    this._botConfig = runtime.config;
    this._botSummary = runtime.summary;
    this.eventBus.emit('state:changed');
  }

  // --- Admin UI Session Helpers ---

  public activateAdminSession(session: {
    username: string;
    email?: string;
    authMethod?: 'password' | 'google';
    expiresAt: number;
    configuredViaEnv: boolean;
  }): void {
    this._adminSession = {
      username: session.username,
      email: session.email,
      authMethod: session.authMethod,
      expiresAt: session.expiresAt,
      configuredViaEnv: session.configuredViaEnv,
    };
    this.eventBus.emit('state:changed');
  }

  public async logoutAdminSession(): Promise<void> {
    await adminAuthClient.logout();
    this._adminSession = null;
    this.eventBus.emit('state:changed');
  }

  // --- Authoritative Bootstrap & Realtime Server Stream ---

  private async bootstrapFromServer(): Promise<void> {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          authenticated?: boolean;
          token?: string;
          playerState?: PrivatePlayerSnapshot | null;
          arena?: PublicArenaSnapshot;
        };
        if (data.arena) {
          this.applyPublicArenaSnapshot(data.arena, false);
        }
        if (data.authenticated && data.playerState) {
          if (data.token) {
            this._playerBearerToken = data.token;
          }
          this.applyPrivatePlayerSnapshot(data.playerState, false);
        }
        this.eventBus.emit('state:changed');
      }
    } catch {
      // Transient boot failure will retry via reconnect / focus
    }

    await this.refreshPromoConfigFromServer();
    await this.openAuthoritativeStream();
  }

  private closeAuthoritativeStream(): void {
    if (this.reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.arenaStream) {
      this.arenaStream.close();
      this.arenaStream = null;
    }
  }

  private async openAuthoritativeStream(): Promise<void> {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    this.closeAuthoritativeStream();

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this._playerBearerToken) {
        headers.Authorization = `Bearer ${this._playerBearerToken}`;
      }
      const res = await fetch('/api/stream/ticket', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
      });
      if (!res.ok) {
        this.scheduleStreamReconnect();
        return;
      }
      const data = (await res.json()) as { ticket?: string };
      if (!data.ticket) {
        this.scheduleStreamReconnect();
        return;
      }

      const es = new EventSource(`/api/arena/stream?ticket=${encodeURIComponent(data.ticket)}`);
      this.arenaStream = es;
      this.reconnectAttempts = 0;

      es.addEventListener('arena:snapshot', (evt: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(evt.data) as PublicArenaSnapshot;
          this.applyPublicArenaSnapshot(parsed);
        } catch {
          // Ignore malformed SSE snapshot
        }
      });

      es.addEventListener('player:update', (evt: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(evt.data) as PrivatePlayerSnapshot;
          this.applyPrivatePlayerSnapshot(parsed);
        } catch {
          // Ignore malformed private update
        }
      });

      es.onerror = () => {
        if (this.arenaStream === es) {
          es.close();
          this.arenaStream = null;
          this.scheduleStreamReconnect();
        }
      };
    } catch {
      this.scheduleStreamReconnect();
    }
  }

  private scheduleStreamReconnect(): void {
    if (typeof window === 'undefined' || this.reconnectTimer !== null) return;
    const delayMs = Math.min(10000, 1500 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 6);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openAuthoritativeStream();
    }, delayMs);
  }

  private applyPublicArenaSnapshot(snap: PublicArenaSnapshot, emit = true): void {
    if (!snap) return;
    if (snap.economyConfig) {
      TokenEconomy.applyConfig(snap.economyConfig);
      this._economyConfig = { ...snap.economyConfig };
    }
    if (snap.promoConfig) {
      this._promoConfig = {
        welcomeBonusEnabled: Boolean(snap.promoConfig.welcomeBonusEnabled),
        welcomeBonusTokens: Math.max(0, Math.round(snap.promoConfig.welcomeBonusTokens)),
        referralProgramEnabled: Boolean(snap.promoConfig.referralProgramEnabled),
        referralBonusTokens: Math.max(0, Math.round(snap.promoConfig.referralBonusTokens)),
        referralMinDepositTokens: Math.max(1, Math.round(snap.promoConfig.referralMinDepositTokens)),
        updatedAt: Number(snap.promoConfig.updatedAt) || 0,
      };
    }
    if ((snap as { contactConfig?: ContactConfig }).contactConfig) {
      const cc = (snap as { contactConfig?: ContactConfig }).contactConfig!;
      this._contactConfig = {
        supportEmail: cc.supportEmail || DEFAULT_CONTACT_CONFIG.supportEmail,
        telegramUsername: cc.telegramUsername || DEFAULT_CONTACT_CONFIG.telegramUsername,
        telegramLink:
          cc.telegramLink ||
          `https://t.me/${(cc.telegramUsername || DEFAULT_CONTACT_CONFIG.telegramUsername).replace(/^@/, '')}`,
        updatedAt: Number(cc.updatedAt) || 0,
      };
    }
    if (Array.isArray(snap.publicProfiles)) {
      const nextProfiles = new Map<string, User>();
      for (const p of snap.publicProfiles) {
        nextProfiles.set(
          p.id,
          new User({
            id: p.id,
            username: p.username,
            displayName: p.displayName || p.username,
            email: '',
            passwordHash: '',
            avatarUrl: p.avatarUrl,
            avatarFrameId: p.avatarFrameId,
            country: p.country,
            role: UserRole.PLAYER,
            status: UserStatus.ACTIVE,
            initialBalance: 0,
          })
        );
      }
      this._publicProfileUsers = nextProfiles;
    }
    if (Array.isArray(snap.diceBoards) && snap.diceBoards.length > 0) {
      this.diceBoards = snap.diceBoards.map((sb) =>
        DiceBoard.fromServerSnapshot(sb, SERVER_AUTHORITATIVE_RNG_STUB, this.feeStrategy)
      );
    }
    if (Array.isArray(snap.activeInvites)) {
      this._activeInvites = snap.activeInvites;
    }
    if (emit) {
      this.eventBus.emit('state:changed');
    }
  }

  private applyPrivatePlayerSnapshot(snap: PrivatePlayerSnapshot | null | undefined, emit = true): void {
    if (!snap?.user) return;
    if (snap.economyConfig) {
      TokenEconomy.applyConfig(snap.economyConfig);
      this._economyConfig = { ...snap.economyConfig };
    }
    if (snap.promoConfig) {
      this.applyPromoConfig(snap.promoConfig);
    }
    this._currentUser = User.fromJSON(snap.user);
    if (Array.isArray(snap.payments)) {
      this._payments = snap.payments;
    }
    if (snap.referralSummary !== undefined) {
      this._referralSummary = snap.referralSummary;
    }
    if (emit) {
      this.eventBus.emit('state:changed');
    }
  }

  private async apiRequest<T>(
    url: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this._playerBearerToken) {
      headers.Authorization = `Bearer ${this._playerBearerToken}`;
    }
    let bodyStr: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(options.body);
    }
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: bodyStr,
      credentials: 'same-origin',
    });

    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      code?: string;
      requiredTokens?: number;
      availableTokens?: number;
    };

    if (!res.ok) {
      if (data?.code === 'INSUFFICIENT_TOKENS') {
        throw new InsufficientTokensError(
          data.error || 'Insufficient tokens.',
          Number(data.requiredTokens) || 0,
          Number(data.availableTokens) || (this._currentUser?.wallet.availableBalance ?? 0)
        );
      }
      if (res.status === 401 && url !== '/api/auth/login' && url !== '/api/auth/google') {
        this._playerBearerToken = null;
        this._currentUser = null;
        this._payments = [];
        this._referralSummary = null;
        this.eventBus.emit('state:changed');
      }
      throw new Error(data?.error || `Request failed (${res.status}).`);
    }

    return data;
  }

  public async refreshArenaFromServer(): Promise<void> {
    try {
      const snap = await this.apiRequest<PublicArenaSnapshot>('/api/arena/state');
      this.applyPublicArenaSnapshot(snap);
    } catch {
      // Ignore transient network failures
    }
  }

  public async refreshEconomyConfigFromServer(): Promise<void> {
    try {
      const data = await this.apiRequest<{ config?: EconomyConfig }>('/api/economy/config');
      if (data.config) {
        this.applyEconomyConfig(data.config);
      }
    } catch {
      // Ignore offline error
    }
  }

  public async refreshPromoConfigFromServer(): Promise<void> {
    try {
      const data = await this.apiRequest<{
        config?: PublicPromoConfig;
        economyConfig?: EconomyConfig;
      }>('/api/promo/config');
      if (data.economyConfig) {
        this.applyEconomyConfig(data.economyConfig);
      }
      if (data.config) {
        this.applyPromoConfig(data.config);
      }
    } catch {
      // Ignore offline error
    }
  }

  public async syncActivePlayerWithServer(): Promise<void> {
    if (!this.hasPlayerSession && !this._playerBearerToken) return;
    try {
      const state = await this.apiRequest<PrivatePlayerSnapshot>('/api/player/state');
      this.applyPrivatePlayerSnapshot(state);
    } catch {
      // Errors handled inside apiRequest if unauthorized
    }
  }

  public async fetchMyReferralSummary(): Promise<UserReferralSummary | null> {
    if (!this.hasPlayerSession) return this._referralSummary;
    try {
      const data = await this.apiRequest<{
        config?: PublicPromoConfig;
        summary?: UserReferralSummary;
      }>('/api/player/referrals');
      if (data.config) {
        this.applyPromoConfig(data.config);
      }
      if (data.summary) {
        this._referralSummary = data.summary;
      }
      this.eventBus.emit('state:changed');
      return this._referralSummary;
    } catch {
      return this._referralSummary;
    }
  }

  public async fetchContactConfig(): Promise<ContactConfig> {
    try {
      const res = await this.apiRequest<{ config: ContactConfig }>('/api/contact/config');
      if (res.config) {
        this._contactConfig = {
          supportEmail: res.config.supportEmail || DEFAULT_CONTACT_CONFIG.supportEmail,
          telegramUsername: res.config.telegramUsername || DEFAULT_CONTACT_CONFIG.telegramUsername,
          telegramLink:
            res.config.telegramLink ||
            `https://t.me/${(res.config.telegramUsername || DEFAULT_CONTACT_CONFIG.telegramUsername).replace(/^@/, '')}`,
          updatedAt: Number(res.config.updatedAt) || 0,
        };
        this.eventBus.emit('state:changed');
      }
      return this.contactConfig;
    } catch {
      return this.contactConfig;
    }
  }

  // --- Authoritative Auth & Account Flows ---

  public async registerAccount(input: RegisterUserInput): Promise<{
    user: User;
    welcomeBonusGranted: boolean;
    welcomeBonusTokens: number;
    referredByUsername?: string;
  }> {
    const res = await this.apiRequest<{
      user: SerializedUser;
      welcomeBonusGranted?: boolean;
      welcomeBonusTokens?: number;
      referredByUsername?: string;
      promoConfig?: PublicPromoConfig;
      economyConfig?: EconomyConfig;
    }>('/api/auth/register', {
      method: 'POST',
      body: {
        displayName: input.displayName,
        username: input.username,
        email: input.email,
        password: input.password,
        confirmPassword: input.confirmPassword,
        referralCode: (input.referralCode ?? this._pendingReferralCode ?? '').trim() || undefined,
      },
    });
    if (res.economyConfig) this.applyEconomyConfig(res.economyConfig);
    if (res.promoConfig) this.applyPromoConfig(res.promoConfig);
    const createdUser = User.fromJSON(res.user);
    return {
      user: createdUser,
      welcomeBonusGranted: Boolean(res.welcomeBonusGranted),
      welcomeBonusTokens: Number(res.welcomeBonusTokens) || 0,
      referredByUsername: res.referredByUsername,
    };
  }

  public async loginAccount(identifier: string, password: string): Promise<User> {
    const res = await this.apiRequest<{
      token: string;
      playerState: PrivatePlayerSnapshot;
      arena?: PublicArenaSnapshot;
    }>('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    this._playerBearerToken = res.token;
    if (res.arena) this.applyPublicArenaSnapshot(res.arena, false);
    this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    void this.openAuthoritativeStream();
    const user = this.activeUser;
    this.notify(`Signed in as @${user.username}.`, 'success');
    return user;
  }

  public async loginOrRegisterGoogleUser(
    firebaseUser: FirebaseUser,
    referralCode?: string
  ): Promise<{
    user: User;
    isNew: boolean;
    welcomeBonusGranted: boolean;
    welcomeBonusTokens: number;
    referredByUsername?: string;
  }> {
    const idToken = await firebaseUser.getIdToken();
    const refCode = (referralCode ?? this._pendingReferralCode ?? '').trim() || undefined;
    const res = await this.apiRequest<{
      token: string;
      isNew: boolean;
      welcomeBonusGranted?: boolean;
      welcomeBonusTokens?: number;
      referredByUsername?: string;
      playerState: PrivatePlayerSnapshot;
      arena?: PublicArenaSnapshot;
    }>('/api/auth/google', {
      method: 'POST',
      body: { idToken, referralCode: refCode },
    });
    this._playerBearerToken = res.token;
    if (res.arena) this.applyPublicArenaSnapshot(res.arena, false);
    this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    void this.openAuthoritativeStream();
    void syncActivePlayerToFirestore(res.playerState.user, firebaseUser).catch(() => {});

    const user = this.activeUser;
    if (res.isNew) {
      const bonusMsg =
        res.welcomeBonusGranted && (res.welcomeBonusTokens ?? 0) > 0
          ? ` +${res.welcomeBonusTokens!.toLocaleString()} Welcome Bonus TKN credited!`
          : '';
      this.notify(`Google account linked cleanly as @${user.username}!${bonusMsg}`, 'success');
    } else {
      this.notify(`Welcome back, @${user.username}!`, 'success');
    }

    return {
      user,
      isNew: Boolean(res.isNew),
      welcomeBonusGranted: Boolean(res.welcomeBonusGranted),
      welcomeBonusTokens: Number(res.welcomeBonusTokens) || 0,
      referredByUsername: res.referredByUsername,
    };
  }

  public async logoutAccount(): Promise<void> {
    try {
      await this.apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local memory even if request fails
    }
    this._playerBearerToken = null;
    this._currentUser = null;
    this._payments = [];
    this._referralSummary = null;
    this.eventBus.emit('state:changed');
    void this.openAuthoritativeStream();
    this.notify('Signed out cleanly.', 'info');
  }

  public async changeOwnPassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    await this.apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword, confirmPassword },
    });
    this.notify('Your account password has been updated.', 'success');
  }

  public async updateOwnProfile(updates: {
    displayName: string;
    email: string;
    country?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    ageVerified?: boolean;
    dailyBetLimitTokens?: number;
  }): Promise<User> {
    const res = await this.apiRequest<{ playerState: PrivatePlayerSnapshot }>('/api/player/profile', {
      method: 'PATCH',
      body: updates,
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    if (auth.currentUser) {
      void syncActivePlayerToFirestore(res.playerState.user, auth.currentUser).catch(() => {});
    }
    this.notify('Profile details saved.', 'success');
    return this.activeUser;
  }

  public async updateOwnPayoutDetails(
    savedCryptoAddress: string,
    savedBankDetails?: SavedBankDetails
  ): Promise<User> {
    const res = await this.apiRequest<{ playerState: PrivatePlayerSnapshot }>('/api/player/payout', {
      method: 'PUT',
      body: { savedCryptoAddress, savedBankDetails },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    if (auth.currentUser) {
      void syncActivePlayerToFirestore(res.playerState.user, auth.currentUser).catch(() => {});
    }
    this.notify('Saved payout channels updated.', 'success');
    return this.activeUser;
  }

  public async submitOwnKycDocument(documentName: string, documentDataUrl: string): Promise<User> {
    const res = await this.apiRequest<{ playerState: PrivatePlayerSnapshot }>('/api/player/kyc', {
      method: 'POST',
      body: { documentName, documentDataUrl },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    if (auth.currentUser) {
      void syncActivePlayerToFirestore(res.playerState.user, auth.currentUser).catch(() => {});
    }
    this.notify('KYC document submitted for Admin review.', 'success');
    return this.activeUser;
  }

  public async updateOwnAvatar(avatarUrl: string): Promise<User> {
    const res = await this.apiRequest<{ playerState: PrivatePlayerSnapshot }>('/api/player/avatar', {
      method: 'PUT',
      body: { avatarUrl },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    this.notify('Custom avatar updated.', 'success');
    return this.activeUser;
  }

  public async updateOwnAvatarPreset(presetUrl: string, avatarFrameId: string): Promise<User> {
    const res = await this.apiRequest<{ playerState: PrivatePlayerSnapshot }>('/api/player/avatar', {
      method: 'PUT',
      body: { avatarUrl: presetUrl, avatarFrameId },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    return this.activeUser;
  }

  // --- Authoritative Payments ---

  public async requestCryptoDeposit(
    usdAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC
  ): Promise<PaymentRequest> {
    const res = await this.apiRequest<{
      payment: PaymentRequest;
      playerState: PrivatePlayerSnapshot;
    }>('/api/payments/deposit-crypto', {
      method: 'POST',
      body: { usdAmount, method },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    this.notify(
      `Deposit request ${res.payment.referenceId} created (+${res.payment.tokenAmount.toLocaleString()} TKN).`,
      'success'
    );
    return res.payment;
  }

  public async attachDepositReceipt(
    requestId: string,
    receiptName: string,
    receiptDataUrl: string
  ): Promise<PaymentRequest> {
    const res = await this.apiRequest<{
      payment: PaymentRequest;
      playerState: PrivatePlayerSnapshot;
    }>(`/api/payments/${encodeURIComponent(requestId)}/receipt`, {
      method: 'POST',
      body: { receiptName, receiptDataUrl },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    this.notify(`Payment slip uploaded for ${res.payment.referenceId}.`, 'success');
    return res.payment;
  }

  public async requestWithdrawal(
    tokenAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC | PaymentMethod.SRI_LANKA_BANK,
    destinationDetails: string
  ): Promise<PaymentRequest> {
    const res = await this.apiRequest<{
      payment: PaymentRequest;
      playerState: PrivatePlayerSnapshot;
    }>('/api/payments/withdraw', {
      method: 'POST',
      body: { tokenAmount, method, destinationDetails },
    });
    this.applyPrivatePlayerSnapshot(res.playerState);
    this.notify(
      `Withdrawal ${res.payment.referenceId} submitted (-${res.payment.tokenAmount.toLocaleString()} TKN held).`,
      'success'
    );
    return res.payment;
  }

  // --- Authoritative Dice Arena Actions ---

  public async enterTierForPlay(tierId: TierId, betAmount?: number): Promise<{
    board: DiceBoard;
    outcomeMode: 'JOIN_SEAT' | 'SPECTATE_ONLY' | 'NEEDS_TOPUP' | 'ALREADY_SEATED';
  }> {
    const tier = this.feeStrategy.getTierById(tierId);
    const res = await this.apiRequest<{
      outcome: {
        mode: 'JOIN_SEAT' | 'SPECTATE_ONLY' | 'NEEDS_TOPUP' | 'ALREADY_SEATED';
        boardId: string;
        message: string;
        requiredTokens?: number;
      };
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/enter-tier', {
      method: 'POST',
      body: { tierId, betAmount },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');

    if (res.outcome.mode === 'NEEDS_TOPUP') {
      throw new InsufficientTokensError(
        res.outcome.message,
        res.outcome.requiredTokens ?? tier.minTokens,
        this.activeUser.wallet.availableBalance
      );
    }

    if (res.outcome.mode === 'ALREADY_SEATED') {
      this.notify(res.outcome.message, 'info');
    }

    const board = this.getBoard(res.outcome.boardId);
    return { board, outcomeMode: res.outcome.mode };
  }

  public async leaveLobbyVisitor(boardId: string): Promise<void> {
    try {
      const res = await this.apiRequest<{ ok: boolean; arena?: PublicArenaSnapshot }>(
        '/api/arena/leave-visitor',
        { method: 'POST', body: { boardId } }
      );
      if (res.arena) this.applyPublicArenaSnapshot(res.arena);
    } catch {
      // Non-blocking visitor cleanup
    }
  }

  public async enterBoardAsSideBettor(boardId: string): Promise<DiceBoard> {
    const res = await this.apiRequest<{
      ok: boolean;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/enter-sidebet', {
      method: 'POST',
      body: { boardId },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    return this.getBoard(boardId);
  }

  public async joinMainSeat(boardId: string, betAmount: number): Promise<void> {
    const res = await this.apiRequest<{
      ok: boolean;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/join-seat', {
      method: 'POST',
      body: { boardId, betAmount },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    this.notify(`Joined seat with ${Math.round(betAmount).toLocaleString()} TKN.`, 'success');
  }

  public async updateMainSeatBet(boardId: string, newBetAmount: number): Promise<void> {
    const res = await this.apiRequest<{
      ok: boolean;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/update-bet', {
      method: 'POST',
      body: { boardId, betAmount: newBetAmount },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    this.notify(`Seat bet updated to ${Math.round(newBetAmount).toLocaleString()} TKN.`, 'success');
  }

  public async leaveMainSeat(boardId: string): Promise<void> {
    const res = await this.apiRequest<{
      ok: boolean;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/leave-seat', {
      method: 'POST',
      body: { boardId },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    this.notify('Left seat cleanly. Held tokens refunded.', 'info');
  }

  public async quickStartMatch(boardId: string): Promise<void> {
    const res = await this.apiRequest<{
      ok: boolean;
      started: boolean;
      message: string;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/quick-start', {
      method: 'POST',
      body: { boardId },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    this.notify(res.message, res.started ? 'success' : 'info');
  }

  public async executeUserTurnRoll(boardId: string): Promise<DiceRollEvent> {
    const res = await this.apiRequest<{
      roll: DiceRollEvent;
      arena: PublicArenaSnapshot;
    }>('/api/arena/roll', {
      method: 'POST',
      body: { boardId },
    });
    this.applyPublicArenaSnapshot(res.arena);
    return res.roll;
  }

  public async placeSideBetBatch(
    boardId: string,
    items: { category: SideBetCategory; option: SideBetOptionKey; amount: number }[]
  ): Promise<{ placedCount: number; totalRefunded: number }> {
    const res = await this.apiRequest<{
      placedCount: number;
      totalRefunded: number;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/sidebet-batch', {
      method: 'POST',
      body: { boardId, items },
    });
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    this.notify(
      res.totalRefunded > 0
        ? `${res.placedCount} side bet${res.placedCount === 1 ? '' : 's'} locked · ${res.totalRefunded.toLocaleString()} TKN returned.`
        : `${res.placedCount} side bet${res.placedCount === 1 ? '' : 's'} locked cleanly.`,
      'success'
    );
    return { placedCount: res.placedCount, totalRefunded: res.totalRefunded };
  }

  public async resetDiceBoardForNextMatch(boardId: string): Promise<void> {
    const res = await this.apiRequest<{ ok: boolean; arena: PublicArenaSnapshot }>(
      '/api/arena/reset-board',
      {
        method: 'POST',
        body: { boardId },
      }
    );
    this.applyPublicArenaSnapshot(res.arena);
  }

  public async acceptRoomInviteAndJoin(invite: RoomInvite, stakeTokens: number): Promise<DiceBoard> {
    const res = await this.apiRequest<{
      ok: boolean;
      boardId: string;
      arena: PublicArenaSnapshot;
      playerState?: PrivatePlayerSnapshot;
    }>('/api/arena/accept-invite', {
      method: 'POST',
      body: { boardId: invite.boardId, betAmount: stakeTokens },
    });
    this._dismissedInviteIds.add(invite.id);
    this.applyPublicArenaSnapshot(res.arena, false);
    if (res.playerState) this.applyPrivatePlayerSnapshot(res.playerState, false);
    this.eventBus.emit('state:changed');
    const board = this.getBoard(res.boardId);
    this.notify(
      `Joined ${board.tableLabel} with ${Math.round(stakeTokens).toLocaleString()} TKN!`,
      'success'
    );
    return board;
  }
}

export const betSpotEngine = new BetSpotEngine();
