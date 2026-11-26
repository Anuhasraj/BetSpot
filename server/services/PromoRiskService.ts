import crypto from 'crypto';
import { UserReferralSummary } from '../../src/domain/PromoTypes';
import { TransactionType } from '../../src/domain/types';
import { User } from '../../src/domain/User';
import {
  CommitChangesFn,
  PlatformStoreData,
  ServerPromoLedgerEntry,
  ServerPromoRiskSummary,
  ServerStoredUser,
} from '../ServerTypes';
import { AuditAndAlertLedger } from './AuditAndAlertLedger';

export class PromoRiskService {
  constructor(
    private readonly store: PlatformStoreData,
    private readonly users: Map<string, User>,
    private readonly ledger: AuditAndAlertLedger,
    private readonly commitChanges: CommitChangesFn
  ) {}

  public getUnbackedCirculationTokens(): number {
    return this.store.users
      .filter((u) => !u.isBot)
      .reduce((sum, u) => sum + Math.max(0, u.promoTokensRemaining ?? 0), 0);
  }

  public appendPromoLedger(
    entry: Omit<
      ServerPromoLedgerEntry,
      'id' | 'budgetRemainingAfter' | 'unbackedCirculationAfter' | 'createdAt'
    >
  ): void {
    const now = Date.now();
    this.store.promoTokenLedger.unshift({
      ...entry,
      id: `prl_${now}_${crypto.randomBytes(3).toString('hex')}`,
      budgetRemainingAfter: this.store.promoPoolBudgetTokens,
      unbackedCirculationAfter: this.getUnbackedCirculationTokens(),
      createdAt: now,
    });
    if (this.store.promoTokenLedger.length > 600) {
      this.store.promoTokenLedger = this.store.promoTokenLedger.slice(0, 600);
    }
  }

  public computeSummary(now = Date.now()): ServerPromoRiskSummary {
    const hourCutoff = now - 60 * 60 * 1000;
    const dayCutoff = now - 24 * 60 * 60 * 1000;

    let signupMintedTokens = 0;
    let referralMintedTokens = 0;
    let hourlyMintedTokens = 0;
    let dailyMintedTokens = 0;
    let burnedOrRecoveredTokens = 0;
    let systemLossToBotPoolTokens = 0;
    let realWithdrawalLeakageTokens = 0;

    for (const row of this.store.promoTokenLedger) {
      if (row.kind === 'WELCOME_MINT') {
        signupMintedTokens += row.tokenAmount;
        if (row.createdAt >= dayCutoff) dailyMintedTokens += row.tokenAmount;
        if (row.createdAt >= hourCutoff) hourlyMintedTokens += row.tokenAmount;
      } else if (row.kind === 'REFERRAL_MINT') {
        referralMintedTokens += row.tokenAmount;
        if (row.createdAt >= dayCutoff) dailyMintedTokens += row.tokenAmount;
        if (row.createdAt >= hourCutoff) hourlyMintedTokens += row.tokenAmount;
      } else if (row.kind === 'PROMO_PLAY_BURNED' || row.kind === 'PROMO_REVOKED') {
        burnedOrRecoveredTokens += row.tokenAmount;
      } else if (row.kind === 'PROMO_PLAY_LOSS_TO_SYSTEM') {
        systemLossToBotPoolTokens += row.tokenAmount;
      } else if (row.kind === 'PROMO_WITHDRAWAL_LEAKAGE') {
        realWithdrawalLeakageTokens += row.tokenAmount;
      }
    }

    const totalMintedTokens = signupMintedTokens + referralMintedTokens;
    const unbackedCirculationTokens = this.getUnbackedCirculationTokens();
    const netUnbackedExposureTokens =
      unbackedCirculationTokens + systemLossToBotPoolTokens + realWithdrawalLeakageTokens;
    const promoHoldersCount = this.store.users.filter(
      (u) => !u.isBot && (u.promoTokensGrantedTotal ?? 0) > 0
    ).length;
    const sharedIpFlaggedCount = this.store.users.filter(
      (u) => !u.isBot && u.promoRiskFlag === 'SHARED_IP_RING'
    ).length;

    let autoPausedReason: string | null = null;
    if (this.store.promoPoolBudgetTokens < Math.max(1, this.store.promoConfig.welcomeBonusTokens)) {
      autoPausedReason = `Global free-token mint reserve exhausted (${this.store.promoPoolBudgetTokens.toLocaleString()} TKN remaining)`;
    } else if (dailyMintedTokens >= this.store.promoConfig.dailyPromoMintCapTokens) {
      autoPausedReason = `24h free-token mint cap reached (${dailyMintedTokens.toLocaleString()} / ${this.store.promoConfig.dailyPromoMintCapTokens.toLocaleString()} TKN)`;
    } else if (hourlyMintedTokens >= this.store.promoConfig.hourlyPromoMintCapTokens) {
      autoPausedReason = `1h free-token mint cap reached (${hourlyMintedTokens.toLocaleString()} / ${this.store.promoConfig.hourlyPromoMintCapTokens.toLocaleString()} TKN)`;
    }

    return {
      budgetPoolTokens: this.store.promoPoolBudgetTokens,
      totalMintedTokens,
      signupMintedTokens,
      referralMintedTokens,
      hourlyMintedTokens,
      dailyMintedTokens,
      unbackedCirculationTokens,
      burnedOrRecoveredTokens,
      systemLossToBotPoolTokens,
      realWithdrawalLeakageTokens,
      netUnbackedExposureTokens,
      promoHoldersCount,
      sharedIpFlaggedCount,
      isBudgetAutoPaused: autoPausedReason !== null,
      autoPausedReason,
    };
  }

