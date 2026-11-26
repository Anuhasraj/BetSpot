import crypto from 'crypto';
import { IRepository } from '../src/core/contracts';
import { DiceRollEvent, ServerDiceBoardSnapshot } from '../src/domain/DiceBoard';
import { EconomyConfig } from '../src/domain/EconomyTypes';
import { TierFeeStrategy, TokenEconomy } from '../src/domain/TokenEconomy';
import {
  ApprovalStatus,
  IRandomGenerator,
  PaymentMethod,
  PaymentRequest,
  SideBetCategory,
  SideBetOptionKey,
  TierId,
} from '../src/domain/types';
import { User } from '../src/domain/User';
import { BotSimulationService } from '../src/services/BotSimulationService';
import { PlatformConfigSanitizer } from './persistence/JsonFilePlatformRepository';
import {
  NodeCryptoRandomGenerator,
  PasswordHasher,
  VerifiedGoogleIdentity,
} from './security/SecurityServices';
import {
  DEFAULT_PROMO_BUDGET_POOL,
  emptyIncomeSummary,
  PlatformStoreData,
  PrivatePlayerSnapshot,
  PublicArenaSnapshot,
  PublicPlayerProfile,
  ServerBotConfig,
  ServerBotLiquidityLedgerEntry,
  ServerBotRiskSummary,
  ServerContactConfig,
  defaultContactConfig,
  ServerPaymentRequest,
  ServerPromoConfig,
  ServerPromoRiskSummary,
  ServerRiskAlertEntry,
  ServerSavedBankDetails,
  ServerStoredUser,
  ServerSupportTicket,
  StreamBroadcastEvent,
  toPublicPromoConfig,
} from './ServerTypes';
import { AuditAndAlertLedger } from './services/AuditAndAlertLedger';
import { BotRiskCoordinator } from './services/BotRiskCoordinator';
import { DiceArenaCoordinator } from './services/DiceArenaCoordinator';
import { PromoRiskService } from './services/PromoRiskService';
import { UserAuthAccountService } from './services/UserAuthAccountService';
import { WalletPaymentService } from './services/WalletPaymentService';

/**
 * Backend Authoritative Facade & Composition Coordinator.
 * Orchestrates modular domain and application services cleanly following SOLID & OOP principles.
 */
export class ServerArenaRuntime {
  private readonly store: PlatformStoreData;
  private readonly repository: IRepository<PlatformStoreData>;
  private readonly broadcast: (evt: StreamBroadcastEvent) => void;
  private readonly hasher: PasswordHasher;
  private readonly random: IRandomGenerator;
  private readonly feeStrategy: TierFeeStrategy;
  private readonly botService: BotSimulationService;
  private readonly users = new Map<string, User>();

  private readonly ledger: AuditAndAlertLedger;
  private readonly promoService: PromoRiskService;
  private readonly botCoordinator: BotRiskCoordinator;
  private readonly userService: UserAuthAccountService;
  private readonly walletService: WalletPaymentService;
  private readonly arenaCoordinator: DiceArenaCoordinator;

  private version = 1;

  constructor(
    repository: IRepository<PlatformStoreData>,
    broadcast: (evt: StreamBroadcastEvent) => void,
    hasher: PasswordHasher = new PasswordHasher()
  ) {
    this.repository = repository;
    this.broadcast = broadcast;
    this.hasher = hasher;
    this.store = this.repository.load();

    TokenEconomy.applyConfig(this.store.economyConfig);
    this.random = new NodeCryptoRandomGenerator();
    this.feeStrategy = new TierFeeStrategy();
    this.botService = new BotSimulationService();

    const commitChanges = this.commitChanges.bind(this);
    const persistOnly = () => this.repository.save(this.store);

    this.ledger = new AuditAndAlertLedger(this.store);
    this.promoService = new PromoRiskService(this.store, this.users, this.ledger, commitChanges);
    this.botCoordinator = new BotRiskCoordinator(this.store, this.ledger);
    this.userService = new UserAuthAccountService(
      this.store,
      this.users,
      this.promoService,
      this.hasher,
      this.ledger,
      commitChanges,
      persistOnly
    );
    this.walletService = new WalletPaymentService(
      this.store,
      this.users,
      this.userService,
      this.promoService,
      this.ledger,
      commitChanges
    );
    this.arenaCoordinator = new DiceArenaCoordinator(
      this.store,
      this.users,
      this.userService,
      this.walletService,
      this.botCoordinator,
      this.promoService,
      this.random,
      this.feeStrategy,
      this.botService,
      this.ledger,
      commitChanges
    );

    this.userService.hydrateFromStore(this.botService);
    this.arenaCoordinator.initBoards();
    this.userService.flushToStore();
    this.store.telemetry = {
      diceBoards: this.arenaCoordinator.serializeAdminBoards(),
      sportsEvents: [],
      updatedAt: Date.now(),
    };
    this.repository.save(this.store);
  }

