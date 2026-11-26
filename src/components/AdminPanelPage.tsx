import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Database,
  Dices,
  Download,
  Edit3,
  Eye,
  Gift,
  Headphones,
  KeyRound,
  Lock,
  Mail,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  BotConfig,
  DEFAULT_BOT_CONFIG,
  DEFAULT_BOT_POOL_BALANCE_TOKENS,
} from '../domain/BotRiskTypes';
import {
  DEFAULT_ECONOMY_CONFIG,
  EconomyConfig,
} from '../domain/EconomyTypes';
import {
  DEFAULT_PROMO_BUDGET_POOL_TOKENS,
  DEFAULT_PROMO_CONFIG,
  PromoConfig,
  PromoRiskFlag,
  PromoRiskSummary,
} from '../domain/PromoTypes';
import { ApprovalStatus, GamePhase, KycStatus, PlatformIncomeRecord, PlatformIncomeSource, TierId, UserRole, UserStatus } from '../domain/types';
import { TokenEconomy } from '../domain/TokenEconomy';
import {
  adminAuthClient,
  AdminDiceBoardSnapshot,
  AdminServerAuditLog,
  AdminServerPayment,
  AdminServerStore,
  AdminServerTicket,
  AdminServerUser,
} from '../services/AdminAuthClient';
import { AdminDatabaseTab } from './AdminDatabaseTab';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { CountryFlag } from './CountryFlag';
import { DiceTokenIcon } from './DiceTokenIcon';

interface AdminPanelPageProps {
  engine: BetSpotEngine;
  onError: (msg: string) => void;
}

type AdminTab = 'overview' | 'economy' | 'income' | 'bots' | 'promos' | 'users' | 'dice' | 'payments' | 'history' | 'tickets' | 'database';
type DiceViewMode = 'ACTIVE' | 'PAST' | 'ALL';
type UserFilterMode = 'ALL' | 'PENDING_KYC' | 'VERIFIED' | 'REJECTED_KYC' | 'SUSPENDED';
type UserModalTab = 'profile' | 'ledger' | 'bets';
type PaymentKindFilter = 'ALL' | 'DEPOSIT' | 'WITHDRAWAL';
type HistoryCategoryFilter = 'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'KYC' | 'SYSTEM';
type TicketFilter = 'ALL' | 'Open · Under Review' | 'In Progress' | 'Resolved';

function sanitizeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename: string, headers: string[], rows: unknown[][]): void {
  const csvLines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminPanelPage: React.FC<AdminPanelPageProps> = ({ engine, onError }) => {
  const [subTab, setSubTab] = useState<AdminTab>('overview');
  const [serverStore, setServerStore] = useState<AdminServerStore | null>(null);
  const [loadingStore, setLoadingStore] = useState<boolean>(true);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Admin Credential Change Form
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState(engine.adminSession?.username ?? 'admin');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Users Search, Filter & Forms
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilterMode>('ALL');
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);
  const [userModalTab, setUserModalTab] = useState<UserModalTab>('profile');

  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.PLAYER);
  const [newBalance, setNewBalance] = useState('3000');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.PLAYER);
  const [editBalance, setEditBalance] = useState('');

  // Dice Explorer Filters (default: ACTIVE matches & active bets only; past hidden until filtered)
  const [diceViewMode, setDiceViewMode] = useState<DiceViewMode>('ACTIVE');
  const [diceTierFilter, setDiceTierFilter] = useState<string>('ALL');
  const [dicePhaseFilter, setDicePhaseFilter] = useState<string>('ALL');
  const [diceSearch, setDiceSearch] = useState<string>('');

  // Income Explorer Filters
  const [incomeChannelFilter, setIncomeChannelFilter] = useState<'ALL' | PlatformIncomeSource>('ALL');
  const [incomeScopeFilter, setIncomeScopeFilter] = useState<'ALL' | 'HUMAN_ONLY'>('ALL');
  const [incomeSearch, setIncomeSearch] = useState<string>('');

  // Image Preview Modal (KYC / Payment Slip)
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);

  // KYC Queue Review Notes & System Reset Confirmation
  const [kycNoteByUser, setKycNoteByUser] = useState<Record<string, string>>({});
  const [confirmResetAll, setConfirmResetAll] = useState<boolean>(false);

  // Payments Queue & Manual Top-Up
  const [paymentKindFilter, setPaymentKindFilter] = useState<PaymentKindFilter>('ALL');
  const [reviewNoteByPayment, setReviewNoteByPayment] = useState<Record<string, string>>({});
  const [topUpUserId, setTopUpUserId] = useState<string>('');
  const [topUpAmount, setTopUpAmount] = useState<string>('1500');
  const [topUpSource, setTopUpSource] = useState<string>('OTC Treasury Desk');
  const [topUpRef, setTopUpRef] = useState<string>('ADM-TOPUP-01');
  const [topUpReason, setTopUpReason] = useState<string>('Verified VIP loyalty credit');

  // History & Audit Log Filters
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<HistoryCategoryFilter>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');

  // Support Ticket Filters & Drafts
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('ALL');
  const [ticketReplyDraft, setTicketReplyDraft] = useState<Record<string, string>>({});
  const [ticketStatusDraft, setTicketStatusDraft] = useState<
    Record<string, 'Open · Under Review' | 'In Progress' | 'Resolved'>
  >({});

  // Customer Care Contact Channels
  const [supportEmailDraft, setSupportEmailDraft] = useState<string>(
    () => engine.contactConfig.supportEmail || 'support@betspot.gg'
  );
  const [telegramUsernameDraft, setTelegramUsernameDraft] = useState<string>(
    () => engine.contactConfig.telegramUsername || 'BetSpotSupport'
  );
  const [telegramLinkDraft, setTelegramLinkDraft] = useState<string>(
    () => engine.contactConfig.telegramLink || 'https://t.me/BetSpotSupport'
  );
  const [contactConfigDirty, setContactConfigDirty] = useState<boolean>(false);
  const [contactSaving, setContactSaving] = useState<boolean>(false);
  const [contactFeedback, setContactFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Token Peg & Limits Controls
  const [economyDraft, setEconomyDraft] = useState<EconomyConfig>(() => ({
    ...DEFAULT_ECONOMY_CONFIG,
    ...engine.economyConfig,
  }));
  const [economyConfigDirty, setEconomyConfigDirty] = useState<boolean>(false);
  const [syncReferralOnEconomySave, setSyncReferralOnEconomySave] = useState<boolean>(true);

  // Bot & Risk Guard Controls
  const [botDraft, setBotDraft] = useState<BotConfig>(() => ({ ...engine.botConfig }));
  const [botConfigDirty, setBotConfigDirty] = useState<boolean>(false);
  const [poolAdjustAmount, setPoolAdjustAmount] = useState<string>('5000');
  const [poolAdjustNote, setPoolAdjustNote] = useState<string>('');

  // Free Token & Referral Anti-Inflation Controls
  const [promoDraft, setPromoDraft] = useState<PromoConfig>(() => ({
    ...DEFAULT_PROMO_CONFIG,
    ...engine.promoConfig,
  }));
  const [promoConfigDirty, setPromoConfigDirty] = useState<boolean>(false);
  const [promoBudgetAmount, setPromoBudgetAmount] = useState<string>('5000');
  const [promoBudgetNote, setPromoBudgetNote] = useState<string>('');
  const [promoNoteDraftByUser, setPromoNoteDraftByUser] = useState<Record<string, string>>({});
  const [promoFlagDraftByUser, setPromoFlagDraftByUser] = useState<Record<string, PromoRiskFlag>>({});
  const [promoRevokeAmountByUser, setPromoRevokeAmountByUser] = useState<Record<string, string>>({});
  const [promoUserSearch, setPromoUserSearch] = useState<string>('');

  const refreshStore = useCallback(
    async (silent = false) => {
      if (!engine.isAdmin) return;
      if (!silent) setLoadingStore(true);
      try {
        const store = await adminAuthClient.fetchAdminStore();
        setServerStore(store);
        if (store.economyConfig) {
          engine.applyEconomyConfig(store.economyConfig);
          if (!economyConfigDirty) {
            setEconomyDraft(store.economyConfig);
          }
        }
        if (store.botConfig && !botConfigDirty) {
          setBotDraft(store.botConfig);
        }
        if (store.promoConfig && !promoConfigDirty) {
          setPromoDraft(store.promoConfig);
        }
        if (store.contactConfig && !contactConfigDirty) {
          setSupportEmailDraft(store.contactConfig.supportEmail || 'support@betspot.gg');
          setTelegramUsernameDraft(store.contactConfig.telegramUsername || 'BetSpotSupport');
          setTelegramLinkDraft(
            store.contactConfig.telegramLink ||
              `https://t.me/${(store.contactConfig.telegramUsername || 'BetSpotSupport').replace(/^@/, '')}`
          );
        }
      } catch (err) {
        if (!silent) {
          onError(err instanceof Error ? err.message : 'Unable to fetch Admin store.');
        }
      } finally {
        if (!silent) setLoadingStore(false);
      }
    },
    [engine, engine.isAdmin, onError, economyConfigDirty, botConfigDirty, promoConfigDirty]
  );

  useEffect(() => {
    if (!engine.isAdmin) return;
    void refreshStore(false);
    const timer = window.setInterval(() => {
      void refreshStore(true);
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [engine.isAdmin, refreshStore]);

  // All admin collections read strictly from authoritative server store
  const mergedUsers = useMemo<AdminServerUser[]>(() => {
    return (serverStore?.users ?? [])
      .filter((u) => !u.isBot)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [serverStore]);

  const mergedPayments = useMemo<AdminServerPayment[]>(() => {
    return (serverStore?.payments ?? [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [serverStore]);

  const mergedDiceBoards = useMemo<AdminDiceBoardSnapshot[]>(() => {
    const rawBoards = serverStore?.telemetry?.diceBoards ?? [];
    return rawBoards.map((raw) => {
      const legacy = raw as AdminDiceBoardSnapshot & {
        tier?: { id?: string; label?: string; feeRate?: number; maxSeats?: number };
      };
      const cleanSeats = Array.isArray(legacy.seats) ? legacy.seats.filter((s) => Boolean(s)) : [];
      const computedPot =
        typeof legacy.lockedPot === 'number' && Number.isFinite(legacy.lockedPot)
          ? legacy.lockedPot
          : cleanSeats.reduce((sum, s) => sum + (s.lockedBet || s.initialBet || 0), 0);
      return {
        ...legacy,
        tierId: legacy.tierId ?? legacy.tier?.id ?? TierId.TIER_1,
        tierLabel: legacy.tierLabel ?? legacy.tier?.label ?? 'Room',
        feeRate: legacy.feeRate ?? legacy.tier?.feeRate ?? 0.01,
        maxSeats: legacy.maxSeats ?? legacy.tier?.maxSeats ?? 20,
        lockedPot: computedPot,
        occupiedCount:
          typeof legacy.occupiedCount === 'number' ? legacy.occupiedCount : cleanSeats.length,
        seats: cleanSeats,
        matchHistory: Array.isArray(legacy.matchHistory) ? legacy.matchHistory : [],
        pastSideBetReports: Array.isArray(legacy.pastSideBetReports)
          ? legacy.pastSideBetReports
          : [],
      };
    });
  }, [serverStore]);

  const tickets: AdminServerTicket[] = useMemo(() => {
    return (serverStore?.tickets ?? [])
      .slice()
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  }, [serverStore]);

  const auditLogs: AdminServerAuditLog[] = useMemo(() => {
    return (serverStore?.auditLogs ?? [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [serverStore]);

  useEffect(() => {
    if (!topUpUserId && mergedUsers.length > 0) {
      setTopUpUserId(mergedUsers[0].id);
    }
  }, [mergedUsers, topUpUserId]);

  if (!engine.isAdmin) {
    return null;
  }

  // Compute global KPIs & Revenue
  const pendingPayments = mergedPayments.filter((p) => p.status === ApprovalStatus.PENDING);
  const pendingKycUsers = mergedUsers.filter((u) => u.kycStatus === KycStatus.PENDING);
  const suspendedUsers = mergedUsers.filter((u) => u.status === UserStatus.SUSPENDED);
  const openTicketsCount = tickets.filter((t) => t.status !== 'Resolved').length;
  const totalAvailable = mergedUsers.reduce((acc, u) => acc + u.availableBalance, 0);
  const totalHeld = mergedUsers.reduce((acc, u) => acc + u.heldBalance, 0);
  const totalCirculation = totalAvailable + totalHeld;

  const liveEconomyConfig: EconomyConfig = serverStore?.economyConfig ??
    engine.economyConfig ?? { ...DEFAULT_ECONOMY_CONFIG };
  const liveBotConfig = serverStore?.botConfig ?? engine.botConfig ?? DEFAULT_BOT_CONFIG;
  const liveBotSummary = serverStore?.botSummary ??
    engine.botRiskSummary ?? {
      poolBalanceTokens: serverStore?.botPoolBalanceTokens ?? DEFAULT_BOT_POOL_BALANCE_TOKENS,
      hourlyNetPnlTokens: 0,
      dailyNetPnlTokens: 0,
      hourlyLossUsedTokens: 0,
      dailyLossUsedTokens: 0,
      consecutiveLosses: 0,
      cooldownMatchesRemaining: 0,
      isAutoPaused: false,
      autoPausedReason: null,
    };
  const botLedger = serverStore?.botLiquidityLedger ?? [];
  const riskAlerts = serverStore?.riskAlerts ?? [];
  const unackRiskAlertsCount = riskAlerts.filter((a) => !a.acknowledged).length;

  const livePromoConfig: PromoConfig = serverStore?.promoConfig ?? {
    ...DEFAULT_PROMO_CONFIG,
    ...engine.promoConfig,
  };
  const livePromoSummary: PromoRiskSummary = serverStore?.promoSummary ?? {
    budgetPoolTokens: serverStore?.promoPoolBudgetTokens ?? DEFAULT_PROMO_BUDGET_POOL_TOKENS,
    totalMintedTokens: 0,
    signupMintedTokens: 0,
    referralMintedTokens: 0,
    hourlyMintedTokens: 0,
    dailyMintedTokens: 0,
    unbackedCirculationTokens: mergedUsers.reduce(
      (sum, u) => sum + Math.min(u.availableBalance, Math.max(0, u.promoTokensRemaining ?? 0)),
      0
    ),
    burnedOrRecoveredTokens: 0,
    systemLossToBotPoolTokens: 0,
    realWithdrawalLeakageTokens: 0,
    netUnbackedExposureTokens: mergedUsers.reduce(
      (sum, u) => sum + Math.min(u.availableBalance, Math.max(0, u.promoTokensRemaining ?? 0)),
      0
    ),
    promoHoldersCount: mergedUsers.filter(
      (u) => (u.promoTokensGrantedTotal ?? 0) > 0 || (u.promoTokensRemaining ?? 0) > 0
    ).length,
    sharedIpFlaggedCount: mergedUsers.filter((u) => u.promoRiskFlag === 'SHARED_IP_RING').length,
    isBudgetAutoPaused: false,
    autoPausedReason: null,
  };
  const promoLedger = serverStore?.promoTokenLedger ?? [];
  const promoReferrals = serverStore?.referrals ?? [];
  const promoAccounts = mergedUsers.filter(
    (u) =>
      (u.promoTokensGrantedTotal ?? 0) > 0 ||
      (u.promoTokensRemaining ?? 0) > 0 ||
      Boolean(u.referredByUsername) ||
      Boolean(u.promoAdminNote) ||
      (u.promoRiskFlag && u.promoRiskFlag !== 'NONE')
  );

  const botAccounts = useMemo(
    () => (serverStore?.users ?? []).filter((u) => Boolean(u.isBot)),
    [serverStore]
  );
  const botIdSet = useMemo(() => new Set(botAccounts.map((b) => b.id)), [botAccounts]);
  const botUsernameSet = useMemo(
    () => new Set(botAccounts.map((b) => b.username.toLowerCase())),
    [botAccounts]
  );
  const isBotAccount = useCallback(
    (userId?: string, username?: string, explicitFlag?: boolean): boolean => {
      if (explicitFlag) return true;
      if (userId && (botIdSet.has(userId) || userId.startsWith('bot_liquidity_'))) return true;
      if (username && botUsernameSet.has(username.toLowerCase())) return true;
      return false;
    },
    [botIdSet, botUsernameSet]
  );

  // Authoritative server Platform Income records and cumulative summary
  const mergedIncomeRecords = useMemo<PlatformIncomeRecord[]>(() => {
    return (serverStore?.incomeRecords ?? [])
      .filter((r) => r.source !== 'SPORTS_FEE')
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [serverStore]);

  const resolvedIncome = useMemo(() => {
    const serverSummary = serverStore?.incomeSummary;
    return {
      diceMainFeeTokens: serverSummary?.diceMainFeeTokens ?? 0,
      sideBetFeeTokens: serverSummary?.sideBetFeeTokens ?? 0,
      entryFeeTokens: serverSummary?.entryFeeTokens ?? 0,
      humanInvolvedFeeTokens: serverSummary?.humanInvolvedFeeTokens ?? 0,
      recordCount: serverSummary?.recordCount ?? 0,
    };
  }, [serverStore]);

  const telemetryDiceMainFees = mergedDiceBoards.reduce(
    (sum, b) => sum + b.matchHistory.reduce((ms, m) => ms + m.feeAmount, 0),
    0
  );
  const telemetrySideBetFees = mergedDiceBoards.reduce(
    (sum, b) =>
      sum +
      b.pastSideBetReports.reduce((rs, rep) => rs + rep.totalFeesCollected, 0) +
      (b.activeSideBetRound?.bets.reduce((bs, bet) => bs + bet.feeDeducted, 0) ?? 0),
    0
  );

  const diceMainFees = Math.max(resolvedIncome.diceMainFeeTokens, telemetryDiceMainFees);
  const diceSideBetFees = Math.max(resolvedIncome.sideBetFeeTokens, telemetrySideBetFees);
  const diceEntryFees = resolvedIncome.entryFeeTokens;
  const totalHouseRevenue = diceMainFees + diceSideBetFees + diceEntryFees;

  const isBoardActive = (b: AdminDiceBoardSnapshot): boolean => {
    const hasLiveSideBets =
      b.activeSideBetRound?.bets.some(
        (bet) => bet.status === 'ACTIVE' || bet.status === 'MATCHED' || bet.status === 'SUSPENDED'
      ) ?? false;
    return (
      b.occupiedCount > 0 ||
      hasLiveSideBets ||
      (b.phase !== GamePhase.WAITING_FOR_PLAYERS && b.phase !== GamePhase.SETTLED)
    );
  };

  const activeDiceBoardsCount = mergedDiceBoards.filter(isBoardActive).length;
  const activeDicePotExposure = mergedDiceBoards.reduce((sum, b) => sum + b.lockedPot, 0);
  const activeSideBetExposure = mergedDiceBoards.reduce(
    (sum, b) =>
      sum +
      (b.activeSideBetRound?.bets
        .filter((bet) => bet.status === 'ACTIVE' || bet.status === 'MATCHED')
        .reduce((bs, bet) => bs + bet.originalStake, 0) ?? 0),
    0
  );
  const totalActiveExposure = activeDicePotExposure + activeSideBetExposure;

  const totalOpenBetsCount = mergedDiceBoards.reduce(
    (sum, b) =>
      sum +
      b.seats.length +
      (b.activeSideBetRound?.bets.filter((x) => x.status === 'ACTIVE' || x.status === 'MATCHED').length ?? 0),
    0
  );

  // ── Real vs Fake Token Breakdown (non-bot users only) ──
  const realUsers = useMemo(() => mergedUsers.filter((u) => !u.isBot), [mergedUsers]);
  const totalRealDepositedTokens = realUsers.reduce((sum, u) => sum + (u.realDepositedTokens ?? 0), 0);
  const totalRealWithdrawnTokens = realUsers.reduce((sum, u) => sum + (u.realWithdrawnTokens ?? 0), 0);
  const totalFakeTokensInCirculation = realUsers.reduce(
    (sum, u) => sum + Math.max(0, Math.min(u.availableBalance, u.promoTokensRemaining ?? 0)),
    0
  );
  const totalFakeTokensEverMinted = livePromoSummary.totalMintedTokens;
  const combinedFakePoolBalance = liveBotSummary.poolBalanceTokens + livePromoSummary.budgetPoolTokens;

  // Filtered collections
  const filteredUsers = mergedUsers.filter((u) => {
    if (userFilter === 'PENDING_KYC' && u.kycStatus !== KycStatus.PENDING) return false;
    if (userFilter === 'VERIFIED' && u.kycStatus !== KycStatus.VERIFIED) return false;
    if (userFilter === 'REJECTED_KYC' && !(u.kycStatus === KycStatus.UNVERIFIED && u.kycLastDecision === 'REJECTED')) return false;
    if (userFilter === 'SUSPENDED' && u.status !== UserStatus.SUSPENDED) return false;

    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.country ?? '').toLowerCase().includes(q) ||
      (u.phoneNumber ?? '').toLowerCase().includes(q)
    );
  });

  const filteredDiceBoards = mergedDiceBoards.filter((b) => {
    if (diceTierFilter !== 'ALL' && b.tierId !== diceTierFilter) return false;
    if (dicePhaseFilter !== 'ALL' && b.phase !== dicePhaseFilter) return false;

    const activeNow = isBoardActive(b);
    const hasPast = b.matchHistory.length > 0 || b.pastSideBetReports.length > 0;
    if (diceViewMode === 'ACTIVE' && !activeNow && dicePhaseFilter !== GamePhase.WAITING_FOR_PLAYERS) {
      return false;
    }
    if (diceViewMode === 'PAST' && !hasPast) {
      return false;
    }

    const q = diceSearch.trim().toLowerCase();
    if (!q) return true;
    const matchText =
      b.tableLabel.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      `#${b.matchCounter}`.includes(q);
    if (matchText) return true;
    if (
      b.seats.some((s) => s.username.toLowerCase().includes(q)) ||
      (b.activeSideBetRound?.bets.some((sb) => sb.username.toLowerCase().includes(q)) ?? false)
    ) {
      return true;
    }
    if (diceViewMode !== 'ACTIVE') {
      if (
        b.matchHistory.some(
          (m) => m.winnerUsername.toLowerCase().includes(q) || `#${m.matchNumber}`.includes(q)
        ) ||
        b.pastSideBetReports.some((rep) =>
          rep.winners.some((w) => w.username.toLowerCase().includes(q))
        )
      ) {
        return true;
      }
    }
    return false;
  });

  const visiblePendingPayments = pendingPayments.filter((p) => {
    if (paymentKindFilter !== 'ALL' && p.kind !== paymentKindFilter) return false;
    return true;
  });

  const processedPayments = mergedPayments
    .filter((p) => {
      if (p.status === ApprovalStatus.PENDING) return false;
      if (paymentKindFilter !== 'ALL' && p.kind !== paymentKindFilter) return false;
      return true;
    })
    .sort((a, b) => (b.reviewedAt ?? b.createdAt) - (a.reviewedAt ?? a.createdAt));

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (historyCategoryFilter === 'DEPOSIT' && !log.action.includes('DEPOSIT')) return false;
    if (historyCategoryFilter === 'WITHDRAWAL' && !log.action.includes('WITHDRAWAL')) return false;
    if (historyCategoryFilter === 'KYC' && !log.action.includes('KYC')) return false;
    if (
      historyCategoryFilter === 'SYSTEM' &&
      (log.action.includes('DEPOSIT') || log.action.includes('WITHDRAWAL') || log.action.includes('KYC'))
    ) {
      return false;
    }
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      log.action.toLowerCase().includes(q) ||
      log.target.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.adminUsername.toLowerCase().includes(q)
    );
  });

  const visibleTickets = tickets.filter((t) => {
    if (ticketFilter !== 'ALL' && t.status !== ticketFilter) return false;
    return true;
  });

  const inspectedUser = inspectedUserId
    ? mergedUsers.find((u) => u.id === inspectedUserId) ?? null
    : null;

  const inspectedUserPayments = inspectedUser
    ? mergedPayments.filter((p) => p.userId === inspectedUser.id)
    : [];

  const inspectedUserBets = useMemo(() => {
    if (!inspectedUser) return [];
    const list: {
      id: string;
      channel: 'DICE MAIN' | 'DICE SIDE-BET';
      title: string;
      selection: string;
      stake: number;
      matched: number;
      status: string;
      payout: number;
      fee: number;
      timestamp: number;
    }[] = [];

    for (const b of mergedDiceBoards) {
      for (const s of b.seats) {
        if (s.userId === inspectedUser.id) {
          list.push({
            id: `seat_${b.id}_${s.seatIndex}_${s.joinedAt}`,
            channel: 'DICE MAIN',
            title: b.tableLabel,
            selection: `Seat #${s.seatIndex + 1}${s.rollValue ? ` (Rolled ${s.rollValue})` : ''}`,
            stake: s.lockedBet,
            matched: s.lockedBet,
            status: b.phase,
            payout: 0,
            fee: 0,
            timestamp: s.joinedAt,
          });
        }
      }
      for (const sb of b.activeSideBetRound?.bets ?? []) {
        if (sb.userId === inspectedUser.id) {
          list.push({
            id: sb.id,
            channel: 'DICE SIDE-BET',
            title: `${b.tableLabel} · R#${b.activeSideBetRound?.roundNumber ?? '-'}`,
            selection: `${sb.category} -> ${sb.option}`,
            stake: sb.originalStake,
            matched: sb.matchedStake,
            status: sb.status,
            payout: sb.payout,
            fee: sb.feeDeducted,
            timestamp: sb.placedAt,
          });
        }
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [inspectedUser, mergedDiceBoards]);

  const showSuccess = (msg: string) => {
    setStatusNote(msg);
    window.setTimeout(() => {
      setStatusNote((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // CSV Exporters
  const handleExportUsersCsv = () => {
    downloadCsvFile(
      `betspot_users_${new Date().toISOString().slice(0, 10)}.csv`,
      ['UserID', 'Username', 'DisplayName', 'Email', 'Role', 'Status', 'KYC', 'Country', 'AvailableTKN', 'HeldTKN'],
      filteredUsers.map((u) => [
        u.id,
        u.username,
        u.displayName,
        u.email,
        u.role,
        u.status,
        u.kycStatus ?? 'UNVERIFIED',
        u.country ?? '',
        u.availableBalance,
        u.heldBalance,
      ])
    );
    showSuccess(`Exported ${filteredUsers.length} users to CSV.`);
  };

  const handleExportDiceCsv = () => {
    const rows: unknown[][] = [];
    for (const b of filteredDiceBoards) {
      for (const s of b.seats) {
        rows.push([
          'MAIN_SEAT',
          b.id,
          b.tableLabel,
          b.phase,
          s.username,
          `Seat #${s.seatIndex + 1}`,
          s.lockedBet,
          s.lockedBet,
          s.rollValue ?? 'PENDING',
          0,
          new Date(s.joinedAt).toISOString(),
        ]);
      }
      for (const sb of b.activeSideBetRound?.bets ?? []) {
        rows.push([
          'SIDE_BET',
          b.id,
          b.tableLabel,
          sb.status,
          sb.username,
          `${sb.category}:${sb.option}`,
          sb.originalStake,
          sb.matchedStake,
          sb.payout,
          sb.feeDeducted,
          new Date(sb.placedAt).toISOString(),
        ]);
      }
    }
    downloadCsvFile(
      `betspot_dice_bets_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Type', 'BoardID', 'Room', 'PhaseOrStatus', 'Player', 'Selection', 'StakeTKN', 'MatchedTKN', 'RollOrPayout', 'FeeTKN', 'Timestamp'],
      rows
    );
    showSuccess(`Exported ${rows.length} dice seat/side-bet rows to CSV.`);
  };

  const handleExportPaymentsCsv = () => {
    downloadCsvFile(
      `betspot_payments_${new Date().toISOString().slice(0, 10)}.csv`,
      ['RequestID', 'Username', 'Kind', 'Method', 'Tokens', 'USD', 'Reference', 'Destination', 'Status', 'Note', 'CreatedAt'],
      mergedPayments.map((p) => [
        p.id,
        p.username,
        p.kind,
        p.method,
        p.tokenAmount,
        p.usdEquivalent.toFixed(2),
        p.referenceId,
        p.destinationOrBankDetails,
        p.status,
        p.adminNote ?? '',
        new Date(p.createdAt).toISOString(),
      ])
    );
    showSuccess(`Exported ${mergedPayments.length} payment records to CSV.`);
  };

  const filteredIncomeRecords = mergedIncomeRecords.filter((rec) => {
    if (incomeChannelFilter !== 'ALL' && rec.source !== incomeChannelFilter) return false;
    if (incomeScopeFilter === 'HUMAN_ONLY' && !rec.includesHumanParticipant) return false;
    const q = incomeSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      rec.username.toLowerCase().includes(q) ||
      rec.roomOrMatchLabel.toLowerCase().includes(q) ||
      rec.description.toLowerCase().includes(q) ||
      rec.source.toLowerCase().includes(q)
    );
  });

  const handleExportIncomeCsv = () => {
    downloadCsvFile(
      `betspot_platform_income_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'RecordID',
        'Channel',
        'RoomOrMatch',
        'WinnerOrPayer',
        'AccountType',
        'HumanInvolved',
        'GrossAmountTKN',
        'FeeRatePercent',
        'PlatformFeeTKN',
        'USD',
        'Description',
        'CreatedAt',
      ],
      filteredIncomeRecords.map((r) => [
        r.id,
        r.source,
        r.roomOrMatchLabel,
        r.username,
        'PLAYER',
        r.includesHumanParticipant ? 'YES' : 'NO',
        r.grossAmountTokens,
        `${(r.feeRate * 100).toFixed(0)}%`,
        r.feeAmountTokens,
        r.usdEquivalent.toFixed(2),
        r.description,
        new Date(r.createdAt).toISOString(),
      ])
    );
    showSuccess(`Exported ${filteredIncomeRecords.length} platform income records to CSV.`);
  };

  // Actions
  const startEditingUser = (u: AdminServerUser) => {
    setEditingUserId(u.id);
    setEditDisplayName(u.displayName);
    setEditEmail(u.email);
    setEditRole(u.role === 'HIGH_ROLLER' ? UserRole.HIGH_ROLLER : UserRole.PLAYER);
    setEditBalance(String(u.availableBalance));
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setActionBusy(true);
    try {
      const res = await adminAuthClient.updateUser(editingUserId, {
        displayName: editDisplayName,
        email: editEmail,
        role: editRole,
        balanceOverride: Number(editBalance),
      });
      setServerStore(res.store);
      setEditingUserId(null);
      showSuccess('User account updated on server.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update user.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const res = await adminAuthClient.createUser({
        username: newUsername,
        displayName: newDisplayName,
        email: newEmail,
        role: newRole,
        initialBalance: Number(newBalance) || 0,
      });
      setServerStore(res.store);
      setNewUsername('');
      setNewDisplayName('');
      setNewEmail('');
      showSuccess('New player account created on server.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReviewKyc = async (userId: string, approve: boolean, customNote?: string) => {
    setActionBusy(true);
    const note =
      (customNote ?? kycNoteByUser[userId] ?? '').trim() ||
      (approve
        ? 'Identity document verified & approved by Admin'
        : 'KYC verification rejected — please submit a clear National ID or Passport image');
    try {
      const targetUser = mergedUsers.find((u) => u.id === userId);
      const res = await adminAuthClient.reviewKyc(
        userId,
        approve,
        note,
        targetUser
          ? {
              username: targetUser.username,
              displayName: targetUser.displayName,
              email: targetUser.email,
            }
          : undefined
      );
      setServerStore(res.store);
      setKycNoteByUser((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      showSuccess(
        `KYC ${approve ? 'approved' : 'rejected'} for @${targetUser?.username ?? userId} — removed from pending queue & logged to History.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update KYC status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResetAllPlayers = async () => {
    setActionBusy(true);
    try {
      const res = await adminAuthClient.resetAllPlayersAndTelemetry();
      setServerStore(res.store);
      setConfirmResetAll(false);
      setInspectedUserId(null);
      showSuccess('All player accounts & bots reset on server. Only Admin account remains.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to reset player accounts.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleSuspend = async (u: AdminServerUser) => {
    setActionBusy(true);
    const nextStatus = u.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
    try {
      const res = await adminAuthClient.updateUser(u.id, { status: nextStatus });
      setServerStore(res.store);
      showSuccess(`@${u.username} is now ${nextStatus}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to toggle user status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    setActionBusy(true);
    try {
      const res = await adminAuthClient.removeUser(userId);
      setServerStore(res.store);
      if (inspectedUserId === userId) {
        setInspectedUserId(null);
      }
      showSuccess('User account removed.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Cannot remove user.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpUserId) {
      onError('Select a target account first.');
      return;
    }
    setActionBusy(true);
    try {
      const amount = Number(topUpAmount);
      const res = await adminAuthClient.manualTopUp(topUpUserId, {
        amountTokens: amount,
        fundingSource: topUpSource,
        referenceCode: topUpRef,
        reason: topUpReason,
      });
      setServerStore(res.store);
      showSuccess(`Manual top-up (+${amount.toLocaleString()} TKN) executed on server.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Top-up failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReviewPayment = async (req: AdminServerPayment, approve: boolean, overrideNote?: string) => {
    setActionBusy(true);
    const note =
      overrideNote?.trim() ||
      (reviewNoteByPayment[req.id] ?? '').trim() ||
      (approve ? 'Verified & Approved by Admin' : 'Verification failed / Rejected by Admin');
    try {
      const res = await adminAuthClient.reviewPayment(req.id, approve, note);
      setServerStore(res.store);
      setReviewNoteByPayment((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
      showSuccess(
        `${req.kind} ${req.referenceId} ${approve ? 'Approved' : 'Rejected'} — removed from pending queue, logged to History & account updated.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to review payment.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelDiceMatch = async (boardId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await adminAuthClient.cancelDiceMatch(boardId);
      setServerStore(res.store);
      showSuccess(`Match cancelled and all active bets refunded on ${boardId}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to cancel dice match.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSuspendSideBet = async (boardId: string, betId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await adminAuthClient.suspendSideBet(boardId, betId);
      setServerStore(res.store);
      showSuccess('Side-bet moderation status updated.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update side-bet status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelSideBet = async (boardId: string, betId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await adminAuthClient.cancelSideBet(boardId, betId);
      setServerStore(res.store);
      showSuccess('Side-bet cancelled and stake refunded.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to cancel side-bet.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateTicket = async (ticket: AdminServerTicket) => {
    setActionBusy(true);
    try {
      const nextStatus = ticketStatusDraft[ticket.id] ?? ticket.status;
      const nextReply = ticketReplyDraft[ticket.id] ?? ticket.adminReply ?? '';
      const res = await adminAuthClient.updateSupportTicket(ticket.id, nextStatus, nextReply);
      setServerStore(res.store);
      showSuccess(`Ticket ${ticket.id} updated (${nextStatus}).`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update support ticket.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveContactConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setContactSaving(true);
    setContactFeedback(null);
    try {
      const cleanEmail = supportEmailDraft.trim();
      const cleanTg = telegramUsernameDraft.trim().replace(/^@/, '');
      const cleanLink =
        telegramLinkDraft.trim() || `https://t.me/${cleanTg || 'BetSpotSupport'}`;

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setContactFeedback({ ok: false, msg: 'Please provide a valid support email address.' });
        setContactSaving(false);
        return;
      }
      if (!cleanTg) {
        setContactFeedback({ ok: false, msg: 'Please provide a valid Telegram username or handle.' });
        setContactSaving(false);
        return;
      }

      const res = await adminAuthClient.updateContactConfig({
        supportEmail: cleanEmail,
        telegramUsername: cleanTg,
        telegramLink: cleanLink,
      });
      setServerStore(res.store);
      void engine.fetchContactConfig();
      setContactConfigDirty(false);
      setContactFeedback({ ok: true, msg: 'Customer Care channels saved and live across the platform!' });
      showSuccess('Customer Care channels updated.');
      setTimeout(() => setContactFeedback(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update contact channels.';
      setContactFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setContactSaving(false);
    }
  };

  const handleUpdateAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPass(true);
    try {
      const updated = await adminAuthClient.changePassword({
        currentPassword: currentAdminPass,
        newUsername: newAdminUsername,
        newPassword: newAdminPass,
        confirmPassword: confirmAdminPass,
      });
      engine.activateAdminSession(updated);
      setCurrentAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
      setShowChangePassword(false);
      showSuccess('Admin credentials updated.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update Admin credentials.');
    } finally {
      setChangingPass(false);
    }
  };

  const handleToggleBotsEnabled = async () => {
    setActionBusy(true);
    try {
      const nextEnabled = !liveBotConfig.enabled;
      const res = await adminAuthClient.updateBotConfig({ enabled: nextEnabled });
      setServerStore(res.store);
      setBotDraft(res.config);
      setBotConfigDirty(false);
      engine.applyBotRuntime({ config: res.config, summary: res.summary });
      showSuccess(
        nextEnabled
          ? 'Automated Bot Matchmaker turned ON.'
          : 'Automated Bot Matchmaker turned OFF — only real players will play.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to toggle Bot status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveBotConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const res = await adminAuthClient.updateBotConfig(botDraft);
      setServerStore(res.store);
      setBotDraft(res.config);
      setBotConfigDirty(false);
      engine.applyBotRuntime({ config: res.config, summary: res.summary });
      showSuccess('Bot risk guardrails, timers & limits saved and applied live.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save Bot configuration.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdjustBotPool = async (action: 'TOPUP' | 'WITHDRAW' | 'SET' | 'BURN_SURPLUS') => {
    const amt = Math.round(Number(poolAdjustAmount));
    // TOPUP & WITHDRAW need a strictly positive amount; SET & BURN_SURPLUS allow 0+
    if ((action === 'TOPUP' || action === 'WITHDRAW') && (!amt || amt <= 0)) {
      onError('Enter a valid positive token amount.');
      return;
    }
    if ((action === 'SET' || action === 'BURN_SURPLUS') && (isNaN(amt) || amt < 0)) {
      onError('Enter a valid token amount (0 or above).');
      return;
    }
    setActionBusy(true);
    try {
      const res = await adminAuthClient.adjustBotPool(action, amt, poolAdjustNote);
      setServerStore(res.store);
      if (res.store.botConfig) {
        engine.applyBotRuntime({ config: res.store.botConfig, summary: res.summary });
      }
      setPoolAdjustNote('');
      const toastMap: Record<string, string> = {
        TOPUP: `Added +${amt.toLocaleString()} TKN to dedicated Bot Liquidity Pool.`,
        WITHDRAW: `Swept -${amt.toLocaleString()} TKN from Bot Liquidity Pool.`,
        SET: `Bot Liquidity Pool balance set to exactly ${amt.toLocaleString()} TKN.`,
        BURN_SURPLUS:
          amt > 0
            ? `Burned -${Math.min(liveBotSummary.poolBalanceTokens, amt).toLocaleString()} unbacked tokens from Bot Pool.`
            : `Burned all unbacked tokens from Bot Pool.`,
      };
      showSuccess(toastMap[action]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to adjust Bot Pool.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAckRiskAlert = async (alertId: string) => {
    setActionBusy(true);
    try {
      const res = await adminAuthClient.acknowledgeRiskAlert(alertId);
      setServerStore(res.store);
      showSuccess('Risk alert acknowledged and logged.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to acknowledge risk alert.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleWelcomeBonus = async () => {
    setActionBusy(true);
    try {
      const nextEnabled = !livePromoConfig.welcomeBonusEnabled;
      const res = await adminAuthClient.updatePromoConfig({ welcomeBonusEnabled: nextEnabled });
      setServerStore(res.store);
      setPromoDraft(res.config);
      setPromoConfigDirty(false);
      engine.applyPromoConfig(res.config);
      showSuccess(
        nextEnabled
          ? `New User Free Welcome Bonus (${res.config.welcomeBonusTokens} TKN) turned ON.`
          : 'New User Free Welcome Bonus turned OFF — new signups will start with 0 free tokens.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to toggle Welcome Bonus.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleReferralProgram = async () => {
    setActionBusy(true);
    try {
      const nextEnabled = !livePromoConfig.referralProgramEnabled;
      const res = await adminAuthClient.updatePromoConfig({ referralProgramEnabled: nextEnabled });
      setServerStore(res.store);
      setPromoDraft(res.config);
      setPromoConfigDirty(false);
      engine.applyPromoConfig(res.config);
      showSuccess(
        nextEnabled
          ? `Invite & Earn Referral Program (+${res.config.referralBonusTokens} TKN each) turned ON.`
          : 'Invite & Earn Referral Program turned OFF.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to toggle Referral Program.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSavePromoConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const res = await adminAuthClient.updatePromoConfig(promoDraft);
      setServerStore(res.store);
      setPromoDraft(res.config);
      setPromoConfigDirty(false);
      engine.applyPromoConfig(res.config);
      showSuccess('Free-token guardrails, caps, and referral rules saved & applied live.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save Promo configuration.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdjustPromoBudget = async (action: 'TOPUP' | 'REDUCE') => {
    const amt = Math.round(Number(promoBudgetAmount));
    if (!amt || amt <= 0) {
      onError('Enter a valid positive token amount for the promo budget reserve.');
      return;
    }
    setActionBusy(true);
    try {
      const res = await adminAuthClient.adjustPromoBudget(action, amt, promoBudgetNote);
      setServerStore(res.store);
      setPromoBudgetNote('');
      showSuccess(
        action === 'TOPUP'
          ? `Added +${amt.toLocaleString()} TKN to Free-Token Mint Budget Reserve.`
          : `Reduced Free-Token Mint Budget Reserve by -${amt.toLocaleString()} TKN.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to adjust Promo Budget.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevokeUserPromo = async (u: AdminServerUser) => {
    setActionBusy(true);
    try {
      const raw = promoRevokeAmountByUser[u.id];
      const parsedAmt = raw && Number(raw) > 0 ? Math.round(Number(raw)) : undefined;
      const reason =
        (promoNoteDraftByUser[u.id] ?? '').trim() ||
        'Admin revoked unbacked free/promo tokens';
      const res = await adminAuthClient.revokeUserPromoTokens(u.id, parsedAmt, reason);
      setServerStore(res.store);
      setPromoRevokeAmountByUser((prev) => {
        const next = { ...prev };
        delete next[u.id];
        return next;
      });
      showSuccess(
        res.revokedTokens > 0
          ? `Revoked & burned ${res.revokedTokens.toLocaleString()} unbacked free TKN from @${u.username}.`
          : `Cleared remaining promo liability for @${u.username} (0 available balance left to deduct).`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to revoke promo tokens.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveUserPromoNote = async (u: AdminServerUser) => {
    setActionBusy(true);
    try {
      const note = promoNoteDraftByUser[u.id] ?? u.promoAdminNote ?? '';
      const flag = promoFlagDraftByUser[u.id] ?? u.promoRiskFlag ?? 'NONE';
      const res = await adminAuthClient.updateUserPromoNote(u.id, note, flag);
      setServerStore(res.store);
      showSuccess(`Saved compliance note & risk flag (${flag}) for @${u.username}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save compliance note.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleExportPromoLedgerCsv = () => {
    downloadCsvFile(
      `betspot_promo_loss_ledger_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'EntryID',
        'Time',
        'Kind',
        'Account',
        'RelatedAccount',
        'Tokens',
        'RealLiabilityImpactTKN',
        'UnbackedCirculationAfter',
        'BudgetRemainingAfter',
        'Note',
      ],
      promoLedger.map((row) => [
        row.id,
        new Date(row.createdAt).toISOString(),
        row.kind,
        row.username,
        row.relatedUsername ?? '',
        row.tokenAmount,
        row.realLiabilityImpactTokens,
        row.unbackedCirculationAfter,
        row.budgetRemainingAfter,
        row.note,
      ])
    );
    showSuccess(`Exported ${promoLedger.length} free-token ledger rows to CSV.`);
  };

  const handleSaveEconomyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const res = await adminAuthClient.updateEconomyConfig({
        ...economyDraft,
        syncReferralMinDeposit: syncReferralOnEconomySave,
      });
      setServerStore(res.store);
      setEconomyDraft(res.config);
      setEconomyConfigDirty(false);
      engine.applyEconomyConfig(res.config);
      if (res.promoConfig) {
        setPromoDraft(res.promoConfig);
        setPromoConfigDirty(false);
        engine.applyPromoConfig(res.promoConfig);
      }
      const minDepTkn = Math.round(res.config.minDepositUsd * res.config.tokensPerUsd);
      const minWdTkn = Math.round(res.config.minWithdrawUsd * res.config.tokensPerUsd);
      showSuccess(
        `Saved & applied system-wide: 1 USD = ${res.config.tokensPerUsd.toLocaleString()} TKN · Min Bet ${res.config.minBetTokens.toLocaleString()} TKN · Min Deposit $${res.config.minDepositUsd.toFixed(2)} (${minDepTkn.toLocaleString()} TKN) · Min Withdraw $${res.config.minWithdrawUsd.toFixed(2)} (${minWdTkn.toLocaleString()} TKN).`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save Token Peg & Limits.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResetEconomyDefaults = async () => {
    setActionBusy(true);
    try {
      const res = await adminAuthClient.updateEconomyConfig({
        ...DEFAULT_ECONOMY_CONFIG,
        syncReferralMinDeposit: syncReferralOnEconomySave,
      });
      setServerStore(res.store);
      setEconomyDraft(res.config);
      setEconomyConfigDirty(false);
      engine.applyEconomyConfig(res.config);
      if (res.promoConfig) {
        setPromoDraft(res.promoConfig);
        setPromoConfigDirty(false);
        engine.applyPromoConfig(res.promoConfig);
      }
      showSuccess('Restored standard platform defaults (1 USD = 300 TKN · Min Bet 30 · Min Dep $1 · Min Withdraw $10).');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to reset defaults.');
    } finally {
      setActionBusy(false);
    }
  };

  const adminSession = engine.adminSession;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <Shield className="h-4 w-4" />
            <span>BetSpot Operations Console · @{adminSession?.username}</span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-50">
            Platform Control Center
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Full visibility across player wallets, KYC docs, live dice tiers, active bets, payments, and support.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshStore(false)}
            disabled={loadingStore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingStore ? 'animate-spin' : ''}`} />
            Sync Live Data
          </button>

          {!adminSession?.configuredViaEnv && adminSession?.authMethod !== 'google' && (
            <button
              type="button"
              onClick={() => setShowChangePassword((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-[#131A26] px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showChangePassword ? 'Hide Password Form' : 'Change Password'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void engine.logoutAdminSession();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5" />
            Lock Admin Session
          </button>
        </div>
      </div>

      {statusNote && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{statusNote}</span>
        </div>
      )}

      {showChangePassword && !adminSession?.configuredViaEnv && adminSession?.authMethod !== 'google' && (
        <form
          onSubmit={handleUpdateAdminCredentials}
          className="rounded-xl border border-amber-500/35 bg-[#131A26] p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-amber-300">
              Update Admin Portal Username &amp; Password
            </h2>
            <button
              type="button"
              onClick={() => setShowChangePassword(false)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Admin Username</label>
              <input
                type="text"
                required
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentAdminPass}
                onChange={(e) => setCurrentAdminPass(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">New Password (8+ chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newAdminPass}
                onChange={(e) => setNewAdminPass(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmAdminPass}
                onChange={(e) => setConfirmAdminPass(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={changingPass}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-[#2A0E07] hover:bg-amber-300 disabled:opacity-60 cursor-pointer"
          >
            {changingPass ? 'Updating...' : 'Save New Admin Password'}
          </button>
        </form>
      )}

      {/* Primary Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-[#131A26] p-1.5 w-fit">
        {(
          [
            { id: 'overview', label: 'Overview & KPIs', icon: Activity },
            {
              id: 'economy',
              label: `Token Peg & Limits (1 USD = ${liveEconomyConfig.tokensPerUsd.toLocaleString()} TKN)`,
              icon: Sliders,
            },
            { id: 'income', label: `Income & Fees (${totalHouseRevenue.toLocaleString()} TKN)`, icon: DiceTokenIcon },
            {
              id: 'bots',
              label: `Bots & Risk Guard (${liveBotConfig.enabled ? 'ON' : 'OFF'}${unackRiskAlertsCount > 0 ? ` · ${unackRiskAlertsCount} Alerts` : ''})`,
              icon: Bot,
            },
            {
              id: 'promos',
              label: `Free Tokens & Referrals (${livePromoConfig.welcomeBonusEnabled ? `${livePromoConfig.welcomeBonusTokens} FREE ON` : 'FREE OFF'})`,
              icon: Gift,
            },
            {
              id: 'users',
              label: `Users & KYC (${pendingKycUsers.length > 0 ? `${pendingKycUsers.length} Pending` : mergedUsers.length})`,
              icon: Users,
            },
            { id: 'dice', label: `Dice Matches & Bets (${activeDiceBoardsCount} Active)`, icon: Dices },
            { id: 'payments', label: `Payments & Top-Ups (${pendingPayments.length})`, icon: Wallet },
            { id: 'history', label: `History & Audit Log (${auditLogs.length})`, icon: ClipboardList },
            { id: 'tickets', label: `Support Tickets (${openTicketsCount})`, icon: Headphones },
            { id: 'database', label: 'Database & Schema (Firestore)', icon: Database },
          ] as { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 0: EXECUTIVE OVERVIEW, REVENUE & RISK ALERTS */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Registered Players</span>
                <Users className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-50">
                {mergedUsers.length}
              </div>
              <div className="text-[11px] text-amber-300">
                {pendingKycUsers.length} pending KYC · {suspendedUsers.length} suspended
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Platform Income (Fees Earned)</span>
                <DiceTokenIcon size="sm" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono-tabular text-2xl font-bold text-amber-300">
                  {totalHouseRevenue.toLocaleString()} TKN
                </span>
                <span className="font-mono-tabular text-xs font-semibold text-emerald-400">
                  {TokenEconomy.formatUsd(totalHouseRevenue)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 font-mono-tabular">
                <span>
                  Dice: {diceMainFees.toLocaleString()} · Side: {diceSideBetFees.toLocaleString()} · Entry:{' '}
                  {diceEntryFees.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setSubTab('income')}
                  className="font-sans text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  Open Ledger →
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Match Exposure</span>
                <Activity className="h-4 w-4 text-sky-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-sky-300">
                {totalActiveExposure.toLocaleString()} TKN
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular">
                {totalOpenBetsCount} active dice seats/bets · Pots {activeDicePotExposure.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/35 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>💰 Real Money Tokens</span>
                <Wallet className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-emerald-400">
                {totalRealDepositedTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular">
                {TokenEconomy.formatUsd(totalRealDepositedTokens)} deposited · {totalRealWithdrawnTokens.toLocaleString()} withdrawn
              </div>
            </div>

            <div className="rounded-xl border border-orange-500/35 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>🎭 Fake / Bonus Tokens</span>
                <Gift className="h-4 w-4 text-orange-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-orange-400">
                {totalFakeTokensInCirculation.toLocaleString()} TKN
              </div>
              <div className="text-[11px] text-orange-300/70 font-mono-tabular">
                Active in wallets · Bot Pool {liveBotSummary.poolBalanceTokens.toLocaleString()} · Promo Reserve {livePromoSummary.budgetPoolTokens.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Pending Payments</span>
                <Wallet className="h-4 w-4 text-amber-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-50">
                {pendingPayments.length}
              </div>
              <div className="text-[11px] text-slate-400">
                {mergedPayments.length} total deposit/withdrawal requests
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Open Support Tickets</span>
                <Headphones className="h-4 w-4 text-sky-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-50">
                {openTicketsCount}
              </div>
              <div className="text-[11px] text-slate-400">
                {tickets.length} total inquiries logged
              </div>
            </div>
          </div>

          {/* Risk & Compliance Alerts */}
          <div className="rounded-xl border border-amber-500/25 bg-[#131A26] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Risk &amp; Compliance Queue
                </h2>
              </div>
              <span className="text-xs text-slate-400">Real-time operational checks</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setUserFilter('PENDING_KYC');
                  setSubTab('users');
                }}
                className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-left hover:border-amber-500/40 cursor-pointer"
              >
                <div className="font-semibold text-amber-300">
                  KYC Verification Backlog ({pendingKycUsers.length})
                </div>
                <div className="mt-1 text-slate-400">
                  {pendingKycUsers.length > 0
                    ? `Pending review for ${pendingKycUsers.map((u) => `@${u.username}`).slice(0, 3).join(', ')}`
                    : 'All submitted KYC documents are reviewed.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubTab('payments');
                }}
                className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-left hover:border-amber-500/40 cursor-pointer"
              >
                <div className="font-semibold text-emerald-300">
                  Treasury Approvals ({pendingPayments.length})
                </div>
                <div className="mt-1 text-slate-400">
                  {pendingPayments.length > 0
                    ? `${pendingPayments
                        .reduce((s, p) => s + p.tokenAmount, 0)
                        .toLocaleString()} TKN awaiting verification`
                    : 'No pending deposits or withdrawals right now.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('dice')}
                className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-left hover:border-amber-500/40 cursor-pointer"
              >
                <div className="font-semibold text-sky-300">
                  Live Dice Exposure Monitor ({totalOpenBetsCount} active)
                </div>
                <div className="mt-1 text-slate-400">
                  Dice Pots {activeDicePotExposure.toLocaleString()} TKN · Side-Bets {activeSideBetExposure.toLocaleString()} TKN
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('bots')}
                className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-left hover:border-amber-500/40 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 font-semibold text-emerald-300">
                  <span>Bot Guard ({liveBotConfig.enabled ? 'ON' : 'OFF'})</span>
                  {unackRiskAlertsCount > 0 && (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                      {unackRiskAlertsCount} Alerts
                    </span>
                  )}
                </div>
                <div className="mt-1 text-slate-400">
                  Pool {liveBotSummary.poolBalanceTokens.toLocaleString()} TKN · Wait {liveBotConfig.triggerWaitSeconds}s
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('promos')}
                className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-left hover:border-amber-500/40 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 font-semibold text-amber-300">
                  <span>Free Bonus ({livePromoConfig.welcomeBonusEnabled ? 'ON' : 'OFF'})</span>
                  {livePromoSummary.sharedIpFlaggedCount > 0 && (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                      {livePromoSummary.sharedIpFlaggedCount} Flagged
                    </span>
                  )}
                </div>
                <div className="mt-1 text-slate-400">
                  Unbacked {livePromoSummary.unbackedCirculationTokens.toLocaleString()} · Loss{' '}
                  {(
                    livePromoSummary.systemLossToBotPoolTokens +
                    livePromoSummary.realWithdrawalLeakageTokens
                  ).toLocaleString()}{' '}
                  TKN
                </div>
              </button>
            </div>
          </div>

          {/* Live System Token Peg & Platform Limits Quick Strip */}
          <div className="rounded-xl border border-emerald-500/30 bg-[#131A26] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <div className="text-[11px] text-slate-400">Fixed Token Peg</div>
                <div className="font-mono-tabular text-sm font-bold text-emerald-300">
                  1 USD = {liveEconomyConfig.tokensPerUsd.toLocaleString()} TKN
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Minimum Bet</div>
                <div className="font-mono-tabular text-sm font-bold text-amber-300">
                  {liveEconomyConfig.minBetTokens.toLocaleString()} TKN
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Minimum Deposit</div>
                <div className="font-mono-tabular text-sm font-bold text-slate-100">
                  ${liveEconomyConfig.minDepositUsd.toFixed(2)} ({Math.round(liveEconomyConfig.minDepositUsd * liveEconomyConfig.tokensPerUsd).toLocaleString()} TKN)
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Minimum Withdrawal</div>
                <div className="font-mono-tabular text-sm font-bold text-slate-100">
                  ${liveEconomyConfig.minWithdrawUsd.toFixed(2)} ({Math.round(liveEconomyConfig.minWithdrawUsd * liveEconomyConfig.tokensPerUsd).toLocaleString()} TKN)
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSubTab('economy')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
            >
              <Sliders className="h-3.5 w-3.5" />
              Edit Token Peg &amp; Limits
            </button>
          </div>

          {/* UNIFIED FAKE TOKEN & LIQUIDITY POOL COMMAND CENTER */}
          <div className="rounded-xl border border-amber-500/40 bg-[#131A26] p-5 space-y-5 shadow-lg">
            {/* Header with Master Switches */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <h2 className="font-display text-base font-bold text-slate-100">
                    Unified Fake Token &amp; Liquidity Pool Command Center
                  </h2>
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Central Fake Token Hub
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Monitor and control all unbacked promotional tokens in one place: 100 bots bankroll, welcome bonus gifts, referral rewards, and inflation guardrails.
                </p>
              </div>

              {/* Master Toggles */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleToggleWelcomeBonus()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                    livePromoConfig.welcomeBonusEnabled
                      ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      : 'border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  Welcome Gift ({livePromoConfig.welcomeBonusTokens} TKN): {livePromoConfig.welcomeBonusEnabled ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleToggleReferralProgram()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                    livePromoConfig.referralProgramEnabled
                      ? 'border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                      : 'border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  Referrals ({livePromoConfig.referralBonusTokens} TKN): {livePromoConfig.referralProgramEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Real vs Fake Token Balance Sheet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Real Money Capital */}
              <div className="rounded-lg border border-emerald-500/30 bg-[#0B0F17] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-emerald-400">💰 Real Capital Inflow</span>
                  <Wallet className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="font-mono-tabular text-xl font-bold text-emerald-300">
                  {totalRealDepositedTokens.toLocaleString()} TKN
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  {TokenEconomy.formatUsd(totalRealDepositedTokens)} verified deposits
                </div>
                <div className="text-[10px] text-emerald-400/80 pt-1 border-t border-slate-800">
                  Withdrawn: {totalRealWithdrawnTokens.toLocaleString()} TKN ({TokenEconomy.formatUsd(totalRealWithdrawnTokens)})
                </div>
              </div>

              {/* Card 2: 100 Bots Bankroll */}
              <div className="rounded-lg border border-amber-500/30 bg-[#0B0F17] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-amber-400">🤖 100 Bots Liquidity Pool</span>
                  <Bot className="h-4 w-4 text-amber-400" />
                </div>
                <div className="font-mono-tabular text-xl font-bold text-amber-300">
                  {liveBotSummary.poolBalanceTokens.toLocaleString()} TKN
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  ≈ {TokenEconomy.formatUsd(liveBotSummary.poolBalanceTokens)} · Isolated from user balances
                </div>
                <div className="text-[10px] text-amber-400/80 pt-1 border-t border-slate-800 font-mono-tabular">
                  1h Net PnL: {liveBotSummary.hourlyNetPnlTokens >= 0 ? `+${liveBotSummary.hourlyNetPnlTokens.toLocaleString()}` : liveBotSummary.hourlyNetPnlTokens.toLocaleString()} TKN
                </div>
              </div>

              {/* Card 3: Promo Mint Reserve */}
              <div className="rounded-lg border border-sky-500/30 bg-[#0B0F17] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-sky-400">🎁 Promo Mint Reserve</span>
                  <Gift className="h-4 w-4 text-sky-400" />
                </div>
                <div className="font-mono-tabular text-xl font-bold text-sky-300">
                  {livePromoSummary.budgetPoolTokens.toLocaleString()} TKN
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Remaining budget for welcome &amp; referral gifts
                </div>
                <div className="text-[10px] text-sky-400/80 pt-1 border-t border-slate-800 font-mono-tabular">
                  Minted: {livePromoSummary.totalMintedTokens.toLocaleString()} TKN (24h: {livePromoSummary.dailyMintedTokens.toLocaleString()})
                </div>
              </div>

              {/* Card 4: Active Fake Circulation & Safety */}
              <div className="rounded-lg border border-rose-500/30 bg-[#0B0F17] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-rose-300">🛡️ Unbacked Exposure</span>
                  <Shield className="h-4 w-4 text-rose-400" />
                </div>
                <div className="font-mono-tabular text-xl font-bold text-rose-300">
                  {totalFakeTokensInCirculation.toLocaleString()} TKN
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Active in human player wallets
                </div>
                <div className="text-[10px] text-rose-400/80 pt-1 border-t border-slate-800">
                  Golden Rule Active: Real deposit required to withdraw
                </div>
              </div>
            </div>

            {/* Quick Action Control Panels: Bot Pool & Promo Budget */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Bot Liquidity Pool Controls */}
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Bot className="h-4 w-4 text-amber-400" />
                    <span>Bot Liquidity Pool Controls</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-amber-300">
                    {liveBotSummary.poolBalanceTokens.toLocaleString()} TKN
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={poolAdjustAmount}
                      onChange={(e) => setPoolAdjustAmount(e.target.value)}
                      placeholder="Amount (TKN)"
                      className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-1.5 font-mono-tabular text-slate-100"
                    />
                  </div>

                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1">
                    {[5000, 10000, 15000, 25000, 50000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPoolAdjustAmount(String(preset))}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors cursor-pointer ${
                          Number(poolAdjustAmount) === preset
                            ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                            : 'border-slate-700 bg-[#131A26] text-slate-400 hover:border-amber-400/40 hover:text-amber-300'
                        }`}
                      >
                        {preset / 1000}k
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustBotPool('TOPUP')}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                    >
                      + Top Up
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustBotPool('WITHDRAW')}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-60 cursor-pointer"
                    >
                      − Sweep
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustBotPool('SET')}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 disabled:opacity-60 cursor-pointer"
                    >
                      ⚡ Set Exact
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustBotPool('BURN_SURPLUS')}
                      className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer"
                    >
                      🔥 Burn Extra
                    </button>
                  </div>
                </div>
              </div>

              {/* Promo Mint Budget Controls */}
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Gift className="h-4 w-4 text-sky-400" />
                    <span>Free Promo Mint Budget Controls</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-sky-300">
                    {livePromoSummary.budgetPoolTokens.toLocaleString()} TKN
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={promoBudgetAmount}
                      onChange={(e) => setPromoBudgetAmount(e.target.value)}
                      placeholder="Amount (TKN)"
                      className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-1.5 font-mono-tabular text-slate-100"
                    />
                  </div>

                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1">
                    {[5000, 10000, 20000, 50000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPromoBudgetAmount(String(preset))}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors cursor-pointer ${
                          Number(promoBudgetAmount) === preset
                            ? 'border-sky-400 bg-sky-400/20 text-sky-200'
                            : 'border-slate-700 bg-[#131A26] text-slate-400 hover:border-sky-400/40 hover:text-sky-300'
                        }`}
                      >
                        {preset / 1000}k
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustPromoBudget('TOPUP')}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                    >
                      + Add Promo Budget
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAdjustPromoBudget('REDUCE')}
                      className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer"
                    >
                      − Reduce Budget
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-400" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Server Admin Audit Trail
                </h2>
              </div>
              <span className="text-xs text-slate-400">Latest {auditLogs.length} actions</span>
            </div>

            {auditLogs.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No Admin audit actions recorded yet. Actions like KYC verification, payment approvals, top-ups, and ticket updates appear here automatically.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Operator</th>
                      <th className="px-3 py-2.5 font-medium">Action</th>
                      <th className="px-3 py-2.5 font-medium">Target</th>
                      <th className="px-3 py-2.5 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {auditLogs.slice(0, 30).map((log) => (
                      <tr key={log.id} className="h-10">
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-semibold text-amber-300">
                          @{log.adminUsername}
                        </td>
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-emerald-400">
                          {log.action}
                        </td>
                        <td className="px-3 py-2 text-slate-200">{log.target}</td>
                        <td className="px-3 py-2 text-slate-400">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 0A: SYSTEM-WIDE TOKEN PEG & PLATFORM LIMITS */}
      {subTab === 'economy' && (
        <div className="space-y-5">
          {/* Live Effective Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-emerald-500/40 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Active Token Peg</div>
              <div className="font-mono-tabular text-xl font-bold text-emerald-400">
                1 USD = {liveEconomyConfig.tokensPerUsd.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                LKR Ref: 1 USD = {liveEconomyConfig.lkrPerUsd.toLocaleString()} LKR
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Minimum Bet Limit</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {liveEconomyConfig.minBetTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                ${(liveEconomyConfig.minBetTokens / Math.max(1, liveEconomyConfig.tokensPerUsd)).toFixed(2)} USD · Dice, Side-Bet &amp; Bot Floor
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Minimum Deposit Limit</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-50">
                ${liveEconomyConfig.minDepositUsd.toFixed(2)} USD
              </div>
              <div className="text-[11px] font-mono-tabular text-emerald-300">
                = {Math.max(1, Math.round(liveEconomyConfig.minDepositUsd * liveEconomyConfig.tokensPerUsd)).toLocaleString()} TKN
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Minimum Withdrawal Limit</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-50">
                ${liveEconomyConfig.minWithdrawUsd.toFixed(2)} USD
              </div>
              <div className="text-[11px] font-mono-tabular text-amber-300">
                = {Math.max(1, Math.round(liveEconomyConfig.minWithdrawUsd * liveEconomyConfig.tokensPerUsd)).toLocaleString()} TKN
              </div>
            </div>
          </div>

          {/* System-Wide Economy Configuration Form */}
          <form
            onSubmit={handleSaveEconomyConfig}
            className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-emerald-400" />
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    Global Token Peg &amp; Platform Limits
                  </h2>
                  <p className="text-xs text-slate-400">
                    Changes saved here immediately update wallet conversions, deposits, withdrawals, dice &amp; side-bet minimums, rules, and server validation across the entire system.
                  </p>
                </div>
              </div>
              {liveEconomyConfig.updatedAt > 0 && (
                <span className="text-[11px] text-slate-400 font-mono-tabular">
                  Last saved {new Date(liveEconomyConfig.updatedAt).toLocaleString()}
                  {liveEconomyConfig.updatedBy ? ` by @${liveEconomyConfig.updatedBy}` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                <label className="block font-semibold text-emerald-300">
                  Fixed Token Peg (TKN per 1.00 USD)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  required
                  value={economyDraft.tokensPerUsd}
                  onChange={(e) => {
                    setEconomyConfigDirty(true);
                    setEconomyDraft((p) => ({
                      ...p,
                      tokensPerUsd: Math.max(1, Number(e.target.value) || 1),
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 font-mono-tabular text-base font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Preview: $1 = {economyDraft.tokensPerUsd.toLocaleString()} TKN · $10 = {(economyDraft.tokensPerUsd * 10).toLocaleString()} TKN
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                <label className="block font-semibold text-amber-300">
                  Minimum Bet Limit (Tokens)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  required
                  value={economyDraft.minBetTokens}
                  onChange={(e) => {
                    setEconomyConfigDirty(true);
                    setEconomyDraft((p) => ({
                      ...p,
                      minBetTokens: Math.max(1, Number(e.target.value) || 1),
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 font-mono-tabular text-base font-bold text-amber-300 focus:border-amber-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  USD Equiv: ${(economyDraft.minBetTokens / Math.max(1, economyDraft.tokensPerUsd)).toFixed(2)} · Sets Tier 1 Bronze &amp; Side-Bet floor
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                <label className="block font-semibold text-slate-200">
                  LKR Reference Rate (LKR per 1 USD)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={0.01}
                  required
                  value={economyDraft.lkrPerUsd}
                  onChange={(e) => {
                    setEconomyConfigDirty(true);
                    setEconomyDraft((p) => ({
                      ...p,
                      lkrPerUsd: Math.max(1, Number(e.target.value) || 1),
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 font-mono-tabular text-base font-bold text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Preview: 1,000 TKN ≈ LKR {Math.round((1000 / Math.max(1, economyDraft.tokensPerUsd)) * economyDraft.lkrPerUsd).toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                <label className="block font-semibold text-sky-300">
                  Minimum Deposit Limit (USD)
                </label>
                <input
                  type="number"
                  min={0.1}
                  max={10000}
                  step={0.1}
                  required
                  value={economyDraft.minDepositUsd}
                  onChange={(e) => {
                    setEconomyConfigDirty(true);
                    setEconomyDraft((p) => ({
                      ...p,
                      minDepositUsd: Math.max(0.1, Number(e.target.value) || 0.1),
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 font-mono-tabular text-base font-bold text-sky-300 focus:border-sky-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Auto-converted Token Min: <strong className="text-emerald-300">{Math.max(1, Math.round(economyDraft.minDepositUsd * economyDraft.tokensPerUsd)).toLocaleString()} TKN</strong>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                <label className="block font-semibold text-rose-300">
                  Minimum Withdrawal Limit (USD)
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={100000}
                  step={0.5}
                  required
                  value={economyDraft.minWithdrawUsd}
                  onChange={(e) => {
                    setEconomyConfigDirty(true);
                    setEconomyDraft((p) => ({
                      ...p,
                      minWithdrawUsd: Math.max(0.5, Number(e.target.value) || 0.5),
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 font-mono-tabular text-base font-bold text-rose-300 focus:border-rose-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Auto-converted Token Min: <strong className="text-amber-300">{Math.max(1, Math.round(economyDraft.minWithdrawUsd * economyDraft.tokensPerUsd)).toLocaleString()} TKN</strong>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/25 bg-[#0B0F17] p-4 flex flex-col justify-between space-y-2">
                <div className="font-semibold text-slate-200">Quick Sync Option</div>
                <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-300 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={syncReferralOnEconomySave}
                    onChange={(e) => setSyncReferralOnEconomySave(e.target.checked)}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span>
                    Also sync Referral Min Deposit &amp; Real Deposit Unlock threshold to match Min Deposit (
                    <strong className="text-emerald-300 font-mono-tabular">
                      {Math.max(1, Math.round(economyDraft.minDepositUsd * economyDraft.tokensPerUsd)).toLocaleString()} TKN
                    </strong>
                    )
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleResetEconomyDefaults()}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                Reset to Standard Defaults (300 TKN / 30 Bet / $1 Dep / $10 Wd)
              </button>

              <button
                type="submit"
                disabled={actionBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer shadow-md"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save &amp; Apply System-Wide
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 0B: PLATFORM INCOME & FEE LEDGER */}
      {subTab === 'income' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-amber-500/40 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Total Platform Income</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {totalHouseRevenue.toLocaleString()} TKN
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono-tabular text-emerald-400">
                <span>{TokenEconomy.formatUsd(totalHouseRevenue)}</span>
                <span className="text-slate-400">
                  Real Rooms: {resolvedIncome.humanInvolvedFeeTokens.toLocaleString()} TKN
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Dice Match Winner Fees</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-100">
                {diceMainFees.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {TokenEconomy.formatUsd(diceMainFees)} · 1%–30% tier fee
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Side-Bet Winner Fees</div>
              <div className="font-mono-tabular text-xl font-bold text-emerald-400">
                {diceSideBetFees.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {TokenEconomy.formatUsd(diceSideBetFees)} · P2P side wins
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Side-Bettor Entry Fees</div>
              <div className="font-mono-tabular text-xl font-bold text-sky-300">
                {diceEntryFees.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {TokenEconomy.formatUsd(diceEntryFees)} · Room watch fees
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={incomeChannelFilter}
                onChange={(e) => setIncomeChannelFilter(e.target.value as 'ALL' | PlatformIncomeSource)}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="ALL">All Fee Channels</option>
                <option value="DICE_MAIN_FEE">Dice Match Winner Fees</option>
                <option value="SIDE_BET_FEE">Side-Bet Winner Fees</option>
                <option value="SPECTATOR_ENTRY_FEE">Spectator Entry Fees</option>
              </select>

              <select
                value={incomeScopeFilter}
                onChange={(e) => setIncomeScopeFilter(e.target.value as 'ALL' | 'HUMAN_ONLY')}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="ALL">All Platform Income</option>
                <option value="HUMAN_ONLY">Verified Player Rooms</option>
              </select>

              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={incomeSearch}
                  onChange={(e) => setIncomeSearch(e.target.value)}
                  placeholder="Search winner, room, channel..."
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportIncomeCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export Income CSV
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Platform Fee &amp; Commission Ledger ({filteredIncomeRecords.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Every fee automatically deducted from match winners, side-bet winners, and side-bettor room entry fees.
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-amber-300">
                Filtered Sum:{' '}
                {filteredIncomeRecords.reduce((s, r) => s + r.feeAmountTokens, 0).toLocaleString()} TKN
              </span>
            </div>

            {filteredIncomeRecords.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-6 text-center text-xs text-slate-400">
                No platform fee deductions recorded for this filter yet. Once a Dice round, Side-Bet settlement, or Spectator entry fee completes, it appears here live.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Fee Source</th>
                      <th className="px-3 py-2.5 font-medium">Room / Match</th>
                      <th className="px-3 py-2.5 font-medium">Winner / Payer</th>
                      <th className="px-3 py-2.5 font-medium text-right">Gross Pot / Stake</th>
                      <th className="px-3 py-2.5 font-medium text-right">Fee %</th>
                      <th className="px-3 py-2.5 font-medium text-right">Platform Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredIncomeRecords.slice(0, 150).map((rec) => {
                      const sourceBadge =
                        rec.source === 'DICE_MAIN_FEE'
                          ? { label: 'Dice Winner Fee', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' }
                          : rec.source === 'SIDE_BET_FEE'
                          ? { label: 'Side-Bet Fee', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' }
                          : { label: 'Entry Fee', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-300' };

                      return (
                        <tr key={rec.id} className="h-10">
                          <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(rec.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${sourceBadge.cls}`}>
                              {sourceBadge.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-200 max-w-[240px] truncate" title={rec.description}>
                            {rec.roomOrMatchLabel}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-semibold text-slate-100">@{rec.username}</span>
                            {isBotAccount(rec.userId, rec.username, rec.isBotUser) ? (
                              <span className="ml-1.5 rounded border border-sky-500/35 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                                BOT ACCOUNT
                              </span>
                            ) : (
                              <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                REAL PLAYER
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular text-slate-300 whitespace-nowrap">
                            {rec.grossAmountTokens.toLocaleString()} TKN
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular text-slate-400 whitespace-nowrap">
                            {(rec.feeRate * 100).toFixed(0)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular whitespace-nowrap">
                            <span className="font-bold text-amber-300">
                              +{rec.feeAmountTokens.toLocaleString()} TKN
                            </span>
                            <span className="ml-1.5 text-[10px] text-emerald-400">
                              (${rec.usdEquivalent.toFixed(2)})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: USERS, PENDING KYC QUEUE & USER 360° INSPECTOR */}
      {subTab === 'users' && (
        <div className="space-y-6">
          {/* Pending KYC Verification Requests Queue (Removes entry immediately when Approved/Rejected & Logs to History) */}
          <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-amber-300">
                  Pending KYC Verification Queue ({pendingKycUsers.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Once approved or rejected, each KYC request is removed from this queue, logged to History, and updated on the player&apos;s account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryCategoryFilter('KYC');
                  setSubTab('history');
                }}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
              >
                View KYC Decision History →
              </button>
            </div>

            {pendingKycUsers.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No pending KYC verification requests. All submitted documents have been processed.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingKycUsers.map((u) => (
                  <div
                    key={`pending_kyc_${u.id}`}
                    className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          @{u.username} <span className="text-xs font-normal text-slate-400">({u.displayName})</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {u.email}
                          {u.country ? ` · ${u.country}` : ''}
                          {u.kycSubmittedAt ? ` · Submitted ${new Date(u.kycSubmittedAt).toLocaleString()}` : ''}
                        </div>
                      </div>
                      <span className="rounded border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono-tabular text-[10px] font-bold text-amber-300">
                        PENDING KYC
                      </span>
                    </div>

                    {u.kycDocumentDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            title: `KYC Document · @${u.username}`,
                            url: u.kycDocumentDataUrl!,
                          })
                        }
                        className="inline-flex items-center gap-2.5 rounded-lg border border-slate-700 bg-[#131A26] p-2 hover:border-amber-400/60 cursor-pointer"
                      >
                        <img
                          src={u.kycDocumentDataUrl}
                          alt={u.kycDocumentName || 'KYC ID'}
                          referrerPolicy="no-referrer"
                          className="h-14 w-20 rounded border border-slate-700 object-cover"
                        />
                        <div className="text-left">
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                            <Eye className="h-3.5 w-3.5" />
                            Inspect Full ID Photo
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            {u.kycDocumentName || 'identity_document.png'}
                          </div>
                        </div>
                      </button>
                    )}

                    <input
                      type="text"
                      value={kycNoteByUser[u.id] ?? ''}
                      onChange={(e) =>
                        setKycNoteByUser((prev) => ({
                          ...prev,
                          [u.id]: e.target.value,
                        }))
                      }
                      placeholder="Optional approval or rejection reason shown on user account..."
                      className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleReviewKyc(u.id, true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve KYC
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleReviewKyc(u.id, false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject KYC
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Player Directory &amp; KYC Status ({filteredUsers.length})
                </h2>
                <p className="text-[11px] text-slate-400">
                  Click &ldquo;Inspect 360°&rdquo; on any player to view full wallet ledger, payouts, and every placed bet.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mergedUsers.length > 0 && (
                  confirmResetAll ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-1 text-[11px]">
                      <span className="text-rose-200 font-semibold">Wipe all players?</span>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleResetAllPlayers()}
                        className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-500 cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetAll(false)}
                        className="text-slate-300 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetAll(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove All Players
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={handleExportUsersCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] p-1 text-[11px]">
                {(
                  [
                    { id: 'ALL', label: `All (${mergedUsers.length})` },
                    { id: 'PENDING_KYC', label: `Pending KYC (${pendingKycUsers.length})` },
                    {
                      id: 'VERIFIED',
                      label: `Verified (${mergedUsers.filter((u) => u.kycStatus === KycStatus.VERIFIED).length})`,
                    },
                    {
                      id: 'REJECTED_KYC',
                      label: `Rejected KYC (${mergedUsers.filter((u) => u.kycStatus === KycStatus.UNVERIFIED && u.kycLastDecision === 'REJECTED').length})`,
                    },
                    { id: 'SUSPENDED', label: `Suspended (${suspendedUsers.length})` },
                  ] as { id: UserFilterMode; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUserFilter(f.id)}
                    className={`rounded px-2.5 py-1 cursor-pointer ${
                      userFilter === f.id
                        ? 'bg-slate-800 text-amber-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search username, email, phone..."
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Role &amp; Country</th>
                    <th className="px-3 py-2.5 font-medium text-right">Available / Held</th>
                    <th className="px-3 py-2.5 font-medium">KYC</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                        No registered player accounts yet.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isRejectedKyc = u.kycStatus === KycStatus.UNVERIFIED && u.kycLastDecision === 'REJECTED';
                      return (
                      <tr key={u.id} className="h-12 hover:bg-slate-900/40">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-100">@{u.username}</div>
                          <div className="text-[11px] text-slate-400">
                            {u.email}
                            {u.phoneNumber ? ` · ${u.phoneNumber}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <div>{u.role}</div>
                          {u.country && <div className="text-[11px] text-slate-400">{u.country}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular">
                          <div className="text-emerald-400 font-semibold">
                            {u.availableBalance.toLocaleString()} TKN
                          </div>
                          {u.heldBalance > 0 && (
                            <div className="text-[10px] text-amber-300">
                              Held: {u.heldBalance.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <span
                              className={`font-mono-tabular text-[11px] font-semibold ${
                                u.kycStatus === KycStatus.VERIFIED
                                  ? 'text-emerald-400'
                                  : u.kycStatus === KycStatus.PENDING
                                  ? 'text-amber-300'
                                  : isRejectedKyc
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {isRejectedKyc ? 'REJECTED' : u.kycStatus ?? KycStatus.UNVERIFIED}
                            </span>
                            {u.kycReviewNote && u.kycStatus !== KycStatus.PENDING && (
                              <div className="text-[10px] text-slate-400 max-w-[200px] truncate" title={u.kycReviewNote}>
                                {u.kycReviewNote}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`font-mono-tabular text-[11px] font-semibold ${
                              u.status === UserStatus.ACTIVE ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectedUserId(u.id);
                                setUserModalTab('profile');
                              }}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                            >
                              <UserCheck className="h-3 w-3" />
                              360°
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditingUser(u)}
                              title="Edit User"
                              className="rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleToggleSuspend(u)}
                              className="rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-slate-800 cursor-pointer"
                            >
                              {u.status === UserStatus.ACTIVE ? 'Suspend' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleRemoveUser(u.id)}
                              title="Remove User"
                              className="rounded border border-rose-500/30 p-1.5 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {editingUserId && (
              <form
                onSubmit={handleSaveEditUser}
                className="rounded-lg border border-emerald-500/40 bg-[#0B0F17] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400">Edit User Profile</span>
                  <button
                    type="button"
                    onClick={() => setEditingUserId(null)}
                    className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Display Name"
                    className="rounded border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs text-slate-100"
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs text-slate-100"
                  />
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="rounded border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs text-slate-100"
                  >
                    <option value={UserRole.PLAYER}>PLAYER</option>
                    <option value={UserRole.HIGH_ROLLER}>HIGH_ROLLER</option>
                  </select>
                  <input
                    type="number"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    placeholder="Available Balance (TKN)"
                    className="rounded border border-slate-700 bg-[#131A26] px-3 py-1.5 font-mono-tabular text-xs text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  Save User Changes
                </button>
              </form>
            )}
          </div>

          <form
            onSubmit={handleAddUser}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-base font-semibold text-slate-100">Add New User</h2>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. Ruwan_LK"
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="player@betspot.com"
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
                >
                  <option value={UserRole.PLAYER}>PLAYER</option>
                  <option value={UserRole.HIGH_ROLLER}>HIGH_ROLLER</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Initial Tokens</label>
                <input
                  type="number"
                  min={0}
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-slate-100"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={actionBusy}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              Create Account
            </button>
          </form>
          </div>
        </div>
      )}

      {/* TAB 2: DICE MATCHES & BETS EXPLORER (GROUPED BY TIER) */}
      {subTab === 'dice' && (
        <div className="space-y-5">
          {/* Filter Bar */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* View Scope Switcher: Active Only (default) vs Past/Old vs All */}
              <div className="inline-flex items-center rounded-lg border border-slate-700 bg-[#0B0F17] p-0.5">
                {(
                  [
                    { id: 'ACTIVE', label: 'Active Matches & Bets' },
                    { id: 'PAST', label: 'Past Matches & Old Bets' },
                    { id: 'ALL', label: 'All (Active + Past)' },
                  ] as { id: DiceViewMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setDiceViewMode(mode.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                      diceViewMode === mode.id
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <select
                value={diceTierFilter}
                onChange={(e) => setDiceTierFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="ALL">All Tiers (1–6)</option>
                {TokenEconomy.TIERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>

              <select
                value={dicePhaseFilter}
                onChange={(e) => setDicePhaseFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="ALL">All Phases</option>
                <option value={GamePhase.LOBBY_COUNTDOWN}>Lobby Countdown</option>
                <option value={GamePhase.SIDE_BET_WINDOW}>Side-Bet Window</option>
                <option value={GamePhase.IN_PROGRESS_ROLL}>Rolling</option>
                <option value={GamePhase.TIE_BREAKER}>Tie Breaker</option>
                <option value={GamePhase.WAITING_FOR_PLAYERS}>Waiting</option>
                <option value={GamePhase.SETTLED}>Settled</option>
              </select>

              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={diceSearch}
                  onChange={(e) => setDiceSearch(e.target.value)}
                  placeholder="Filter room, match #, or player..."
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportDiceCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export Dice Bets CSV
              </button>
            </div>
          </div>

          {/* Tier-Grouped Matches & Bets */}
          <div className="space-y-5">
            {TokenEconomy.TIERS.filter(
              (t) => diceTierFilter === 'ALL' || t.id === diceTierFilter
            ).map((tier) => {
              const tierBoards = filteredDiceBoards
                .filter((b) => b.tierId === tier.id)
                .sort((a, b) => a.tableNumber - b.tableNumber);

              const tierAllBoards = mergedDiceBoards.filter((b) => b.tierId === tier.id);
              const tierActiveBoardsCount = tierAllBoards.filter(isBoardActive).length;
              const tierActiveMainBetsCount = tierAllBoards.reduce((s, b) => s + b.seats.length, 0);
              const tierActiveSideBetsCount = tierAllBoards.reduce(
                (s, b) =>
                  s +
                  (b.activeSideBetRound?.bets.filter(
                    (sb) => sb.status === 'ACTIVE' || sb.status === 'MATCHED' || sb.status === 'SUSPENDED'
                  ).length ?? 0),
                0
              );
              const tierActivePot = tierAllBoards.reduce((s, b) => s + b.lockedPot, 0);
              const tierPastMatchesCount = tierAllBoards.reduce((s, b) => s + b.matchHistory.length, 0);
              const tierPastSideRoundsCount = tierAllBoards.reduce((s, b) => s + b.pastSideBetReports.length, 0);

              return (
                <section
                  key={tier.id}
                  className="rounded-2xl border border-amber-500/25 bg-[#111824] p-4 sm:p-5 space-y-4"
                >
                  {/* Clear Tier Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-base font-bold text-amber-300">
                          {tier.label}
                        </h2>
                        <span className="rounded border border-slate-700 bg-[#0B0F17] px-2 py-0.5 font-mono-tabular text-[11px] text-slate-300">
                          {tier.minTokens.toLocaleString()}–{tier.maxTokens.toLocaleString()} TKN
                        </span>
                        <span className="rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-amber-300">
                          Winner Fee {(tier.feeRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-mono-tabular text-slate-400">
                        <span>
                          Active Matches:{' '}
                          <strong className="text-emerald-400">{tierActiveBoardsCount}</strong>
                        </span>
                        <span>
                          Active Seat Bets:{' '}
                          <strong className="text-slate-100">{tierActiveMainBetsCount}</strong>
                        </span>
                        <span>
                          Active Side Bets:{' '}
                          <strong className="text-sky-300">{tierActiveSideBetsCount}</strong>
                        </span>
                        <span>
                          Active Locked Pot:{' '}
                          <strong className="text-emerald-400">{tierActivePot.toLocaleString()} TKN</strong>
                        </span>
                      </div>
                    </div>

                    {diceViewMode === 'ACTIVE' && (tierPastMatchesCount > 0 || tierPastSideRoundsCount > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDiceTierFilter(tier.id);
                          setDiceViewMode('PAST');
                        }}
                        className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-400/50 hover:text-amber-200 cursor-pointer"
                      >
                        Past Hidden ({tierPastMatchesCount} matches · {tierPastSideRoundsCount} side rounds) · Filter to View
                      </button>
                    )}
                  </div>

                  {tierBoards.length === 0 ? (
                    <div className="rounded-xl border border-slate-800/80 bg-[#0B0F17] px-4 py-5 text-center text-xs text-slate-400">
                      {diceViewMode === 'ACTIVE'
                        ? `No active dice matches in ${tier.label} matching your filters right now.`
                        : diceViewMode === 'PAST'
                          ? `No past completed matches or settled side-bet rounds recorded in ${tier.label} yet.`
                          : `No rooms match your current filters in ${tier.label}.`}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tierBoards.map((board) => {
                        const allRoundSideBets = board.activeSideBetRound?.bets ?? [];
                        const activeSideBets = allRoundSideBets.filter(
                          (sb) => sb.status === 'ACTIVE' || sb.status === 'MATCHED' || sb.status === 'SUSPENDED'
                        );
                        const sideBetsToShow =
                          diceViewMode === 'ACTIVE' ? activeSideBets : allRoundSideBets;
                        const showActiveSections = diceViewMode !== 'PAST';
                        const showPastSections =
                          diceViewMode !== 'ACTIVE' &&
                          (board.matchHistory.length > 0 || board.pastSideBetReports.length > 0);

                        return (
                          <div
                            key={board.id}
                            className="rounded-xl border border-slate-800 bg-[#131A26] p-4 sm:p-5 space-y-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-slate-100">
                                    Room #{board.tableNumber} · Match #{board.matchCounter}
                                  </span>
                                  <span className="rounded border border-slate-700 bg-[#0B0F17] px-2 py-0.5 font-mono-tabular text-[11px] text-amber-300">
                                    {board.phase}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-400 font-mono-tabular">
                                  {showActiveSections ? (
                                    <>
                                      Seated: {board.occupiedCount}/{board.maxSeats} · Active Pot:{' '}
                                      <span className="text-emerald-400 font-semibold">
                                        {board.lockedPot.toLocaleString()} TKN
                                      </span>{' '}
                                      · Active Side-Bets: {activeSideBets.length}
                                    </>
                                  ) : (
                                    <>
                                      Past Completed Matches: {board.matchHistory.length} · Past Settled Side Rounds:{' '}
                                      {board.pastSideBetReports.length}
                                    </>
                                  )}
                                </div>
                              </div>

                              {showActiveSections &&
                                board.phase !== GamePhase.WAITING_FOR_PLAYERS && (
                                  <button
                                    type="button"
                                    disabled={actionBusy}
                                    onClick={() => void handleCancelDiceMatch(board.id)}
                                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer"
                                  >
                                    Cancel Match &amp; Refund All
                                  </button>
                                )}
                            </div>

                            {/* Active Main Seat Bets Table */}
                            {showActiveSections && board.seats.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-slate-300">
                                  Active Main Seat Bets ({board.seats.length})
                                </div>
                                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-800 text-slate-400">
                                        <th className="px-3 py-2 font-medium">Seat</th>
                                        <th className="px-3 py-2 font-medium">Player</th>
                                        <th className="px-3 py-2 font-medium text-right">Initial Bet</th>
                                        <th className="px-3 py-2 font-medium text-right">Locked Stake</th>
                                        <th className="px-3 py-2 font-medium text-center">Roll</th>
                                        <th className="px-3 py-2 font-medium">Tie-Breakers</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70">
                                      {board.seats.map((seat) => {
                                        const seatIsBot = isBotAccount(seat.userId, seat.username, seat.isBot);
                                        return (
                                          <tr key={seat.seatIndex} className="h-9">
                                            <td className="px-3 py-1.5 font-mono-tabular text-slate-400">
                                              #{seat.seatIndex + 1}
                                            </td>
                                            <td className="px-3 py-1.5">
                                              <span className="font-semibold text-slate-100">@{seat.username}</span>
                                              {seatIsBot ? (
                                                <span className="ml-1.5 rounded border border-sky-500/35 bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                                                  BOT
                                                </span>
                                              ) : (
                                                <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                                                  REAL
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-mono-tabular text-slate-300">
                                              {seat.initialBet.toLocaleString()} TKN
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-mono-tabular text-emerald-400">
                                              {seat.lockedBet.toLocaleString()} TKN
                                            </td>
                                            <td className="px-3 py-1.5 text-center font-mono-tabular font-bold text-amber-300">
                                              {seat.rollValue !== null ? seat.rollValue : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 font-mono-tabular text-slate-400">
                                              {seat.tieBreakerRolls.length > 0 ? seat.tieBreakerRolls.join(', ') : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Active Side-Bet Round (only active/live bets in ACTIVE mode) */}
                            {showActiveSections &&
                              board.activeSideBetRound &&
                              (diceViewMode !== 'ACTIVE' || !board.activeSideBetRound.isClosed || activeSideBets.length > 0) && (
                                <div className="space-y-2 border-t border-slate-800 pt-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="font-semibold text-amber-300">
                                      Active Side-Bet Round #{board.activeSideBetRound.roundNumber} · Roller:{' '}
                                      @{board.activeSideBetRound.rollerUsername}
                                      {isBotAccount(
                                        undefined,
                                        board.activeSideBetRound.rollerUsername,
                                        board.seats.some(
                                          (s) =>
                                            s.username === board.activeSideBetRound?.rollerUsername &&
                                            s.isBot
                                        )
                                      ) && (
                                        <span className="ml-1.5 rounded border border-sky-500/35 bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                                          BOT
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono-tabular text-slate-400">
                                      {board.activeSideBetRound.isClosed
                                        ? `Closed (Rolled ${board.activeSideBetRound.rolledFace ?? '—'})`
                                        : `${board.activeSideBetRound.secondsRemaining}s remaining`}
                                    </span>
                                  </div>

                                  {sideBetsToShow.length === 0 ? (
                                    <p className="text-xs text-slate-400">
                                      No active side-bets placed in this round yet.
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                                      <table className="w-full text-left text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-3 py-2 font-medium">Player</th>
                                            <th className="px-3 py-2 font-medium">Category / Option</th>
                                            <th className="px-3 py-2 font-medium text-right">Stake</th>
                                            <th className="px-3 py-2 font-medium text-right">Matched</th>
                                            <th className="px-3 py-2 font-medium text-right">Refunded</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium text-right">Moderation</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/70">
                                          {sideBetsToShow.map((sb) => {
                                            const sbIsBot = isBotAccount(sb.userId, sb.username, sb.isBot);
                                            return (
                                            <tr key={sb.id} className="h-10">
                                              <td className="px-3 py-1.5 font-semibold text-slate-100 whitespace-nowrap">
                                                @{sb.username}
                                                {sbIsBot ? (
                                                  <span className="ml-1.5 rounded border border-sky-500/35 bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                                                    BOT
                                                  </span>
                                                ) : (
                                                  <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                                                    REAL
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-1.5 text-slate-300">
                                                {sb.category} → <span className="text-amber-300 font-semibold">{sb.option}</span>
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono-tabular text-slate-200">
                                                {sb.originalStake.toLocaleString()}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono-tabular text-emerald-400">
                                                {sb.matchedStake.toLocaleString()}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono-tabular text-slate-400">
                                                {sb.unmatchedRefunded.toLocaleString()}
                                              </td>
                                              <td className="px-3 py-1.5 font-mono-tabular text-[11px] text-amber-300">
                                                {sb.status}
                                              </td>
                                              <td className="px-3 py-1.5 text-right">
                                                <div className="inline-flex items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    disabled={actionBusy}
                                                    onClick={() => void handleSuspendSideBet(board.id, sb.id)}
                                                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                                                  >
                                                    {sb.status === 'SUSPENDED' ? 'Unsuspend' : 'Suspend'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    disabled={actionBusy}
                                                    onClick={() => void handleCancelSideBet(board.id, sb.id)}
                                                    className="rounded border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-60 cursor-pointer"
                                                  >
                                                    Cancel &amp; Refund
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}

                            {/* Past Completed Matches & Old Side-Bet Rounds (Hidden in ACTIVE mode; shown only when filtered to PAST or ALL) */}
                            {showPastSections && (
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                {board.matchHistory.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-xs font-semibold text-emerald-300">
                                      Past Completed Matches ({board.matchHistory.length})
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                                      <table className="w-full text-left text-[11px]">
                                        <thead>
                                          <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-2.5 py-2">#</th>
                                            <th className="px-2.5 py-2">Winner</th>
                                            <th className="px-2.5 py-2 text-center">Face</th>
                                            <th className="px-2.5 py-2 text-right">Pot</th>
                                            <th className="px-2.5 py-2 text-right">Fee</th>
                                            <th className="px-2.5 py-2 text-right">Net Payout</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/70">
                                          {board.matchHistory.map((m) => (
                                            <tr key={`${m.matchNumber}_${m.timestamp}`}>
                                              <td className="px-2.5 py-1.5 font-mono-tabular text-slate-400">
                                                #{m.matchNumber}
                                              </td>
                                              <td className="px-2.5 py-1.5 font-semibold text-slate-100">
                                                @{m.winnerUsername}
                                                {m.hadTieBreaker ? ' (TB)' : ''}
                                                {isBotAccount(m.winnerUserId, m.winnerUsername, m.winnerIsBot) && (
                                                  <span className="ml-1.5 rounded border border-sky-500/35 bg-sky-500/20 px-1 py-0.5 text-[9px] font-bold text-sky-300">
                                                    BOT
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-center font-mono-tabular text-amber-300">
                                                {m.winningFace}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-slate-300">
                                                {m.grossPot.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-amber-300">
                                                +{m.feeAmount.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-emerald-400">
                                                {m.netPayout.toLocaleString()}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {board.pastSideBetReports.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-xs font-semibold text-sky-300">
                                      Past Settled Side-Bet Rounds ({board.pastSideBetReports.length})
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                                      <table className="w-full text-left text-[11px]">
                                        <thead>
                                          <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-2.5 py-2">Face</th>
                                            <th className="px-2.5 py-2 text-right">Placed</th>
                                            <th className="px-2.5 py-2 text-right">Matched</th>
                                            <th className="px-2.5 py-2 text-right">Refunded</th>
                                            <th className="px-2.5 py-2 text-right">Fee</th>
                                            <th className="px-2.5 py-2">Winners</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/70">
                                          {board.pastSideBetReports.map((rep) => (
                                            <tr key={rep.roundId}>
                                              <td className="px-2.5 py-1.5 font-mono-tabular font-bold text-amber-300">
                                                Face {rep.rolledFace}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-slate-200">
                                                {rep.totalPoolPlaced.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-emerald-400">
                                                {rep.totalMatched.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-slate-400">
                                                {rep.totalRefunded.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-mono-tabular text-amber-300">
                                                +{rep.totalFeesCollected.toLocaleString()}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-slate-300">
                                                {rep.winners.length > 0
                                                  ? rep.winners
                                                      .map(
                                                        (w) =>
                                                          `@${w.username}${
                                                            isBotAccount(undefined, w.username) ? ' [BOT]' : ''
                                                          } (${w.option}: +${w.netPayout})`
                                                      )
                                                      .join(', ')
                                                  : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PENDING DEPOSIT & WITHDRAWAL QUEUE + PROCESSED HISTORY + MANUAL TOP-UP */}
      {subTab === 'payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-5">
            {/* Active Pending Requests Queue (Items disappear immediately upon Approve/Reject) */}
            <div className="rounded-xl border border-amber-500/30 bg-[#131A26] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-amber-300">
                    Pending Deposit &amp; Withdrawal Requests ({visiblePendingPayments.length})
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Approving or rejecting removes the request from this queue, logs it to History, and updates the user&apos;s wallet &amp; account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportPaymentsCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  Export CSV
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B0F17] p-0.5 text-[11px]">
                  {(['ALL', 'DEPOSIT', 'WITHDRAWAL'] as PaymentKindFilter[]).map((kd) => (
                    <button
                      key={kd}
                      type="button"
                      onClick={() => setPaymentKindFilter(kd)}
                      className={`rounded px-2.5 py-1 cursor-pointer ${
                        paymentKindFilter === kd
                          ? 'bg-slate-800 text-emerald-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {kd}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setHistoryCategoryFilter('ALL');
                    setSubTab('history');
                  }}
                  className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  Open Full History Log →
                </button>
              </div>

              <div className="space-y-3">
                {visiblePendingPayments.length === 0 ? (
                  <p className="text-xs text-slate-400 rounded-lg border border-slate-800 bg-[#0B0F17] p-4">
                    No pending deposit or withdrawal requests right now.
                  </p>
                ) : (
                  visiblePendingPayments.map((req) => {
                    const targetUser = mergedUsers.find((u) => u.id === req.userId);
                    const realDep = targetUser?.realDepositedTokens ?? 0;
                    const realWithdrawn = targetUser?.realWithdrawnTokens ?? 0;
                    const promoGranted = targetUser?.promoTokensGrantedTotal ?? 0;
                    const promoRem = targetUser?.promoTokensRemaining ?? 0;
                    const wagered = targetUser?.promoTokensWagered ?? 0;
                    const requiredWager = promoGranted * livePromoConfig.promoPlaythroughMultiplier;
                    const riskFlag = targetUser?.promoRiskFlag ?? 'NONE';
                    const isWithdrawal = req.kind === 'WITHDRAWAL';
                    const exceedsRealDeposits = isWithdrawal && realWithdrawn + req.tokenAmount > realDep;
                    const missedAdminPolicy =
                      isWithdrawal &&
                      promoGranted > 0 &&
                      livePromoConfig.requireRealDepositToWithdrawPromo &&
                      (realDep < livePromoConfig.minRealDepositToUnlockTokens || wagered < requiredWager);
                    const showAdminTokenAudit =
                      isWithdrawal || promoGranted > 0 || riskFlag !== 'NONE';

                    return (
                    <div
                      key={req.id}
                      className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">
                            {req.kind} · @{req.username} · {req.tokenAmount.toLocaleString()} TKN
                          </div>
                          <div className="text-xs text-slate-400 font-mono-tabular">
                            ${req.usdEquivalent.toFixed(2)} USD · Ref: {req.referenceId}
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            Channel: {req.method} — {req.destinationOrBankDetails}
                          </div>
                          {req.receiptPreviewName && (
                            <div className="text-[11px] text-amber-400 mt-0.5">
                              Slip Attached: {req.receiptPreviewName}
                            </div>
                          )}
                        </div>

                        <span className="font-mono-tabular text-xs font-semibold text-amber-400">
                          PENDING
                        </span>
                      </div>

                      {showAdminTokenAudit && (
                        <div
                          className={`rounded-lg border p-3 text-[11px] space-y-1.5 ${
                            exceedsRealDeposits || riskFlag !== 'NONE' || missedAdminPolicy
                              ? 'border-rose-500/45 bg-rose-500/10 text-rose-100'
                              : 'border-slate-800 bg-[#131A26] text-slate-300'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                            <span>Admin-Only Real vs Unbacked Token Audit</span>
                            {riskFlag !== 'NONE' && (
                              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono-tabular text-[10px] text-rose-300">
                                FLAG: {riskFlag}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular">
                            <div>
                              <div className="text-[10px] text-slate-400 font-sans">Real Deposited</div>
                              <div className="font-semibold text-emerald-400">
                                {realDep.toLocaleString()} TKN
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 font-sans">Prev Withdrawn</div>
                              <div className="font-semibold text-slate-200">
                                {realWithdrawn.toLocaleString()} TKN
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 font-sans">Free / Unbacked</div>
                              <div className="font-semibold text-amber-300">
                                {promoGranted.toLocaleString()} / Rem {promoRem.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 font-sans">Playthrough</div>
                              <div className="font-semibold text-sky-300">
                                {wagered.toLocaleString()} / {requiredWager.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {(exceedsRealDeposits || missedAdminPolicy) && (
                            <div className="text-[11px] text-rose-300 font-medium">
                              Warning: Payout exceeds verified real deposits or misses {livePromoConfig.promoPlaythroughMultiplier}x bonus rollover. Verify before approving.
                            </div>
                          )}
                          {targetUser?.promoAdminNote && (
                            <div className="text-[11px] text-amber-200/90">
                              Note: {targetUser.promoAdminNote}
                            </div>
                          )}
                        </div>
                      )}

                      {req.receiptDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewImage({
                              title: `Payment Slip · ${req.referenceId}`,
                              url: req.receiptDataUrl!,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded border border-slate-700 bg-[#131A26] p-1.5 hover:border-amber-400/50 cursor-pointer"
                        >
                          <img
                            src={req.receiptDataUrl}
                            alt="Payment Receipt Preview"
                            referrerPolicy="no-referrer"
                            className="max-h-24 rounded object-contain"
                          />
                          <span className="text-[11px] text-amber-300 pr-2">Click to inspect</span>
                        </button>
                      )}

                      {/* Golden Rule: Zero Real Deposits Warning + Quick-Reject */}
                      {isWithdrawal && realDep === 0 && (
                        <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-300 uppercase tracking-wider">
                              ⚠ Golden Rule: Zero Real Deposits
                            </span>
                            <span className="text-[11px] text-orange-200/80 font-mono-tabular">
                              ($0.00 deposited — funded solely from free / bot tokens)
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              const customerCareNote =
                                'Withdrawal request could not be processed automatically. For account security and payout channel verification, please contact Customer Care via Telegram or Email.';
                              void handleReviewPayment(req, false, customerCareNote);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-500/15 px-3 py-1.5 text-[11px] font-semibold text-orange-200 hover:bg-orange-500/25 disabled:opacity-60 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Quick Reject (Contact Customer Care)
                          </button>
                        </div>
                      )}

                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <input
                          type="text"
                          value={reviewNoteByPayment[req.id] ?? ''}
                          onChange={(e) =>
                            setReviewNoteByPayment((prev) => ({
                              ...prev,
                              [req.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional approval or rejection note (shown on user account)"
                          className="w-full rounded-lg border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleReviewPayment(req, true)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleReviewPayment(req, false)}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Processed Payment History */}
            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Processed Deposits &amp; Withdrawals History ({processedPayments.length})
                </h3>
                <span className="text-[11px] text-slate-400">Approved &amp; Rejected</span>
              </div>
              {processedPayments.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                  No processed payment decisions yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {processedPayments.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">
                          {req.kind} · @{req.username} · {req.tokenAmount.toLocaleString()} TKN
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${
                            req.status === ApprovalStatus.APPROVED
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono-tabular">
                        Ref: {req.referenceId} · {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : new Date(req.createdAt).toLocaleString()}
                      </div>
                      {req.adminNote && (
                        <div className="text-[11px] text-slate-300">Note: {req.adminNote}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={handleManualTopUp}
            className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3.5"
          >
            <h2 className="font-display text-base font-semibold text-slate-100">
              Manual Wallet Funding / Top-Up
            </h2>
            <p className="text-xs text-slate-400">
              Directly credit tokens to a user&apos;s available wallet with full server audit details.
            </p>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Target Account</label>
              <select
                value={topUpUserId}
                onChange={(e) => setTopUpUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              >
                {mergedUsers.length === 0 ? (
                  <option value="">No registered players yet</option>
                ) : (
                  mergedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.username} ({u.availableBalance.toLocaleString()} TKN)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Token Amount</label>
                <input
                  type="number"
                  min={1}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Reference Code</label>
                <input
                  type="text"
                  value={topUpRef}
                  onChange={(e) => setTopUpRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Funding Source / Channel</label>
              <input
                type="text"
                value={topUpSource}
                onChange={(e) => setTopUpSource(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Audit Reason (Required)</label>
              <textarea
                rows={2}
                value={topUpReason}
                onChange={(e) => setTopUpReason(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={actionBusy || mergedUsers.length === 0}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              Execute Manual Wallet Top-Up
            </button>
          </form>
        </div>
      )}

      {/* TAB 4B: APPROVAL HISTORY & FULL AUDIT LOG */}
      {subTab === 'history' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Approval &amp; Decision History Log ({filteredAuditLogs.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Permanent server log of every Deposit, Withdrawal, and KYC approval or rejection once cleared from pending queues.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search user, action, ref, note..."
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] p-1 w-fit text-[11px]">
              {(
                [
                  { id: 'ALL', label: `All Logs (${auditLogs.length})` },
                  { id: 'DEPOSIT', label: 'Deposits' },
                  { id: 'WITHDRAWAL', label: 'Withdrawals' },
                  { id: 'KYC', label: 'KYC Reviews' },
                  { id: 'SYSTEM', label: 'User & System Actions' },
                ] as { id: HistoryCategoryFilter; label: string }[]
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setHistoryCategoryFilter(cat.id)}
                  className={`rounded px-2.5 py-1 cursor-pointer ${
                    historyCategoryFilter === cat.id
                      ? 'bg-slate-800 text-amber-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {filteredAuditLogs.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-5 text-xs text-slate-400">
                No history entries match this filter yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Timestamp</th>
                      <th className="px-3 py-2.5 font-medium">Admin</th>
                      <th className="px-3 py-2.5 font-medium">Action</th>
                      <th className="px-3 py-2.5 font-medium">Target / Reference</th>
                      <th className="px-3 py-2.5 font-medium">Decision Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredAuditLogs.map((log) => {
                      const isApprove = log.action.startsWith('APPROVE_') || log.action === 'VERIFY_KYC';
                      const isReject = log.action.startsWith('REJECT_');
                      return (
                        <tr key={log.id} className="h-10">
                          <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-semibold text-amber-300 whitespace-nowrap">
                            @{log.adminUsername}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${
                                isApprove
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : isReject
                                  ? 'bg-rose-500/15 text-rose-300'
                                  : 'bg-slate-800 text-sky-300'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-200">{log.target}</td>
                          <td className="px-3 py-2 text-slate-300">{log.details}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SUPPORT TICKETS & CUSTOMER CARE CHANNELS */}
      {subTab === 'tickets' && (
        <div className="space-y-4">
          {/* Customer Care Channels Settings Card */}
          <div className="rounded-xl border border-amber-500/30 bg-[#131A26] p-5 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <h3 className="font-display text-sm sm:text-base font-bold text-slate-100">
                    Customer Care Channels (Email &amp; Telegram)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Easily update the official support email and Telegram handle displayed to all players across the platform.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {contactFeedback && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                      contactFeedback.ok
                        ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300'
                        : 'bg-rose-950/70 border border-rose-500/50 text-rose-300'
                    }`}
                  >
                    {contactFeedback.msg}
                  </span>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => void handleSaveContactConfig(e)}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end"
            >
              {/* Support Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-amber-400" />
                  <span>Support Email Address</span>
                </label>
                <input
                  type="email"
                  value={supportEmailDraft}
                  onChange={(e) => {
                    setSupportEmailDraft(e.target.value);
                    setContactConfigDirty(true);
                  }}
                  placeholder="support@betspot.gg"
                  className="w-full rounded-lg border border-slate-700 bg-[#090D14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>

              {/* Telegram Username */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="text-sky-400 font-bold">@</span>
                  <span>Telegram Account Handle</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">@</span>
                  <input
                    type="text"
                    value={telegramUsernameDraft.replace(/^@/, '')}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/^@/, '').trim();
                      setTelegramUsernameDraft(clean);
                      setTelegramLinkDraft(`https://t.me/${clean}`);
                      setContactConfigDirty(true);
                    }}
                    placeholder="BetSpotSupport"
                    className="w-full rounded-lg border border-slate-700 bg-[#090D14] pl-7 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Direct Telegram Link & Save Button */}
              <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span>Direct Telegram Link</span>
                  {telegramLinkDraft && (
                    <a
                      href={telegramLinkDraft}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline font-mono"
                    >
                      Open Link &rarr;
                    </a>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={telegramLinkDraft}
                    onChange={(e) => {
                      setTelegramLinkDraft(e.target.value);
                      setContactConfigDirty(true);
                    }}
                    placeholder="https://t.me/BetSpotSupport"
                    className="w-full rounded-lg border border-slate-700 bg-[#090D14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={contactSaving}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    <RefreshCw className={`h-3 w-3 ${contactSaving ? 'animate-spin' : ''}`} />
                    <span>{contactSaving ? 'Saving...' : 'Save Channels'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Customer Care &amp; Dispute Tickets ({visibleTickets.length})
              </h2>
              <p className="text-xs text-slate-400">
                Complaints and inquiries submitted by players from the Rules &amp; Guide support form.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-800 bg-[#0B0F17] p-0.5 text-[11px]">
              {(['ALL', 'Open · Under Review', 'In Progress', 'Resolved'] as TicketFilter[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTicketFilter(st)}
                  className={`rounded px-2.5 py-1 cursor-pointer ${
                    ticketFilter === st
                      ? 'bg-slate-800 text-amber-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {visibleTickets.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
              No support tickets match this filter.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleTickets.map((t) => {
                const draftStatus = ticketStatusDraft[t.id] ?? t.status;
                const draftReply = ticketReplyDraft[t.id] ?? t.adminReply ?? '';
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                          <span className="font-mono-tabular text-amber-300">{t.id}</span>
                          <span>· {t.subject}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          From <strong className="text-slate-200">{t.name}</strong> ({t.email}) ·{' '}
                          {t.category} · Ref: {t.referenceId} · {t.createdAt}
                        </div>
                      </div>
                      <span
                        className={`font-mono-tabular text-xs font-semibold ${
                          t.status === 'Resolved'
                            ? 'text-emerald-400'
                            : t.status === 'In Progress'
                            ? 'text-sky-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    <p className="rounded border border-slate-800 bg-[#131A26] p-3 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {t.message}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center pt-1">
                      <select
                        value={draftStatus}
                        onChange={(e) =>
                          setTicketStatusDraft((prev) => ({
                            ...prev,
                            [t.id]: e.target.value as 'Open · Under Review' | 'In Progress' | 'Resolved',
                          }))
                        }
                        className="sm:col-span-3 rounded-lg border border-slate-700 bg-[#131A26] px-2.5 py-2 text-xs text-slate-100"
                      >
                        <option value="Open · Under Review">Open · Under Review</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                      <input
                        type="text"
                        value={draftReply}
                        onChange={(e) =>
                          setTicketReplyDraft((prev) => ({
                            ...prev,
                            [t.id]: e.target.value,
                          }))
                        }
                        placeholder="Internal resolution note / reply summary..."
                        className="sm:col-span-7 rounded-lg border border-slate-700 bg-[#131A26] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleUpdateTicket(t)}
                        className="sm:col-span-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        Save Update
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {/* TAB 1B: BOTS, LIQUIDITY RISK GUARDRAILS & WIN-STREAK ALERTS */}
      {subTab === 'bots' && (
        <div className="space-y-6">
          {/* Master ON / OFF Switch Banner */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <Bot className="h-5 w-5 text-emerald-400" />
                <h2 className="font-display text-lg font-bold text-slate-100">
                  Automated Bot Matchmaker &amp; Risk Guardrails
                </h2>
                <span
                  className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
                    liveBotConfig.enabled
                      ? liveBotSummary.isAutoPaused
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {liveBotConfig.enabled
                    ? liveBotSummary.isAutoPaused
                      ? 'AUTO-PAUSED BY GUARDRAIL'
                      : 'BOTS ACTIVE'
                    : 'BOTS MANUALLY OFF'}
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl">
                Bots join only if no 2nd real player enters within{' '}
                <strong className="text-slate-200">{liveBotConfig.triggerWaitSeconds}s</strong>. Every dice roll uses server cryptographic CSPRNG (<code className="text-amber-300">crypto.randomInt</code>), zero Martingale, fixed stake caps, and a separate liquidity ledger.
              </p>
              {liveBotSummary.autoPausedReason && (
                <div className="text-xs font-medium text-amber-300 pt-1">
                  Auto-Pause Reason: {liveBotSummary.autoPausedReason}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void handleToggleBotsEnabled()}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-extrabold cursor-pointer shadow-lg transition-colors disabled:opacity-60 ${
                liveBotConfig.enabled
                  ? 'bg-rose-500 hover:bg-rose-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              <Power className="h-4 w-4" />
              {liveBotConfig.enabled ? 'Turn Bots OFF' : 'Turn Bots ON'}
            </button>
          </div>

          {/* Bot Pool & Loss Budget KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Dedicated Bot Liquidity Pool</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {liveBotSummary.poolBalanceTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular">
                {TokenEconomy.formatUsd(liveBotSummary.poolBalanceTokens)} · Strictly separated from user wallets
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">1-Hour Bot Net P&amp;L / Loss Budget</div>
              <div
                className={`font-mono-tabular text-xl font-bold ${
                  liveBotSummary.hourlyNetPnlTokens >= 0 ? 'text-emerald-400' : 'text-rose-300'
                }`}
              >
                {liveBotSummary.hourlyNetPnlTokens >= 0
                  ? `+${liveBotSummary.hourlyNetPnlTokens.toLocaleString()}`
                  : liveBotSummary.hourlyNetPnlTokens.toLocaleString()}{' '}
                TKN
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular">
                Loss Used: {liveBotSummary.hourlyLossUsedTokens.toLocaleString()} /{' '}
                {liveBotConfig.maxHourlyLossTokens.toLocaleString()} TKN
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">24-Hour Bot Net P&amp;L / Loss Budget</div>
              <div
                className={`font-mono-tabular text-xl font-bold ${
                  liveBotSummary.dailyNetPnlTokens >= 0 ? 'text-emerald-400' : 'text-rose-300'
                }`}
              >
                {liveBotSummary.dailyNetPnlTokens >= 0
                  ? `+${liveBotSummary.dailyNetPnlTokens.toLocaleString()}`
                  : liveBotSummary.dailyNetPnlTokens.toLocaleString()}{' '}
                TKN
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular">
                Loss Used: {liveBotSummary.dailyLossUsedTokens.toLocaleString()} /{' '}
                {liveBotConfig.maxDailyLossTokens.toLocaleString()} TKN
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1">
              <div className="text-xs text-slate-400">Anti-Martingale Streak &amp; Cooldown</div>
              <div className="font-mono-tabular text-xl font-bold text-sky-300">
                {liveBotSummary.cooldownMatchesRemaining > 0
                  ? `Paused (${liveBotSummary.cooldownMatchesRemaining})`
                  : `${liveBotSummary.consecutiveLosses} / ${liveBotConfig.cooldownAfterLosses} Losses`}
              </div>
              <div className="text-[11px] text-slate-400">
                Fixed small stakes · Never doubles down on losses
              </div>
            </div>
          </div>

          {/* System Bot Accounts Roster (Stealth Identity Mapping visible only to Admin) */}
          <div className="rounded-xl border border-sky-500/30 bg-[#131A26] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  System Bot Accounts Roster ({botAccounts.length} Stealth Profiles)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Real players see natural handles &amp; flags with zero BOT tags · Only Admin &amp; internal ledgers identify them
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {botAccounts.map((bot) => (
                <div
                  key={bot.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CountryFlag country={bot.country} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">@{bot.username}</div>
                      <div className="text-[10px] font-mono-tabular text-slate-500 truncate">
                        {bot.id}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded border border-sky-500/35 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                    BOT
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Editable Bot Risk Limits & Wait Timers Form */}
            <form
              onSubmit={(e) => void handleSaveBotConfig(e)}
              className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    Bot Limits, Wait Timers &amp; Anomaly Thresholds
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBotDraft({ ...DEFAULT_BOT_CONFIG, enabled: botDraft.enabled });
                    setBotConfigDirty(true);
                  }}
                  className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Load Recommended Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Solo Wait Trigger (sec)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={900}
                    value={botDraft.triggerWaitSeconds}
                    onChange={(e) => {
                      setBotDraft((d) => ({ ...d, triggerWaitSeconds: Number(e.target.value) || 25 }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Default 25s</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Side-Bet Counter Delay (sec)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={18}
                    value={botDraft.sideBetTriggerDelaySeconds}
                    onChange={(e) => {
                      setBotDraft((d) => ({
                        ...d,
                        sideBetTriggerDelaySeconds: Number(e.target.value) || 8,
                      }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Inside 20s window (3–18s)</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Max Bot Main Stake (TKN)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={50000}
                    value={botDraft.maxPerMatchStakeTokens}
                    onChange={(e) => {
                      setBotDraft((d) => ({
                        ...d,
                        maxPerMatchStakeTokens: Number(e.target.value) || 300,
                      }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Per-match cap (excess auto-refunds)</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Max Bot Side-Bet Cap (TKN)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={25000}
                    value={botDraft.maxPerRoundSideBetTokens}
                    onChange={(e) => {
                      setBotDraft((d) => ({
                        ...d,
                        maxPerRoundSideBetTokens: Number(e.target.value) || 150,
                      }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Per-round counter-liquidity cap</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Max 1h Net Loss Cap (TKN)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={500000}
                    value={botDraft.maxHourlyLossTokens}
                    onChange={(e) => {
                      setBotDraft((d) => ({ ...d, maxHourlyLossTokens: Number(e.target.value) || 1500 }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Auto-pauses bots if breached</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Max 24h Net Loss Cap (TKN)
                  </label>
                  <input
                    type="number"
                    min={300}
                    max={2000000}
                    value={botDraft.maxDailyLossTokens}
                    onChange={(e) => {
                      setBotDraft((d) => ({ ...d, maxDailyLossTokens: Number(e.target.value) || 5000 }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Daily rolling budget guard</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Cooldown After N Losses
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={botDraft.cooldownAfterLosses}
                    onChange={(e) => {
                      setBotDraft((d) => ({ ...d, cooldownAfterLosses: Number(e.target.value) || 3 }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Consecutive bot losses trigger pause</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Cooldown Sit-Out Matches
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={botDraft.cooldownMatchCount}
                    onChange={(e) => {
                      setBotDraft((d) => ({ ...d, cooldownMatchCount: Number(e.target.value) || 2 }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Matches bots sit out on cooldown</div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Win-Streak Alert Threshold
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={25}
                    value={botDraft.winStreakAlertThreshold}
                    onChange={(e) => {
                      setBotDraft((d) => ({
                        ...d,
                        winStreakAlertThreshold: Number(e.target.value) || 5,
                      }));
                      setBotConfigDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                  <div className="mt-0.5 text-[10px] text-slate-500">Flags Admin alert for review</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-300">Allowed Room Tiers for Automated Bots</span>
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={botDraft.sideBetBotsEnabled}
                      onChange={(e) => {
                        setBotDraft((d) => ({ ...d, sideBetBotsEnabled: e.target.checked }));
                        setBotConfigDirty(true);
                      }}
                      className="rounded border-slate-600 bg-[#0B0F17]"
                    />
                    Enable Capped Bot Side-Bet Counter-Liquidity
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {TokenEconomy.TIERS.map((tier) => {
                    const checked = botDraft.allowedTierIds.includes(tier.id);
                    return (
                      <label
                        key={tier.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer ${
                          checked
                            ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-200'
                            : 'border-slate-800 bg-[#0B0F17] text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked;
                            setBotDraft((d) => {
                              const set = new Set(d.allowedTierIds);
                              if (nextChecked) set.add(tier.id);
                              else set.delete(tier.id);
                              return {
                                ...d,
                                allowedTierIds: set.size > 0 ? Array.from(set) : [TierId.TIER_1],
                              };
                            });
                            setBotConfigDirty(true);
                          }}
                        />
                        <span className="truncate font-medium">{tier.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-slate-400">
                  {liveBotConfig.updatedAt > 0
                    ? `Last saved ${new Date(liveBotConfig.updatedAt).toLocaleString()} by @${liveBotConfig.updatedBy ?? 'admin'}`
                    : 'Using server default risk guardrails'}
                </span>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  Save Bot Limits &amp; Timers
                </button>
              </div>
            </form>

            {/* Bot Liquidity Pool Management */}
            <div className="lg:col-span-4 rounded-xl border border-amber-500/30 bg-[#131A26] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-amber-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Bot Liquidity Pool Treasury
                </h3>
              </div>

              {/* Large Pool Balance Display */}
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-center space-y-1">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Current Pool Balance</div>
                <div className="font-mono-tabular text-3xl font-extrabold text-amber-300">
                  {liveBotSummary.poolBalanceTokens.toLocaleString()} <span className="text-lg text-amber-400/70">TKN</span>
                </div>
                <div className="text-xs text-slate-400 font-mono-tabular">
                  ≈ {TokenEconomy.formatUsd(liveBotSummary.poolBalanceTokens)} · Isolated from user wallets
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Manage the isolated Bot Liquidity Pool. Bots never bet more than this pool holds. Use <strong className="text-amber-300">Set Exact Balance</strong> to target a specific amount or <strong className="text-rose-300">Burn Surplus</strong> to destroy excess unbacked tokens.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Token Amount (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    value={poolAdjustAmount}
                    onChange={(e) => setPoolAdjustAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[5000, 10000, 15000, 25000, 50000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPoolAdjustAmount(String(preset))}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-colors cursor-pointer ${
                        Number(poolAdjustAmount) === preset
                          ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-400 hover:border-amber-400/50 hover:text-amber-300'
                      }`}
                    >
                      {(preset / 1000)}k TKN
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Audit Note (optional)</label>
                  <input
                    type="text"
                    value={poolAdjustNote}
                    onChange={(e) => setPoolAdjustNote(e.target.value)}
                    placeholder="e.g. Weekend liquidity allocation"
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustBotPool('TOPUP')}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                  >
                    + Top Up Pool
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustBotPool('WITHDRAW')}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-60 cursor-pointer"
                  >
                    − Sweep Profit
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustBotPool('SET')}
                    className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/20 disabled:opacity-60 cursor-pointer"
                  >
                    ⚡ Set Exact Balance
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustBotPool('BURN_SURPLUS')}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer"
                  >
                    🔥 Burn Tokens
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Win-Streak & Anomaly Detection Alerts */}
          <div className="rounded-xl border border-amber-500/30 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Win-Streak &amp; Anomaly Alerts ({riskAlerts.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Flags long streaks &amp; invalid state calls for fair manual log review
              </span>
            </div>

            {riskAlerts.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No win-streak or anomaly alerts flagged yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {riskAlerts.map((alert) => {
                  const targetUser = alert.userId ? mergedUsers.find((u) => u.id === alert.userId) : undefined;
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 ${
                        alert.acknowledged
                          ? 'border-slate-800 bg-[#0B0F17] opacity-75'
                          : alert.severity === 'CRITICAL'
                          ? 'border-rose-500/45 bg-rose-950/20'
                          : 'border-amber-500/40 bg-amber-950/20'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold ${
                              alert.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300'
                                : alert.severity === 'WARNING'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {alert.type}
                          </span>
                          <span className="font-semibold text-slate-100">{alert.title}</span>
                          <span className="font-mono-tabular text-[11px] text-slate-500">
                            {new Date(alert.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-300">{alert.details}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {targetUser && (
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedUserId(targetUser.id);
                              setUserModalTab('bets');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#131A26] px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-slate-800 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Review Logs
                          </button>
                        )}
                        {!alert.acknowledged ? (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleAckRiskAlert(alert.id)}
                            className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-medium">
                            Ack @{alert.acknowledgedBy ?? 'admin'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Separate Bot Liquidity Ledger (bot_liquidity_ledger) */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Separate Bot Liquidity Ledger (bot_liquidity_ledger)
                </h3>
                <p className="text-xs text-slate-400">
                  Tracks every bot stake, payout, and pool adjustment separately from human wallets and platform fee revenue.
                </p>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                Latest {botLedger.length} records
              </span>
            </div>

            {botLedger.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No bot liquidity entries logged yet. Entries appear when a bot settles a match/side-bet or when the Bot Pool is adjusted.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 font-medium">Room / Source</th>
                      <th className="px-3 py-2.5 font-medium">Bot / Counterparty</th>
                      <th className="px-3 py-2.5 font-medium text-right">Stake</th>
                      <th className="px-3 py-2.5 font-medium text-right">Payout</th>
                      <th className="px-3 py-2.5 font-medium text-right">Net P&amp;L</th>
                      <th className="px-3 py-2.5 font-medium text-right">Pool After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {botLedger.slice(0, 80).map((row) => (
                      <tr key={row.id} className="h-10">
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-sky-300">
                          {row.kind}
                        </td>
                        <td className="px-3 py-2 text-slate-200">{row.roomLabel}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.botUsername} <span className="text-slate-500">vs</span> {row.opponentSummary}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-300">
                          {row.stakeTokens.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-200">
                          {row.payoutTokens.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono-tabular font-semibold ${
                            row.netTokens >= 0 ? 'text-emerald-400' : 'text-rose-300'
                          }`}
                        >
                          {row.netTokens >= 0 ? `+${row.netTokens.toLocaleString()}` : row.netTokens.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-amber-300">
                          {row.poolBalanceAfter.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 0D: FREE TOKENS, REFERRALS & FAKE-TOKEN LOSS CONTROL */}
      {subTab === 'promos' && (
        <div className="space-y-6">
          {/* Master ON / OFF Control Banner */}
          <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Gift className="h-5 w-5 text-amber-400" />
                <h2 className="font-display text-lg font-bold text-slate-50">
                  Free Welcome Tokens &amp; Invite-to-Earn Control
                </h2>
                <span
                  className={`rounded-md px-2 py-0.5 font-mono-tabular text-[11px] font-bold ${
                    livePromoConfig.welcomeBonusEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {livePromoConfig.welcomeBonusEnabled
                    ? `150 FREE WELCOME: ON`
                    : '150 FREE WELCOME: OFF'}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 font-mono-tabular text-[11px] font-bold ${
                    livePromoConfig.referralProgramEnabled
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-slate-700/60 text-slate-300 border border-slate-600'
                  }`}
                >
                  {livePromoConfig.referralProgramEnabled ? 'REFERRALS: ON' : 'REFERRALS: OFF'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Toggle free welcome tokens for new registrations ON or OFF instantly, track unbacked (&ldquo;fake&rdquo;) promo tokens separately from real deposits, log damage/losses against the Bot Pool or cashouts, and enforce anti-inflation guardrails.
              </p>
              {livePromoSummary.isBudgetAutoPaused && livePromoSummary.autoPausedReason && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-200">
                  <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>Auto-Circuit Notice: {livePromoSummary.autoPausedReason}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleToggleWelcomeBonus()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer shadow-md ${
                  livePromoConfig.welcomeBonusEnabled
                    ? 'border border-rose-400/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                }`}
              >
                <Power className="h-4 w-4" />
                {livePromoConfig.welcomeBonusEnabled
                  ? `Turn Free ${livePromoConfig.welcomeBonusTokens} TKN OFF`
                  : `Turn Free ${livePromoConfig.welcomeBonusTokens} TKN ON`}
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleToggleReferralProgram()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer shadow-md ${
                  livePromoConfig.referralProgramEnabled
                    ? 'border border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                    : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                }`}
              >
                <Power className="h-4 w-4" />
                {livePromoConfig.referralProgramEnabled ? 'Turn Referrals OFF' : 'Turn Referrals ON'}
              </button>
            </div>
          </div>

          {/* 4 Separate Fake-Token Financial Loss & Anti-Inflation KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-amber-500/35 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Promo Mint Budget Reserve</span>
                <DiceTokenIcon size="sm" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-amber-300">
                {livePromoSummary.budgetPoolTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {TokenEconomy.formatUsd(livePromoSummary.budgetPoolTokens)} ceiling remaining
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total Free Tokens Minted</span>
                <Gift className="h-4 w-4 text-sky-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-sky-300">
                {livePromoSummary.totalMintedTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                Welcome {livePromoSummary.signupMintedTokens.toLocaleString()} · Ref {livePromoSummary.referralMintedTokens.toLocaleString()} · 24h {livePromoSummary.dailyMintedTokens.toLocaleString()}/{livePromoConfig.dailyPromoMintCapTokens.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Unbacked Circulation</span>
                <Shield className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                {livePromoSummary.unbackedCirculationTokens.toLocaleString()} TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-emerald-400">
                Burned / Revoked: {livePromoSummary.burnedOrRecoveredTokens.toLocaleString()} TKN · {livePromoSummary.promoHoldersCount} accounts
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/40 bg-[#131A26] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Fake-Token Realized Damage / Loss</span>
                <ShieldAlert className="h-4 w-4 text-rose-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-rose-400">
                {(
                  livePromoSummary.systemLossToBotPoolTokens +
                  livePromoSummary.realWithdrawalLeakageTokens
                ).toLocaleString()}{' '}
                TKN
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                Bot Losses {livePromoSummary.systemLossToBotPoolTokens.toLocaleString()} · Cashout Leak {livePromoSummary.realWithdrawalLeakageTokens.toLocaleString()} · Exp {livePromoSummary.netUnbackedExposureTokens.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Guardrails Config Form + Mint Budget Reserve Pool */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleSavePromoConfig}
              className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    Anti-Inflation Guardrails &amp; Referral Parameters
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  1h Minted: {livePromoSummary.hourlyMintedTokens.toLocaleString()} / {livePromoConfig.hourlyPromoMintCapTokens.toLocaleString()} TKN
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">New User Welcome Bonus (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={promoDraft.welcomeBonusTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        welcomeBonusTokens: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Referral Reward Each (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={promoDraft.referralBonusTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        referralBonusTokens: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Referral Min Deposit (TKN)</label>
                  <input
                    type="number"
                    min={1}
                    max={500000}
                    value={promoDraft.referralMinDepositTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        referralMinDepositTokens: Number(e.target.value) || liveEconomyConfig.tokensPerUsd,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs border-t border-slate-800 pt-4">
                <div>
                  <label className="block text-slate-400 mb-1">1h Global Mint Cap (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={promoDraft.hourlyPromoMintCapTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        hourlyPromoMintCapTokens: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">24h Global Mint Cap (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    max={500000}
                    value={promoDraft.dailyPromoMintCapTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        dailyPromoMintCapTokens: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Referrals Per User</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={promoDraft.maxReferralsPerUser}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        maxReferralsPerUser: Number(e.target.value) || 1,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs border-t border-slate-800 pt-4">
                <div>
                  <label className="block text-slate-400 mb-1">Min Real Deposit to Unlock (TKN)</label>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    value={promoDraft.minRealDepositToUnlockTokens}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        minRealDepositToUnlockTokens: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-emerald-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Bonus Playthrough Rollover (Nx)</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={promoDraft.promoPlaythroughMultiplier}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        promoPlaythroughMultiplier: Number(e.target.value) || 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-emerald-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Free Signups Per IP</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={promoDraft.maxSignupBonusesPerIp}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        maxSignupBonusesPerIp: Number(e.target.value) || 1,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-rose-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-xs">
                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoDraft.autoPauseOnBudgetExhausted}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({ ...p, autoPauseOnBudgetExhausted: e.target.checked }));
                    }}
                    className="accent-emerald-500"
                  />
                  <span className="text-slate-200">
                    Auto-Turn OFF Welcome Bonus when Budget / 1h / 24h Cap Hits
                  </span>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoDraft.requireRealDepositToWithdrawPromo}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        requireRealDepositToWithdrawPromo: e.target.checked,
                      }));
                    }}
                    className="accent-emerald-500"
                  />
                  <span className="text-slate-200">
                    Admin Withdrawal Audit Flag: Alert Admin Until Real $${liveEconomyConfig.minDepositUsd.toFixed(2)}+ Deposit &amp; {promoDraft.promoPlaythroughMultiplier}x Rollover (Hidden from Users)
                  </span>
                </label>

                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-emerald-200/90">
                  <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    Zero-User-Exposure Mode Active: Players see normal unified tokens everywhere; Real vs Unbacked audits appear strictly inside Admin Dashboard.
                  </span>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoDraft.blockSameIpMultiSignupBonus}
                    onChange={(e) => {
                      setPromoConfigDirty(true);
                      setPromoDraft((p) => ({
                        ...p,
                        blockSameIpMultiSignupBonus: e.target.checked,
                      }));
                    }}
                    className="accent-emerald-500"
                  />
                  <span className="text-slate-200">
                    Block Same-IP Multi-Account Signup &amp; Referral Bonus Farming
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-400">
                  {promoConfigDirty
                    ? 'Unsaved guardrail edits — click Save Guardrails to apply.'
                    : `Last updated ${livePromoConfig.updatedAt ? new Date(livePromoConfig.updatedAt).toLocaleString() : 'Default'}`}
                </span>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  Save Guardrails &amp; Limits
                </button>
              </div>
            </form>

            {/* Right 4 cols: Free-Token Mint Budget Reserve Pool */}
            <div className="lg:col-span-4 rounded-xl border border-amber-500/35 bg-[#131A26] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-amber-400" />
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Free-Token Mint Budget Reserve
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every {promoDraft.welcomeBonusTokens.toLocaleString()} TKN welcome grant and {(promoDraft.referralBonusTokens * 2).toLocaleString()} TKN referral pair mints from this reserve ceiling. When the reserve empties, free token minting automatically stops.
              </p>

              <div className="rounded-xl border border-amber-500/30 bg-[#0B0F17] p-4 space-y-1">
                <div className="text-[11px] text-slate-400">Remaining Promo Mint Budget</div>
                <div className="font-mono-tabular text-2xl font-bold text-amber-300">
                  {livePromoSummary.budgetPoolTokens.toLocaleString()} TKN
                </div>
                <div className="font-mono-tabular text-xs text-emerald-400">
                  {TokenEconomy.formatUsd(livePromoSummary.budgetPoolTokens)} USD Ceiling
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Amount (TKN)</label>
                  <input
                    type="number"
                    min={1}
                    step={Math.max(1, liveEconomyConfig.tokensPerUsd)}
                    value={promoBudgetAmount}
                    onChange={(e) => setPromoBudgetAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Treasury Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Monthly marketing promo budget"
                    value={promoBudgetNote}
                    onChange={(e) => setPromoBudgetNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustPromoBudget('TOPUP')}
                    className="rounded-lg bg-emerald-500 px-3 py-2 font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    + Add Budget
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleAdjustPromoBudget('REDUCE')}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                  >
                    - Reduce Budget
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Separate Accounts Holding / Sharing Free Tokens (Compliance Notes & Revoke) */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Accounts Receiving / Sharing Free Tokens ({promoAccounts.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Separate tracking &amp; compliance notes for every account holding unbacked free tokens, referred pairs, shared-IP rings, or zero-deposit bonus farmers.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user, IP hash, note..."
                  value={promoUserSearch}
                  onChange={(e) => setPromoUserSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            {promoAccounts.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No accounts have claimed or shared free tokens yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Account &amp; Shared Link / IP</th>
                      <th className="px-3 py-2.5 font-medium">Risk Flag</th>
                      <th className="px-3 py-2.5 font-medium text-right">Free Granted / Rem</th>
                      <th className="px-3 py-2.5 font-medium text-right">Real Dep / Rollover</th>
                      <th className="px-3 py-2.5 font-medium">Separate Admin Note</th>
                      <th className="px-3 py-2.5 font-medium text-right">Revoke / Burn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {promoAccounts
                      .filter((u) => {
                        const q = promoUserSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          u.username.toLowerCase().includes(q) ||
                          (u.referredByUsername ?? '').toLowerCase().includes(q) ||
                          (u.signupIpHash ?? '').toLowerCase().includes(q) ||
                          (u.promoAdminNote ?? '').toLowerCase().includes(q) ||
                          (u.promoRiskFlag ?? '').toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const noteVal = promoNoteDraftByUser[u.id] ?? u.promoAdminNote ?? '';
                        const flagVal: PromoRiskFlag =
                          promoFlagDraftByUser[u.id] ?? u.promoRiskFlag ?? 'NONE';
                        return (
                          <tr key={u.id} className="align-top">
                            <td className="px-3 py-2.5 space-y-0.5">
                              <div className="font-semibold text-slate-100">@{u.username}</div>
                              <div className="text-[11px] text-slate-400">
                                {u.referredByUsername
                                  ? `Referred by @${u.referredByUsername}`
                                  : 'Direct Signup'}
                              </div>
                              {u.signupIpHash && (
                                <div className="font-mono-tabular text-[10px] text-slate-500">
                                  IP Hash: {u.signupIpHash}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={flagVal}
                                onChange={(e) =>
                                  setPromoFlagDraftByUser((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value as PromoRiskFlag,
                                  }))
                                }
                                className={`rounded border px-2 py-1 font-mono-tabular text-[11px] font-semibold bg-[#131A26] ${
                                  flagVal === 'SHARED_IP_RING' || flagVal === 'MAX_REFERRAL_CAP'
                                    ? 'border-rose-500/50 text-rose-300'
                                    : flagVal === 'NO_DEPOSIT_FARMER'
                                    ? 'border-amber-500/50 text-amber-300'
                                    : 'border-slate-700 text-slate-300'
                                }`}
                              >
                                <option value="NONE">NONE</option>
                                <option value="NO_DEPOSIT_FARMER">NO_DEPOSIT_FARMER</option>
                                <option value="SHARED_IP_RING">SHARED_IP_RING</option>
                                <option value="MAX_REFERRAL_CAP">MAX_REFERRAL_CAP</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono-tabular whitespace-nowrap">
                              <div className="text-sky-300 font-semibold">
                                +{(u.promoTokensGrantedTotal ?? 0).toLocaleString()} TKN
                              </div>
                              <div className="text-[11px] text-amber-300">
                                Unbacked Rem: {(u.promoTokensRemaining ?? 0).toLocaleString()}
                              </div>
                              {(u.promoRealizedLossTokens ?? 0) > 0 && (
                                <div className="text-[10px] text-rose-400">
                                  Bot Damage: -{(u.promoRealizedLossTokens ?? 0).toLocaleString()}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono-tabular whitespace-nowrap">
                              <div className="text-emerald-400 font-semibold">
                                {(u.realDepositedTokens ?? 0).toLocaleString()} TKN
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Wagered: {(u.promoTokensWagered ?? 0).toLocaleString()}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 min-w-[240px]">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Add separate fraud / tracking note..."
                                  value={noteVal}
                                  onChange={(e) =>
                                    setPromoNoteDraftByUser((prev) => ({
                                      ...prev,
                                      [u.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded border border-slate-700 bg-[#131A26] px-2.5 py-1 text-[11px] text-slate-100"
                                />
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleSaveUserPromoNote(u)}
                                  className="shrink-0 rounded bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-600 cursor-pointer"
                                >
                                  Save Note
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  placeholder={String(u.promoTokensRemaining ?? 0)}
                                  value={promoRevokeAmountByUser[u.id] ?? ''}
                                  onChange={(e) =>
                                    setPromoRevokeAmountByUser((prev) => ({
                                      ...prev,
                                      [u.id]: e.target.value,
                                    }))
                                  }
                                  className="w-16 rounded border border-slate-700 bg-[#131A26] px-2 py-1 font-mono-tabular text-[11px] text-slate-100"
                                />
                                <button
                                  type="button"
                                  disabled={actionBusy || (u.promoTokensRemaining ?? 0) <= 0}
                                  onClick={() => void handleRevokeUserPromo(u)}
                                  className="rounded border border-rose-500/45 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
                                >
                                  Revoke Free
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Referral Associations Table */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Invite &amp; Earn Referral Graph ({promoReferrals.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Every referrer → friend pair and whether the ${' '}
                  {(livePromoConfig.referralMinDepositTokens / Math.max(1, liveEconomyConfig.tokensPerUsd)).toFixed(2)} ({livePromoConfig.referralMinDepositTokens} TKN) deposit bonus was issued.
                </p>
              </div>
            </div>
            {promoReferrals.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No referral pairs registered yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Joined</th>
                      <th className="px-3 py-2.5 font-medium">Referrer</th>
                      <th className="px-3 py-2.5 font-medium">Invited Friend</th>
                      <th className="px-3 py-2.5 font-medium text-right">Qualifying Deposit</th>
                      <th className="px-3 py-2.5 font-medium text-right">Bonus Paid (Both)</th>
                      <th className="px-3 py-2.5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {promoReferrals.slice(0, 60).map((r) => (
                      <tr key={r.id} className="h-10">
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-semibold text-amber-300">@{r.referrerUsername}</td>
                        <td className="px-3 py-2 font-semibold text-slate-100">@{r.refereeUsername}</td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-300">
                          {r.qualifyingDepositTokens > 0
                            ? `${r.qualifyingDepositTokens.toLocaleString()} TKN`
                            : 'Pending'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-emerald-400">
                          {r.status === 'REWARDED'
                            ? `+${r.referrerRewardTokens} / +${r.refereeRewardTokens} TKN`
                            : '0 TKN'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${
                              r.status === 'REWARDED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Separate Fake / Free Token Loss Ledger (promo_token_ledger) */}
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Separate Fake / Free Token Loss Ledger (promo_token_ledger)
                </h3>
                <p className="text-xs text-slate-400">
                  Isolated audit trail recording every free mint, bot-pool loss damage, cashout leakage, burn, and admin revocation — completely separate from real platform revenue.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportPromoLedgerCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-amber-300" />
                Export Promo Ledger CSV ({promoLedger.length})
              </button>
            </div>

            {promoLedger.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
                No free-token events logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Event Kind</th>
                      <th className="px-3 py-2.5 font-medium">Account</th>
                      <th className="px-3 py-2.5 font-medium text-right">Tokens</th>
                      <th className="px-3 py-2.5 font-medium text-right">System Impact</th>
                      <th className="px-3 py-2.5 font-medium text-right">Unbacked After</th>
                      <th className="px-3 py-2.5 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {promoLedger.slice(0, 100).map((row) => (
                      <tr key={row.id} className="h-10">
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-mono-tabular text-[11px] text-amber-300 whitespace-nowrap">
                          {row.kind}
                        </td>
                        <td className="px-3 py-2 text-slate-100">
                          @{row.username}
                          {row.relatedUsername ? (
                            <span className="text-slate-400"> ↔ @{row.relatedUsername}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-200">
                          {row.tokenAmount.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono-tabular font-semibold ${
                            row.realLiabilityImpactTokens < 0
                              ? 'text-rose-400'
                              : row.realLiabilityImpactTokens > 0
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.realLiabilityImpactTokens > 0
                            ? `+${row.realLiabilityImpactTokens.toLocaleString()} saved`
                            : row.realLiabilityImpactTokens < 0
                            ? `${row.realLiabilityImpactTokens.toLocaleString()} loss`
                            : '0'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-sky-300">
                          {row.unbackedCirculationAfter.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'database' && (
        <AdminDatabaseTab
          serverStore={serverStore}
          onError={onError}
          onSuccess={showSuccess}
        />
      )}

      {/* USER 360° INSPECTOR MODAL */}
      {inspectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setInspectedUserId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border border-slate-700 bg-[#131A26] shadow-2xl overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0E1420] px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-slate-50">
                    @{inspectedUser.username}
                  </h2>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono-tabular text-slate-300">
                    {inspectedUser.role}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-mono-tabular font-semibold ${
                      inspectedUser.status === UserStatus.ACTIVE
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {inspectedUser.status}
                  </span>
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-mono-tabular text-amber-300">
                    KYC: {inspectedUser.kycStatus ?? KycStatus.UNVERIFIED}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {inspectedUser.displayName} · {inspectedUser.email} · Avail{' '}
                  <strong className="text-emerald-400 font-mono-tabular">
                    {inspectedUser.availableBalance.toLocaleString()} TKN
                  </strong>{' '}
                  · Held{' '}
                  <strong className="text-amber-300 font-mono-tabular">
                    {inspectedUser.heldBalance.toLocaleString()} TKN
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTopUpUserId(inspectedUser.id);
                    setInspectedUserId(null);
                    setSubTab('payments');
                  }}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  Quick Top-Up
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedUserId(null)}
                  className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-slate-800 bg-[#0B0F17] px-5 py-2 text-xs">
              {(
                [
                  { id: 'profile', label: 'Profile, Payouts & Payments' },
                  {
                    id: 'ledger',
                    label: `Wallet Ledger (${inspectedUser.transactions?.length ?? 0})`,
                  },
                  {
                    id: 'bets',
                    label: `All Bets History (${inspectedUserBets.length})`,
                  },
                ] as { id: UserModalTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setUserModalTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${
                    userModalTab === tab.id
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {userModalTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 space-y-2">
                    <h3 className="font-semibold text-slate-200">Identity &amp; Compliance</h3>
                    <div className="space-y-1 text-slate-400">
                      <div>Country: {inspectedUser.country || '—'}</div>
                      <div>Phone: {inspectedUser.phoneNumber || '—'}</div>
                      <div>Date of Birth: {inspectedUser.dateOfBirth || '—'}</div>
                      <div>Age Verified: {inspectedUser.ageVerified ? 'Yes' : 'No'}</div>
                      <div>
                        Daily Bet Limit:{' '}
                        {inspectedUser.dailyBetLimitTokens
                          ? `${inspectedUser.dailyBetLimitTokens.toLocaleString()} TKN`
                          : 'Unlimited'}
                      </div>
                      <div>Joined: {new Date(inspectedUser.createdAt).toLocaleString()}</div>
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <div className="text-amber-300 font-semibold">
                          Free / Unbacked Promo Tracking
                        </div>
                        <div>
                          Granted: {(inspectedUser.promoTokensGrantedTotal ?? 0).toLocaleString()} TKN · Remaining:{' '}
                          {(inspectedUser.promoTokensRemaining ?? 0).toLocaleString()} TKN
                        </div>
                        <div>
                          Real Deposited: {(inspectedUser.realDepositedTokens ?? 0).toLocaleString()} TKN · Wagered:{' '}
                          {(inspectedUser.promoTokensWagered ?? 0).toLocaleString()} TKN
                        </div>
                        <div>
                          Promo Risk Flag:{' '}
                          <span className="font-mono-tabular text-slate-200">
                            {inspectedUser.promoRiskFlag ?? 'NONE'}
                          </span>
                          {inspectedUser.referredByUsername
                            ? ` · Referred by @${inspectedUser.referredByUsername}`
                            : ''}
                        </div>
                        {inspectedUser.promoAdminNote && (
                          <div className="text-rose-300">
                            Compliance Note: {inspectedUser.promoAdminNote}
                          </div>
                        )}
                      </div>
                    </div>
                    {inspectedUser.kycDocumentDataUrl && (
                      <div className="pt-2 space-y-2 border-t border-slate-800">
                        <div className="text-amber-300 font-medium">
                          KYC Document: {inspectedUser.kycDocumentName || 'Submitted ID'}
                        </div>
                        <img
                          src={inspectedUser.kycDocumentDataUrl}
                          alt="KYC Preview"
                          referrerPolicy="no-referrer"
                          className="max-h-40 rounded border border-slate-700 object-contain"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleReviewKyc(inspectedUser.id, true)}
                            className="rounded bg-emerald-500 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                          >
                            Approve KYC
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleReviewKyc(inspectedUser.id, false)}
                            className="rounded border border-rose-500/40 px-3 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                          >
                            Reject KYC
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-200">Saved Payout Methods</h3>
                      <div className="mt-1.5 space-y-1.5 text-slate-400">
                        <div>
                          <span className="text-slate-300">USDT (TRC-20):</span>{' '}
                          <span className="font-mono-tabular text-amber-300">
                            {inspectedUser.savedCryptoAddress || 'Not saved'}
                          </span>
                        </div>
                        {inspectedUser.savedBankDetails ? (
                          <div className="rounded border border-slate-800 bg-[#131A26] p-2.5 space-y-0.5">
                            <div className="text-slate-200 font-medium">
                              {inspectedUser.savedBankDetails.bankName} ({inspectedUser.savedBankDetails.branch})
                            </div>
                            <div>Holder: {inspectedUser.savedBankDetails.accountHolder}</div>
                            <div className="font-mono-tabular text-emerald-400">
                              Acc: {inspectedUser.savedBankDetails.accountNumber}
                            </div>
                          </div>
                        ) : (
                          <div>Bank Account: Not saved</div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <h3 className="font-semibold text-slate-200">
                        Payment Requests ({inspectedUserPayments.length})
                      </h3>
                      {inspectedUserPayments.length === 0 ? (
                        <div className="text-slate-500">No deposits or withdrawals yet.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {inspectedUserPayments.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between rounded border border-slate-800 bg-[#131A26] px-2.5 py-1.5"
                            >
                              <span>
                                {p.kind} · {p.tokenAmount.toLocaleString()} TKN ({p.method})
                              </span>
                              <span className="font-mono-tabular text-[11px] text-amber-300">
                                {p.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {userModalTab === 'ledger' && (
                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                  {(inspectedUser.transactions?.length ?? 0) === 0 ? (
                    <div className="p-4 text-slate-400">No wallet transactions recorded yet.</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="px-3 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium text-right">Amount</th>
                          <th className="px-3 py-2 font-medium text-right">Avail After</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {(inspectedUser.transactions ?? []).map((tx) => (
                          <tr key={tx.id} className="h-9">
                            <td className="px-3 py-1.5 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                              {new Date(tx.createdAt).toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 font-mono-tabular text-[11px] text-amber-300">
                              {tx.type}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono-tabular font-semibold ${
                                tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-300'
                              }`}
                            >
                              {tx.amount >= 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono-tabular text-slate-300">
                              {tx.balanceAfter.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-slate-300">{tx.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {userModalTab === 'bets' && (
                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
                  {inspectedUserBets.length === 0 ? (
                    <div className="p-4 text-slate-400">
                      No bets found for @{inspectedUser.username} across current Dice sessions.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="px-3 py-2 font-medium">Channel</th>
                          <th className="px-3 py-2 font-medium">Event / Room</th>
                          <th className="px-3 py-2 font-medium">Selection</th>
                          <th className="px-3 py-2 font-medium text-right">Stake</th>
                          <th className="px-3 py-2 font-medium text-right">Payout</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {inspectedUserBets.map((bet) => (
                          <tr key={bet.id} className="h-9">
                            <td className="px-3 py-1.5 font-mono-tabular text-[11px] text-amber-300">
                              {bet.channel}
                            </td>
                            <td className="px-3 py-1.5 text-slate-200">{bet.title}</td>
                            <td className="px-3 py-1.5 text-slate-300">{bet.selection}</td>
                            <td className="px-3 py-1.5 text-right font-mono-tabular text-slate-200">
                              {bet.stake.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono-tabular text-emerald-400">
                              {bet.payout > 0 ? `+${bet.payout.toLocaleString()}` : '0'}
                            </td>
                            <td className="px-3 py-1.5 font-mono-tabular text-[11px] text-sky-300">
                              {bet.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document / Payment Slip Inspection Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#131A26] p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              referrerPolicy="no-referrer"
              className="max-h-[75vh] w-full rounded-lg border border-slate-800 bg-[#0B0F17] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