  public generateUniqueReferralCode(_username?: string, excludeUserId?: string): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const taken = new Set(
      this.store.users
        .filter((u) => u.id !== excludeUserId && typeof u.referralCode === 'string' && u.referralCode.trim())
        .map((u) => u.referralCode!.toUpperCase())
    );
    for (let attempt = 0; attempt < 2000; attempt++) {
      const bytes = crypto.randomBytes(8);
      let candidate = '';
      for (let i = 0; i < 8; i++) {
        candidate += chars[bytes[i] % chars.length];
      }
      if (!taken.has(candidate)) return candidate;
    }
    return `BS${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  public resolveReferrerByCode(
    rawCode: unknown,
    excludeUserId?: string,
    excludeEmail?: string
  ): ServerStoredUser | null {
    if (typeof rawCode !== 'string') return null;
    const clean = rawCode.trim().replace(/^@/, '').toUpperCase();
    if (clean.length < 2 || clean.length > 32) return null;
    const normalizedEmail = typeof excludeEmail === 'string' ? excludeEmail.trim().toLowerCase() : '';
    for (const u of this.store.users) {
      if (u.isBot) continue;
      if (excludeUserId && u.id === excludeUserId) continue;
      if (normalizedEmail && u.email && u.email.trim().toLowerCase() === normalizedEmail) continue;
      if (
        (u.referralCode && u.referralCode.toUpperCase() === clean) ||
        u.username.toUpperCase() === clean
      ) {
        return u;
      }
    }
    return null;
  }

  public buildUserReferralSummary(user: ServerStoredUser): UserReferralSummary {
    const code = user.referralCode || this.generateUniqueReferralCode(user.username, user.id);
    const invited = this.store.referrals.filter((r) => r.referrerUserId === user.id);
    const qualified = invited.filter((r) => r.status === 'REWARDED');
    const pending = invited.filter((r) => r.status === 'PENDING_DEPOSIT');
    const myInbound = this.store.referrals.find((r) => r.refereeUserId === user.id);
    const earnedFromInvites = qualified.reduce((sum, r) => sum + r.referrerRewardTokens, 0);
    const earnedAsFriend = myInbound?.status === 'REWARDED' ? myInbound.refereeRewardTokens : 0;

    return {
      referralCode: code,
      totalInvited: invited.length,
      pendingCount: pending.length,
      qualifiedCount: qualified.length,
      totalEarnedTokens: earnedFromInvites + earnedAsFriend,
      referredByUsername: user.referredByUsername ?? myInbound?.referrerUsername,
      referredByCode: user.referredByCode ?? myInbound?.referrerCode,
      myReferralStatus: myInbound?.status,
      referrals: invited.slice(0, 50),
    };
  }

  public evaluateSignupWelcomeBonus(params: {
    userId: string;
    username: string;
    ipHash: string;
    now: number;
  }): {
    grantWelcome: boolean;
    welcomeTokens: number;
    welcomeBlockReason?: string;
    userRiskFlag: ServerStoredUser['promoRiskFlag'];
    userNote?: string;
  } {
    let grantWelcome =
      this.store.promoConfig.welcomeBonusEnabled && this.store.promoConfig.welcomeBonusTokens > 0;
    let welcomeTokens = grantWelcome ? this.store.promoConfig.welcomeBonusTokens : 0;
    let welcomeBlockReason: string | undefined;
    let userRiskFlag: ServerStoredUser['promoRiskFlag'] = 'NONE';
    let userNote: string | undefined;

    if (grantWelcome) {
      const promoSummary = this.computeSummary(params.now);
      if (
        this.store.promoPoolBudgetTokens < welcomeTokens ||
        promoSummary.dailyMintedTokens + welcomeTokens > this.store.promoConfig.dailyPromoMintCapTokens ||
        promoSummary.hourlyMintedTokens + welcomeTokens > this.store.promoConfig.hourlyPromoMintCapTokens
      ) {
        grantWelcome = false;
        welcomeTokens = 0;
        welcomeBlockReason = 'Free-token mint budget or daily/hourly cap exhausted';
        if (this.store.promoConfig.autoPauseOnBudgetExhausted) {
          this.store.promoConfig.welcomeBonusEnabled = false;
        }
        this.ledger.appendRiskAlert(
          {
            type: 'PROMO_BUDGET_CAP_HIT',
            severity: 'CRITICAL',
            userId: params.userId,
            username: params.username,
            title: 'Free Welcome Bonus Paused — Budget / Cap Hit',
            details: `${welcomeBlockReason}.`,
            metrics: {
              budgetRemaining: this.store.promoPoolBudgetTokens,
              dailyMinted: promoSummary.dailyMintedTokens,
              hourlyMinted: promoSummary.hourlyMintedTokens,
            },
          },
          180_000
        );
      } else if (this.store.promoConfig.blockSameIpMultiSignupBonus && params.ipHash) {
        const sameIpBonusCount = this.store.users.filter(
          (u) => !u.isBot && u.signupIpHash === params.ipHash && (u.promoTokensGrantedTotal ?? 0) > 0
        ).length;
        if (sameIpBonusCount >= this.store.promoConfig.maxSignupBonusesPerIp) {
          grantWelcome = false;
          welcomeTokens = 0;
          welcomeBlockReason = `Same-IP free bonus cap reached (${sameIpBonusCount}/${this.store.promoConfig.maxSignupBonusesPerIp})`;
          userRiskFlag = 'SHARED_IP_RING';
          userNote = `Auto-blocked free welcome tokens (${welcomeBlockReason})`;
          this.ledger.appendRiskAlert(
            {
              type: 'PROMO_IP_CLUSTER_ALERT',
              severity: 'WARNING',
              userId: params.userId,
              username: params.username,
              title: `Shared-IP Multi-Account Bonus Blocked: @${params.username}`,
              details: `IP cluster (${params.ipHash}) already claimed ${sameIpBonusCount} free welcome bonuses.`,
              metrics: { ipHash: params.ipHash, existingSignups: sameIpBonusCount },
            },
            120_000
          );
        }
      }
    }

    if (grantWelcome && welcomeTokens > 0) {
      this.store.promoPoolBudgetTokens = Math.max(0, this.store.promoPoolBudgetTokens - welcomeTokens);
    }

    return { grantWelcome, welcomeTokens, welcomeBlockReason, userRiskFlag, userNote };
  }

  public recordOutcomes(
    roomLabel: string,
    humans: { userId: string; stakeTokens: number; payoutTokens: number; hasBotOpponent: boolean }[]
  ): void {
    for (const h of humans) {
      const user = this.store.users.find((u) => u.id === h.userId);
      if (!user) continue;
      const promoRem = Math.max(0, user.promoTokensRemaining ?? 0);
      const promoTotal = Math.max(0, user.promoTokensGrantedTotal ?? 0);
      if (promoRem === 0 && promoTotal === 0) continue;

      user.promoTokensWagered = (user.promoTokensWagered ?? 0) + h.stakeTokens;
      const promoStakeUsed = Math.min(promoRem, h.stakeTokens);

      if (h.payoutTokens <= 0) {
        if (promoStakeUsed > 0) {
          user.promoTokensRemaining = Math.max(0, promoRem - promoStakeUsed);
          this.appendPromoLedger({
            kind: 'PROMO_PLAY_BURNED',
            userId: user.id,
            username: user.username,
            relatedUsername: h.hasBotOpponent ? 'BotLiquidityPool' : 'P2P Winner',
            tokenAmount: promoStakeUsed,
            realLiabilityImpactTokens: 0,
            note: `${roomLabel}: ${promoStakeUsed.toLocaleString()} free promo TKN lost & burned out of circulation`,
          });
        }
      } else {
        const netGain = Math.max(0, h.payoutTokens - h.stakeTokens);
        if (h.hasBotOpponent && netGain > 0 && promoStakeUsed > 0) {
          const promoRatio = promoStakeUsed / Math.max(1, h.stakeTokens);
          const lossTokens = Math.max(1, Math.round(netGain * promoRatio));
          user.promoRealizedLossTokens = (user.promoRealizedLossTokens ?? 0) + lossTokens;
          this.appendPromoLedger({
            kind: 'PROMO_PLAY_LOSS_TO_SYSTEM',
            userId: user.id,
            username: user.username,
            relatedUsername: 'BotLiquidityPool',
            tokenAmount: lossTokens,
            realLiabilityImpactTokens: -lossTokens,
            note: `${roomLabel}: Bonus-funded stake won +${lossTokens.toLocaleString()} TKN against Bot Pool`,
          });
        }
      }

      if (
        (user.promoTokensGrantedTotal ?? 0) >= 200 &&
        (user.realDepositedTokens ?? 0) === 0 &&
        (!user.promoRiskFlag || user.promoRiskFlag === 'NONE')
      ) {
        user.promoRiskFlag = 'NO_DEPOSIT_FARMER';
      }
    }
  }

  public tryGrantReferralBonusForDeposit(
    depositorUserId: string,
    depositTokens: number,
    paymentRefId: string
  ): {
    awarded: boolean;
    reason?: string;
    rewardTokens: number;
    referrerUserId?: string;
    referrerUsername?: string;
    refereeUsername?: string;
  } {
    if (!this.store.promoConfig.referralProgramEnabled) {
      return { awarded: false, rewardTokens: 0, reason: 'Referral program is paused by Admin' };
    }
    const rewardTokens = this.store.promoConfig.referralBonusTokens;
    const minDeposit = this.store.promoConfig.referralMinDepositTokens;
    if (rewardTokens <= 0 || depositTokens < minDeposit) {
      return { awarded: false, rewardTokens: 0 };
    }

    const referral = this.store.referrals.find(
      (r) => r.refereeUserId === depositorUserId && r.status === 'PENDING_DEPOSIT'
    );
    if (!referral) return { awarded: false, rewardTokens: 0 };

    const referrer = this.store.users.find((u) => u.id === referral.referrerUserId);
    const referee = this.store.users.find((u) => u.id === referral.refereeUserId);
    const referrerDomain = referrer ? this.users.get(referrer.id) : undefined;
    const refereeDomain = referee ? this.users.get(referee.id) : undefined;
    if (!referrer || !referee || !referrerDomain || !refereeDomain || referrer.id === referee.id) {
      return { awarded: false, rewardTokens: 0 };
    }

    const now = Date.now();
    const rewardedCount = this.store.referrals.filter(
      (r) => r.referrerUserId === referrer.id && r.status === 'REWARDED'
    ).length;
    if (rewardedCount >= this.store.promoConfig.maxReferralsPerUser) {
      referrer.promoRiskFlag = 'MAX_REFERRAL_CAP';
      referrer.promoAdminNote =
        referrer.promoAdminNote ||
        `Reached max rewarded referrals cap (${this.store.promoConfig.maxReferralsPerUser})`;
      return {
        awarded: false,
        rewardTokens: 0,
        reason: `Referrer @${referrer.username} reached max ${this.store.promoConfig.maxReferralsPerUser} rewarded invites.`,
      };
    }

    if (
      this.store.promoConfig.blockSameIpMultiSignupBonus &&
      referrer.signupIpHash &&
      referee.signupIpHash &&
      referrer.signupIpHash === referee.signupIpHash
    ) {
      // Real deposit was verified and approved by Admin — log a shared-IP notice
      // for admin visibility, but do not withhold the earned referral reward.
      this.ledger.appendRiskAlert(
        {
          type: 'PROMO_IP_CLUSTER_ALERT',
          severity: 'INFO',
          userId: referee.id,
          username: referee.username,
          title: `Shared-IP Referral Deposit Approved: @${referrer.username} <-> @${referee.username}`,
          details: `Both accounts registered from matching IP hash (${referee.signupIpHash}), but referred deposit (${depositTokens.toLocaleString()} TKN) was verified and approved.`,
          metrics: { referrer: referrer.username, referee: referee.username, depositTokens },
        },
        120_000
      );
    }

    const totalMintCost = rewardTokens * 2;
    const promoSummary = this.computeSummary(now);
    if (
      this.store.promoPoolBudgetTokens < totalMintCost ||
      promoSummary.dailyMintedTokens + totalMintCost > this.store.promoConfig.dailyPromoMintCapTokens ||
      promoSummary.hourlyMintedTokens + totalMintCost > this.store.promoConfig.hourlyPromoMintCapTokens
    ) {
      if (this.store.promoConfig.autoPauseOnBudgetExhausted) {
        this.store.promoConfig.referralProgramEnabled = false;
      }
      this.ledger.appendRiskAlert(
        {
          type: 'PROMO_BUDGET_CAP_HIT',
          severity: 'CRITICAL',
          title: 'Promo Mint Budget / Cap Hit on Referral Reward',
          details: `Blocked +${totalMintCost.toLocaleString()} TKN referral mint for @${referrer.username} & @${referee.username}.`,
          metrics: {
            budgetRemaining: this.store.promoPoolBudgetTokens,
            dailyMinted: promoSummary.dailyMintedTokens,
          },
        },
        180_000
      );
      return { awarded: false, rewardTokens: 0, reason: 'Global promo mint budget or rate cap exhausted.' };
    }

    referral.status = 'REWARDED';
    referral.qualifyingDepositTokens = depositTokens;
    referral.qualifyingPaymentId = paymentRefId;
    referral.referrerRewardTokens = rewardTokens;
    referral.refereeRewardTokens = rewardTokens;
    referral.rewardedAt = now;

    this.store.promoPoolBudgetTokens = Math.max(0, this.store.promoPoolBudgetTokens - totalMintCost);

    const referrerRefId = `refbon_inv_${referral.id}`;
    const refereeRefId = `refbon_frd_${referral.id}`;

    referrerDomain.wallet.creditAvailable(
      rewardTokens,
      TransactionType.REFERRAL_BONUS,
      `Invite & Earn Bonus — @${referee.username} deposited ${depositTokens.toLocaleString()} TKN`,
      referrerRefId
    );
    referrer.availableBalance = referrerDomain.wallet.availableBalance;
    referrer.promoReferralTokensGranted = (referrer.promoReferralTokensGranted ?? 0) + rewardTokens;
    referrer.promoTokensGrantedTotal = (referrer.promoTokensGrantedTotal ?? 0) + rewardTokens;
    referrer.promoTokensRemaining = (referrer.promoTokensRemaining ?? 0) + rewardTokens;
    if ((referrer.realDepositedTokens ?? 0) === 0 && (!referrer.promoRiskFlag || referrer.promoRiskFlag === 'NONE')) {
      referrer.promoRiskFlag = 'NO_DEPOSIT_FARMER';
    }

    refereeDomain.wallet.creditAvailable(
      rewardTokens,
      TransactionType.REFERRAL_BONUS,
      `Invite & Earn Welcome Bonus — min $${(minDeposit / Math.max(1, this.store.economyConfig.tokensPerUsd)).toFixed(2)} deposit completed (referred by @${referrer.username})`,
      refereeRefId
    );
    referee.availableBalance = refereeDomain.wallet.availableBalance;
    referee.promoReferralTokensGranted = (referee.promoReferralTokensGranted ?? 0) + rewardTokens;
    referee.promoTokensGrantedTotal = (referee.promoTokensGrantedTotal ?? 0) + rewardTokens;
    referee.promoTokensRemaining = (referee.promoTokensRemaining ?? 0) + rewardTokens;

    this.appendPromoLedger({
      kind: 'REFERRAL_MINT',
      userId: referrer.id,
      username: referrer.username,
      relatedUsername: referee.username,
      tokenAmount: totalMintCost,
      realLiabilityImpactTokens: 0,
      note: `Invite & Earn qualified deposit (${depositTokens.toLocaleString()} TKN): +${rewardTokens} TKN to @${referrer.username} & +${rewardTokens} TKN to @${referee.username}`,
    });

    this.ledger.appendAudit(
      'SYSTEM_REFERRAL',
      'REFERRAL_REWARD_ISSUED',
      `@${referrer.username} <-> @${referee.username}`,
      `Deposit ${depositTokens.toLocaleString()} TKN qualified -> Credited +${rewardTokens} TKN each`
    );

    return {
      awarded: true,
      rewardTokens,
      referrerUserId: referrer.id,
      referrerUsername: referrer.username,
      refereeUsername: referee.username,
    };
  }

  public adminRevokePromoTokens(
    userId: string,
    requestedAmount: number,
    reason: string,
    adminUsername: string
  ): number {
    const su = this.store.users.find((u) => u.id === userId && !u.isBot);
    const domainUser = this.users.get(userId);
    if (!su || !domainUser) throw new Error('User not found.');

    const currentPromoRemaining = Math.max(0, su.promoTokensRemaining ?? 0);
    const targetRevoke =
      requestedAmount > 0
        ? Math.min(requestedAmount, domainUser.wallet.availableBalance)
        : Math.min(
            currentPromoRemaining > 0 ? currentPromoRemaining : domainUser.wallet.availableBalance,
            domainUser.wallet.availableBalance
          );

    if (targetRevoke <= 0) {
      throw new Error('User has 0 available promo/wallet tokens to revoke.');
    }

    domainUser.wallet.adjustAvailableByAdmin(
      -targetRevoke,
      'Platform wallet balance adjustment'
    );
    su.availableBalance = domainUser.wallet.availableBalance;
    su.promoTokensRemaining = Math.max(0, currentPromoRemaining - targetRevoke);
    su.promoRevokedTokens = (su.promoRevokedTokens ?? 0) + targetRevoke;
    su.pendingAdminCreditDelta = 0;
    su.promoAdminNote = su.promoAdminNote
      ? `${su.promoAdminNote} | Revoked ${targetRevoke} TKN (${reason})`
      : `Revoked ${targetRevoke} TKN (${reason})`;
    su.adminAdjustedAt = Date.now();

    this.appendPromoLedger({
      kind: 'PROMO_REVOKED',
      userId: su.id,
      username: su.username,
      relatedUsername: `@${adminUsername}`,
      tokenAmount: targetRevoke,
      realLiabilityImpactTokens: targetRevoke,
      note: `Admin clawed back ${targetRevoke.toLocaleString()} TKN from @${su.username} — ${reason}`,
    });
    this.ledger.appendAudit(
      adminUsername,
      'REVOKE_PROMO_TOKENS',
      `@${su.username}`,
      `Burned -${targetRevoke.toLocaleString()} unbacked TKN — ${reason}`
    );

    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
    return targetRevoke;
  }

  public isTierRestrictedForPurePromo(userId: string): boolean {
    if (!this.store.promoConfig.restrictPurePromoToTier1) return false;
    const su = this.store.users.find((u) => u.id === userId);
    return Boolean(su && (su.promoTokensRemaining ?? 0) > 0 && (su.realDepositedTokens ?? 0) === 0);
  }
}