  public start(): void {
    this.arenaCoordinator.start();
  }

  public stop(): void {
    this.arenaCoordinator.stop();
  }

  public getVersion(): number {
    return this.version;
  }

  public getDomainUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  public getPublicEconomyConfig(): EconomyConfig {
    return { ...this.store.economyConfig };
  }

  public getPublicPromoMetadata(): {
    config: ReturnType<typeof toPublicPromoConfig>;
    economyConfig: EconomyConfig;
  } {
    return {
      config: toPublicPromoConfig(this.store.promoConfig),
      economyConfig: { ...this.store.economyConfig },
    };
  }

  private commitChanges(
    options: {
      persistNow?: boolean;
      affectedUserIds?: string[];
      broadcastArena?: boolean;
    } = {}
  ): void {
    this.version += 1;
    this.userService.flushToStore();
    this.store.telemetry = {
      diceBoards: this.arenaCoordinator.serializeAdminBoards(),
      sportsEvents: [],
      updatedAt: Date.now(),
    };
    if (options.persistNow) {
      this.repository.save(this.store);
      this.arenaCoordinator.markPersistTick();
    }
    if (options.broadcastArena && options.affectedUserIds && options.affectedUserIds.length > 0) {
      this.broadcast({ type: 'all', userIds: options.affectedUserIds });
    } else if (options.broadcastArena) {
      this.broadcast({ type: 'arena' });
    } else if (options.affectedUserIds && options.affectedUserIds.length > 0) {
      this.broadcast({ type: 'player', userIds: options.affectedUserIds });
    }
  }

  // --- Public & Private Snapshots ---

  public serializePublicArenaState(): PublicArenaSnapshot {
    const publicProfiles: PublicPlayerProfile[] = [];
    for (const u of this.users.values()) {
      publicProfiles.push({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        avatarFrameId: u.avatarFrameId,
        country: u.country,
      });
    }
    return {
      version: this.version,
      serverTime: Date.now(),
      economyConfig: { ...this.store.economyConfig },
      promoConfig: toPublicPromoConfig(this.store.promoConfig),
      contactConfig: this.store.contactConfig ?? defaultContactConfig(),
      diceBoards: this.arenaCoordinator.serializePublicBoards(),
      publicProfiles,
      activeInvites: this.arenaCoordinator.getActiveInvites(),
    };
  }

  public serializeAdminDiceBoards(): ServerDiceBoardSnapshot[] {
    return this.arenaCoordinator.serializeAdminBoards();
  }

  public getContactConfig(): ServerContactConfig {
    return this.store.contactConfig ?? defaultContactConfig();
  }

  public serializePlayerPrivateState(userId: string): PrivatePlayerSnapshot | null {
    const user = this.users.get(userId);
    const storedUser = this.store.users.find((u) => u.id === userId);
    if (!user || !storedUser || user.isBot) return null;

    const payments: PaymentRequest[] = this.store.payments
      .filter((p) => p.userId === userId)
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.username,
        kind: p.kind,
        method: p.method as PaymentMethod,
        tokenAmount: p.tokenAmount,
        usdEquivalent: p.usdEquivalent,
        localCurrencyEquivalent: p.localCurrencyEquivalent,
        referenceId: p.referenceId,
        destinationOrBankDetails: p.destinationOrBankDetails,
        receiptPreviewName: p.receiptPreviewName,
        receiptDataUrl: p.receiptDataUrl,
        status:
          p.status === 'APPROVED'
            ? ApprovalStatus.APPROVED
            : p.status === 'REJECTED'
              ? ApprovalStatus.REJECTED
              : ApprovalStatus.PENDING,
        createdAt: p.createdAt,
        reviewedAt: p.reviewedAt,
        adminNote: p.adminNote,
      }));

    return {
      version: this.version,
      user: user.toJSON(),
      payments,
      referralSummary: this.promoService.buildUserReferralSummary(storedUser),
      promoConfig: toPublicPromoConfig(this.store.promoConfig),
      economyConfig: { ...this.store.economyConfig },
    };
  }

  public getSanitizedAdminStore(): Omit<PlatformStoreData, 'users'> & {
    users: (Omit<ServerStoredUser, 'passwordHash' | 'passwordSalt'> & {
      passwordHash: undefined;
      passwordSalt: undefined;
    })[];
    botSummary: ServerBotRiskSummary;
    promoSummary: ServerPromoRiskSummary;
  } {
    this.userService.hydrateFromStore(this.botService);
    this.userService.flushToStore();
    const sanitizedUsers = this.store.users.map((u) => ({
      ...u,
      passwordHash: undefined,
      passwordSalt: undefined,
    }));
    return {
      ...this.store,
      telemetry: {
        ...this.store.telemetry,
        diceBoards: this.arenaCoordinator.serializeAdminPanelBoards(),
      },
      users: sanitizedUsers,
      botSummary: this.botCoordinator.computeSummary(),
      promoSummary: this.promoService.computeSummary(),
    };
  }

  // --- Player Authentication & Account Mutations ---

  public registerPlayer(
    input: {
      displayName: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
      referralCode?: string;
    },
    ipHash: string
  ) {
    return this.userService.registerPlayer(input, ipHash);
  }

  public loginWithPassword(identifier: string, password: string): User {
    return this.userService.loginWithPassword(identifier, password);
  }

  public loginOrRegisterGoogle(
    verifiedClaims: VerifiedGoogleIdentity,
    referralCodeInput: string | undefined,
    ipHash: string
  ) {
    return this.userService.loginOrRegisterGoogle(verifiedClaims, referralCodeInput, ipHash);
  }

  public changePlayerPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): void {
    this.userService.changePlayerPassword(userId, currentPassword, newPassword, confirmPassword);
  }

  public updatePlayerProfile(
    userId: string,
    updates: {
      displayName: string;
      email: string;
      country?: string;
      phoneNumber?: string;
      dateOfBirth?: string;
      ageVerified?: boolean;
      dailyBetLimitTokens?: number;
    }
  ): void {
    this.userService.updatePlayerProfile(userId, updates);
  }

  public updatePlayerPayoutDetails(
    userId: string,
    updates: {
      savedCryptoAddress?: string;
      savedBankDetails?: ServerSavedBankDetails;
    }
  ): void {
    this.userService.updatePlayerPayoutDetails(userId, updates);
  }

  public submitPlayerKyc(userId: string, documentName: string, documentDataUrl: string): void {
    this.userService.submitPlayerKyc(userId, documentName, documentDataUrl);
  }

  public updatePlayerAvatar(userId: string, avatarUrl: string, avatarFrameId?: string): void {
    this.userService.updatePlayerAvatar(userId, avatarUrl, avatarFrameId);
  }

  // --- Player Wallet & Payments ---

  public requestCryptoDeposit(
    userId: string,
    usdAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC
  ): ServerPaymentRequest {
    return this.walletService.requestCryptoDeposit(userId, usdAmount, method);
  }

  public attachDepositReceipt(
    userId: string,
    requestId: string,
    receiptName: string,
    receiptDataUrl: string
  ): ServerPaymentRequest {
    return this.walletService.attachDepositReceipt(userId, requestId, receiptName, receiptDataUrl);
  }

  public requestWithdrawal(
    userId: string,
    tokenAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC | PaymentMethod.SRI_LANKA_BANK,
    destinationDetails: string
  ): ServerPaymentRequest {
    return this.walletService.requestWithdrawal(userId, tokenAmount, method, destinationDetails);
  }

  // --- Player Arena Actions ---

  public enterTierForPlay(userId: string, tierId: TierId, betAmount?: number) {
    return this.arenaCoordinator.enterTierForPlay(userId, tierId, betAmount);
  }

  public leaveLobbyVisitor(userId: string, boardId: string): void {
    this.arenaCoordinator.leaveLobbyVisitor(userId, boardId);
  }

  public enterBoardAsSideBettor(userId: string, boardId: string): void {
    this.arenaCoordinator.enterBoardAsSideBettor(userId, boardId);
  }

  public joinMainSeat(userId: string, boardId: string, betAmount: number): void {
    this.arenaCoordinator.joinMainSeat(userId, boardId, betAmount);
  }

  public acceptRoomInviteAndJoin(userId: string, boardId: string, betAmount: number): string {
    return this.arenaCoordinator.acceptRoomInviteAndJoin(userId, boardId, betAmount);
  }

  public updateMainSeatBet(userId: string, boardId: string, newBetAmount: number): void {
    this.arenaCoordinator.updateMainSeatBet(userId, boardId, newBetAmount);
  }

  public leaveMainSeat(userId: string, boardId: string): void {
    this.arenaCoordinator.leaveMainSeat(userId, boardId);
  }

  public quickStartMatch(userId: string, boardId: string): { started: boolean; message: string } {
    return this.arenaCoordinator.quickStartMatch(userId, boardId);
  }

  public executeUserTurnRoll(userId: string, boardId: string): DiceRollEvent {
    return this.arenaCoordinator.executeUserTurnRoll(userId, boardId);
  }

  public placeSideBetBatch(
    userId: string,
    boardId: string,
    items: { category: SideBetCategory; option: SideBetOptionKey; amount: number }[]
  ): { placedCount: number; totalRefunded: number } {
    return this.arenaCoordinator.placeSideBetBatch(userId, boardId, items);
  }

  public resetBoardForNextMatch(userId: string, boardId: string): void {
    this.arenaCoordinator.resetBoardForNextMatch(userId, boardId);
  }

  // --- Support Tickets ---

  public submitSupportTicket(input: {
    name: string;
    email: string;
    category: string;
    referenceId: string;
    subject: string;
    message: string;
  }): ServerSupportTicket {
    const ticket: ServerSupportTicket = {
      id: `BSP-${crypto.randomInt(100000, 1000000)}`,
      name: input.name,
      email: input.email,
      category: input.category || 'Other Inquiry',
      referenceId: input.referenceId || 'N/A',
      subject: input.subject,
      message: input.message,
      createdAt: new Date().toLocaleString(),
      createdTimestamp: Date.now(),
      status: 'Open · Under Review',
    };
    this.store.tickets.unshift(ticket);
    if (this.store.tickets.length > 200) {
      this.store.tickets = this.store.tickets.slice(0, 200);
    }
    this.repository.save(this.store);
    return ticket;
  }

  public adminUpdateSupportTicket(
    ticketId: string,
    status: 'Open · Under Review' | 'In Progress' | 'Resolved',
    adminReply: string | undefined,
    adminUsername: string
  ): ServerSupportTicket | null {
    const ticket = this.store.tickets.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.status = status;
    if (adminReply !== undefined) ticket.adminReply = adminReply;
    ticket.updatedAt = Date.now();
    this.ledger.appendAudit(adminUsername, 'UPDATE_TICKET', ticket.id, `Set status to "${status}"`);
    this.repository.save(this.store);
    return ticket;
  }

  // --- Admin Operations ---

  public adminUpdateEconomyConfig(
    rawBody: unknown,
    syncReferralMinDeposit: boolean,
    adminUsername: string
  ): { economyConfig: EconomyConfig; promoConfig: ServerPromoConfig } {
    const nextEconomy = PlatformConfigSanitizer.sanitizeEconomy(
      rawBody,
      this.store.economyConfig,
      adminUsername
    );
    this.store.economyConfig = nextEconomy;
    TokenEconomy.applyConfig(nextEconomy);

    const minDepositTokens = Math.max(
      1,
      Math.round(nextEconomy.minDepositUsd * nextEconomy.tokensPerUsd)
    );
    const minWithdrawTokens = Math.max(
      1,
      Math.round(nextEconomy.minWithdrawUsd * nextEconomy.tokensPerUsd)
    );

    if (syncReferralMinDeposit) {
      this.store.promoConfig = {
        ...this.store.promoConfig,
        referralMinDepositTokens: minDepositTokens,
        minRealDepositToUnlockTokens: minDepositTokens,
        updatedAt: Date.now(),
        updatedBy: adminUsername,
      };
    }

    this.ledger.appendAudit(
      adminUsername,
      'UPDATE_ECONOMY_CONFIG',
      'TOKEN_ECONOMY',
      `Peg 1 USD = ${nextEconomy.tokensPerUsd.toLocaleString()} TKN (${nextEconomy.lkrPerUsd} LKR) · Min Bet ${nextEconomy.minBetTokens.toLocaleString()} TKN · Min Deposit $${nextEconomy.minDepositUsd.toFixed(2)} (${minDepositTokens.toLocaleString()} TKN) · Min Withdraw $${nextEconomy.minWithdrawUsd.toFixed(2)} (${minWithdrawTokens.toLocaleString()} TKN)`
    );
    this.commitChanges({ persistNow: true, broadcastArena: true });
    return { economyConfig: nextEconomy, promoConfig: this.store.promoConfig };
  }

  public adminUpdateBotConfig(rawBody: unknown, adminUsername: string): ServerBotConfig {
    const prevEnabled = this.store.botConfig.enabled;
    const nextConfig = PlatformConfigSanitizer.sanitizeBot(
      rawBody,
      this.store.botConfig,
      adminUsername
    );
    this.store.botConfig = nextConfig;
    this.ledger.appendAudit(
      adminUsername,
      prevEnabled !== nextConfig.enabled
        ? nextConfig.enabled
          ? 'ENABLE_BOTS'
          : 'DISABLE_BOTS'
        : 'UPDATE_BOT_CONFIG',
      'BOT_ENGINE',
      `Bots ${nextConfig.enabled ? 'ON' : 'OFF'} · Wait ${nextConfig.triggerWaitSeconds}s · Match Cap ${nextConfig.maxPerMatchStakeTokens} TKN`
    );
    this.commitChanges({ persistNow: true, broadcastArena: false });
    return nextConfig;
  }

  public adminUpdatePromoConfig(rawBody: unknown, adminUsername: string): ServerPromoConfig {
    const prevWelcome = this.store.promoConfig.welcomeBonusEnabled;
    const prevRef = this.store.promoConfig.referralProgramEnabled;
    const nextPromo = PlatformConfigSanitizer.sanitizePromo(
      rawBody,
      this.store.promoConfig,
      adminUsername
    );
    this.store.promoConfig = nextPromo;

    let actionName = 'UPDATE_PROMO_CONFIG';
    if (prevWelcome !== nextPromo.welcomeBonusEnabled) {
      actionName = nextPromo.welcomeBonusEnabled
        ? 'ENABLE_WELCOME_BONUS'
        : 'DISABLE_WELCOME_BONUS';
    } else if (prevRef !== nextPromo.referralProgramEnabled) {
      actionName = nextPromo.referralProgramEnabled
        ? 'ENABLE_REFERRAL_PROGRAM'
        : 'DISABLE_REFERRAL_PROGRAM';
    }

    this.ledger.appendAudit(
      adminUsername,
      actionName,
      'PROMO_ENGINE',
      `Welcome Bonus: ${nextPromo.welcomeBonusEnabled ? `ON (+${nextPromo.welcomeBonusTokens} TKN)` : 'OFF'} · Referral Program: ${
        nextPromo.referralProgramEnabled ? `ON (+${nextPromo.referralBonusTokens} TKN each)` : 'OFF'
      }`
    );
    this.commitChanges({ persistNow: true, broadcastArena: true });
    return nextPromo;
  }

  public adminUpdateContactConfig(rawBody: unknown, adminUsername: string): ServerContactConfig {
    const nextContact = PlatformConfigSanitizer.sanitizeContact(
      rawBody,
      this.store.contactConfig ?? defaultContactConfig(),
      adminUsername
    );
    this.store.contactConfig = nextContact;
    this.ledger.appendAudit(
      adminUsername,
      'UPDATE_CONTACT_CONFIG',
      'CUSTOMER_CARE',
      `Support Email: ${nextContact.supportEmail} · Telegram: @${nextContact.telegramUsername} (${nextContact.telegramLink})`
    );
    this.commitChanges({ persistNow: true, broadcastArena: true });
    return nextContact;
  }

  public adminAdjustPromoBudget(
    action: 'TOPUP' | 'REDUCE',
    amountTokens: number,
    note: string,
    adminUsername: string
  ): void {
    if (amountTokens <= 0) {
      throw new Error('Amount must be greater than 0 tokens.');
    }
    if (action === 'REDUCE' && amountTokens > this.store.promoPoolBudgetTokens) {
      throw new Error('Cannot reduce more than remaining promo budget reserve.');
    }

    const delta = action === 'TOPUP' ? amountTokens : -amountTokens;
    this.store.promoPoolBudgetTokens = Math.max(0, this.store.promoPoolBudgetTokens + delta);
    this.promoService.appendPromoLedger({
      kind: action === 'TOPUP' ? 'BUDGET_TOPUP' : 'BUDGET_REDUCE',
      username: `@${adminUsername}`,
      tokenAmount: amountTokens,
      realLiabilityImpactTokens: 0,
      note: note || `Admin ${action.toLowerCase()} ${amountTokens.toLocaleString()} TKN promo reserve`,
    });
    this.ledger.appendAudit(
      adminUsername,
      action === 'TOPUP' ? 'PROMO_BUDGET_TOPUP' : 'PROMO_BUDGET_REDUCE',
      'PROMO_RESERVE',
      `${delta >= 0 ? '+' : ''}${delta.toLocaleString()} TKN`
    );
    this.repository.save(this.store);
  }

  public adminRevokePromoTokens(
    userId: string,
    requestedAmount: number,
    reason: string,
    adminUsername: string
  ): number {
    return this.promoService.adminRevokePromoTokens(userId, requestedAmount, reason, adminUsername);
  }

  public adminUpdatePromoUserNote(
    userId: string,
    note: string,
    flag: ServerStoredUser['promoRiskFlag'] | undefined,
    adminUsername: string
  ): ServerStoredUser | null {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) return null;
    user.promoAdminNote = note;
    if (flag) user.promoRiskFlag = flag;
    user.adminAdjustedAt = Date.now();
    this.ledger.appendAudit(
      adminUsername,
      'PROMO_ACCOUNT_NOTE',
      `@${user.username}`,
      `Flag=${user.promoRiskFlag ?? 'NONE'} · Note: ${note || '(Cleared)'}`
    );
    this.repository.save(this.store);
    return user;
  }

  public adminAdjustBotPool(
    action: 'TOPUP' | 'WITHDRAW' | 'SET' | 'BURN_SURPLUS',
    amountTokens: number,
    note: string,
    adminUsername: string
  ): void {
    if (amountTokens < 0) {
      throw new Error('Amount cannot be negative.');
    }
    if (action === 'WITHDRAW' && amountTokens > this.store.botPoolBalanceTokens) {
      throw new Error('Cannot sweep more than current Bot Pool balance.');
    }

    let signedDelta = 0;
    let ledgerKind: ServerBotLiquidityLedgerEntry['kind'] = 'POOL_TOPUP';
    let opponentSummary = 'Admin Treasury Funding';
    let auditAction = 'BOT_POOL_TOPUP';

    if (action === 'TOPUP') {
      signedDelta = amountTokens;
      ledgerKind = 'POOL_TOPUP';
      opponentSummary = 'Admin Treasury Funding';
      auditAction = 'BOT_POOL_TOPUP';
      this.store.botPoolBalanceTokens = Math.max(0, this.store.botPoolBalanceTokens + amountTokens);
      this.store.botCooldownMatchesRemaining = 0;
      this.store.botConsecutiveLosses = 0;
    } else if (action === 'WITHDRAW') {
      signedDelta = -amountTokens;
      ledgerKind = 'POOL_WITHDRAW';
      opponentSummary = 'Admin Pool Sweep';
      auditAction = 'BOT_POOL_WITHDRAW';
      this.store.botPoolBalanceTokens = Math.max(0, this.store.botPoolBalanceTokens - amountTokens);
    } else if (action === 'SET') {
      const targetBalance = Math.max(0, amountTokens);
      signedDelta = targetBalance - this.store.botPoolBalanceTokens;
      ledgerKind = 'POOL_SET';
      opponentSummary = `Admin Set Target Pool (${targetBalance.toLocaleString()} TKN)`;
      auditAction = 'BOT_POOL_SET_TARGET';
      this.store.botPoolBalanceTokens = targetBalance;
      this.store.botCooldownMatchesRemaining = 0;
      this.store.botConsecutiveLosses = 0;
    } else if (action === 'BURN_SURPLUS') {
      if (this.store.botPoolBalanceTokens <= 0) {
        throw new Error('Bot Liquidity Pool is already 0 TKN. No tokens to burn.');
      }
      const burnAmount = amountTokens > 0
        ? Math.min(this.store.botPoolBalanceTokens, amountTokens)
        : this.store.botPoolBalanceTokens;
      signedDelta = -burnAmount;
      ledgerKind = 'POOL_BURN_SURPLUS';
      opponentSummary = `Burned -${burnAmount.toLocaleString()} unbacked tokens`;
      auditAction = 'BOT_POOL_BURN_SURPLUS';
      this.store.botPoolBalanceTokens = Math.max(0, this.store.botPoolBalanceTokens - burnAmount);
    }

    this.store.botLiquidityLedger.unshift({
      id: `botp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      kind: ledgerKind,
      roomLabel: 'Bot Treasury Pool',
      botUsername: `@${adminUsername}`,
      opponentSummary,
      stakeTokens: signedDelta < 0 ? Math.abs(signedDelta) : 0,
      payoutTokens: signedDelta > 0 ? signedDelta : 0,
      netTokens: signedDelta,
      poolBalanceAfter: this.store.botPoolBalanceTokens,
      note: note || `Admin ${auditAction.toLowerCase()} (${signedDelta.toLocaleString()} TKN)`,
      createdAt: Date.now(),
    });
    if (this.store.botLiquidityLedger.length > 500) {
      this.store.botLiquidityLedger = this.store.botLiquidityLedger.slice(0, 500);
    }

    this.ledger.appendAudit(
      adminUsername,
      auditAction,
      'BOT_POOL',
      `${signedDelta >= 0 ? '+' : ''}${signedDelta.toLocaleString()} TKN · New Balance: ${this.store.botPoolBalanceTokens.toLocaleString()} TKN`
    );
    this.repository.save(this.store);
  }

  public adminAcknowledgeRiskAlert(
    alertId: string,
    adminUsername: string
  ): ServerRiskAlertEntry | null {
    const alert = this.store.riskAlerts.find((a) => a.id === alertId);
    if (!alert) return null;
    alert.acknowledged = true;
    alert.acknowledgedBy = adminUsername;
    alert.acknowledgedAt = Date.now();
    this.ledger.appendAudit(
      adminUsername,
      'ACK_RISK_ALERT',
      alert.username ?? alert.type,
      alert.title
    );
    this.repository.save(this.store);
    return alert;
  }

  public adminCancelDiceMatch(boardId: string, adminUsername: string): void {
    this.arenaCoordinator.adminCancelDiceMatch(boardId, adminUsername);
  }

  public adminCancelSideBet(boardId: string, betId: string, adminUsername: string): void {
    this.arenaCoordinator.adminCancelSideBet(boardId, betId, adminUsername);
  }

  public adminSuspendSideBet(boardId: string, betId: string, adminUsername: string): void {
    this.arenaCoordinator.adminSuspendSideBet(boardId, betId, adminUsername);
  }

  public adminCreateUser(params: {
    username: string;
    displayName: string;
    email: string;
    role: 'PLAYER' | 'HIGH_ROLLER';
    initialBalance: number;
    adminUsername: string;
  }): ServerStoredUser {
    return this.userService.adminCreateUser(params);
  }

  public adminUpdateUser(
    userId: string,
    updates: {
      displayName?: string;
      email?: string;
      role?: 'PLAYER' | 'HIGH_ROLLER';
      status?: 'ACTIVE' | 'SUSPENDED';
      balanceOverride?: number;
      adminUsername: string;
    }
  ): ServerStoredUser {
    return this.userService.adminUpdateUser(userId, updates);
  }

  public adminReviewKyc(
    userId: string,
    approve: boolean,
    note: string,
    adminUsername: string
  ): ServerStoredUser {
    return this.userService.adminReviewKyc(userId, approve, note, adminUsername);
  }

  public adminManualTopUp(params: {
    userId: string;
    amountTokens: number;
    reason: string;
    fundingSource: string;
    referenceCode: string;
    adminUsername: string;
  }): ServerStoredUser {
    return this.walletService.adminManualTopUp(params);
  }

  public adminReviewPayment(
    paymentId: string,
    approve: boolean,
    note: string,
    adminUsername: string
  ) {
    return this.walletService.adminReviewPayment(paymentId, approve, note, adminUsername);
  }

  public adminDeleteUser(userId: string, adminUsername: string): void {
    const idx = this.store.users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error('User not found.');
    if (this.store.users[idx].isBot) {
      throw new Error('System liquidity bots cannot be deleted directly.');
    }

    this.arenaCoordinator.assertUserDeletable(userId);
    const domainUser = this.users.get(userId);
    this.arenaCoordinator.removeUserFromBoards(userId, domainUser);

    const [removed] = this.store.users.splice(idx, 1);
    this.users.delete(userId);
    this.ledger.appendAudit(adminUsername, 'DELETE_USER', removed.username, 'Removed player account');
    this.commitChanges({ persistNow: true, broadcastArena: true });
  }

  public adminResetAllPlayers(adminUsername: string): void {
    this.store.users = [];
    this.store.payments = [];
    this.store.tickets = [];
    this.store.incomeRecords = [];
    this.store.incomeSummary = emptyIncomeSummary();
    this.store.riskAlerts = [];
    this.store.playerRiskStats = {};
    this.store.referrals = [];
    this.store.promoTokenLedger = [];
    this.store.promoPoolBudgetTokens = DEFAULT_PROMO_BUDGET_POOL;
    this.store.botConsecutiveLosses = 0;
    this.store.botCooldownMatchesRemaining = 0;
    this.store.telemetry = { diceBoards: [], sportsEvents: [], updatedAt: Date.now() };

    this.userService.hydrateFromStore(this.botService);
    this.arenaCoordinator.resetAllBoards();
    this.ledger.appendAudit(
      adminUsername,
      'RESET_PLAYERS_AND_BOTS',
      'SYSTEM',
      'Removed all player accounts, queues, referrals, promo ledger, alerts, and stale telemetry; kept Admin account, Bot & Promo Config'
    );
    this.commitChanges({ persistNow: true, broadcastArena: true });
  }
}
