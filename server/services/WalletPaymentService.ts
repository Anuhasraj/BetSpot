import crypto from 'crypto';
import { PLATFORM_CRYPTO_DEPOSIT_ADDRESSES } from '../../src/domain/EconomyTypes';
import { TokenEconomy } from '../../src/domain/TokenEconomy';
import { PaymentMethod, PlatformIncomeRecord, TransactionType } from '../../src/domain/types';
import { User } from '../../src/domain/User';
import { sanitizeImageDataUrl } from '../security/SecurityServices';
import {
  CommitChangesFn,
  PlatformStoreData,
  ServerIncomeRecord,
  ServerPaymentRequest,
  ServerStoredUser,
} from '../ServerTypes';
import { AuditAndAlertLedger } from './AuditAndAlertLedger';
import { PromoRiskService } from './PromoRiskService';
import { UserAuthAccountService } from './UserAuthAccountService';

export class WalletPaymentService {
  constructor(
    private readonly store: PlatformStoreData,
    private readonly users: Map<string, User>,
    private readonly userService: UserAuthAccountService,
    private readonly promoService: PromoRiskService,
    private readonly ledger: AuditAndAlertLedger,
    private readonly commitChanges: CommitChangesFn
  ) {}

  public recordPlatformIncome(rec: PlatformIncomeRecord): void {
    if (rec.feeAmountTokens <= 0) return;
    if (this.store.incomeRecords.some((r) => r.id === rec.id)) return;
    const clean: ServerIncomeRecord = {
      id: rec.id,
      source: rec.source,
      boardOrEventId: rec.boardOrEventId,
      roomOrMatchLabel: rec.roomOrMatchLabel,
      userId: rec.userId,
      username: rec.username,
      isBotUser: rec.isBotUser,
      includesHumanParticipant: rec.includesHumanParticipant,
      grossAmountTokens: rec.grossAmountTokens,
      feeRate: rec.feeRate,
      feeAmountTokens: rec.feeAmountTokens,
      usdEquivalent: TokenEconomy.tokensToUsd(rec.feeAmountTokens),
      description: rec.description,
      createdAt: rec.createdAt,
    };
    this.store.incomeRecords.unshift(clean);
    if (this.store.incomeRecords.length > 500) {
      this.store.incomeRecords = this.store.incomeRecords.slice(0, 500);
    }
    this.store.incomeSummary.totalTokens += clean.feeAmountTokens;
    this.store.incomeSummary.recordCount += 1;
    if (clean.source === 'DICE_MAIN_FEE') this.store.incomeSummary.diceMainFeeTokens += clean.feeAmountTokens;
    else if (clean.source === 'SIDE_BET_FEE') this.store.incomeSummary.sideBetFeeTokens += clean.feeAmountTokens;
    else if (clean.source === 'SPECTATOR_ENTRY_FEE') this.store.incomeSummary.entryFeeTokens += clean.feeAmountTokens;
    if (clean.includesHumanParticipant) {
      this.store.incomeSummary.humanInvolvedFeeTokens += clean.feeAmountTokens;
    }
  }

  public enforceDailyBetLimit(user: User, additionalStake: number): void {
    const limit = user.dailyBetLimitTokens;
    if (!limit || limit <= 0) return;
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const startOfDayMs = dayStart.getTime();

    let holdsToday = 0;
    let refundsToday = 0;
    for (const tx of user.wallet.transactions) {
      if (tx.createdAt < startOfDayMs) continue;
      if (tx.type === TransactionType.BET_HOLD && !tx.description.startsWith('Withdrawal')) {
        holdsToday += Math.abs(tx.amount);
      } else if (
        tx.type === TransactionType.BET_REFUND &&
        !tx.description.startsWith('Rejected withdrawal')
      ) {
        refundsToday += Math.max(0, tx.amount);
      }
    }
    const wageredToday = Math.max(0, holdsToday - refundsToday);

    const roundedAdd = Math.max(0, Math.round(additionalStake));
    if (wageredToday + roundedAdd > limit) {
      throw new Error(
        `Daily responsible-play bet limit of ${limit.toLocaleString()} TKN reached (net wagered today: ${wageredToday.toLocaleString()} TKN).`
      );
    }
  }

  public requestCryptoDeposit(
    userId: string,
    usdAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC
  ): ServerPaymentRequest {
    const user = this.userService.requireActiveHumanUser(userId);
    if (!Number.isFinite(usdAmount) || usdAmount < TokenEconomy.MIN_DEPOSIT_USD) {
      throw new Error(
        `Minimum deposit is $${TokenEconomy.MIN_DEPOSIT_USD} USD (${TokenEconomy.MIN_DEPOSIT_TOKENS} TKN).`
      );
    }
    const lockedMethod = method === PaymentMethod.CRYPTO_USDC ? PaymentMethod.CRYPTO_USDT : method;
    const tokenAmount = TokenEconomy.usdToTokens(usdAmount);
    const localCurrencyEquivalent = TokenEconomy.tokensToLkr(tokenAmount);
    const referenceId = `DEP-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;
    const walletInfo = PLATFORM_CRYPTO_DEPOSIT_ADDRESSES[lockedMethod];
    const activeAddress =
      lockedMethod === PaymentMethod.CRYPTO_USDT
        ? this.store.contactConfig?.usdtDepositAddress?.trim() || walletInfo.address
        : walletInfo.address;

    const record: ServerPaymentRequest = {
      id: `pay_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId: user.id,
      username: user.username,
      kind: 'DEPOSIT',
      method: lockedMethod,
      tokenAmount,
      usdEquivalent: Number(usdAmount.toFixed(2)),
      localCurrencyEquivalent,
      referenceId,
      destinationOrBankDetails: `${walletInfo.networkLabel} · ${activeAddress}`,
      status: 'PENDING',
      createdAt: Date.now(),
    };

    this.store.payments.unshift(record);
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
    return record;
  }

  public attachDepositReceipt(
    userId: string,
    requestId: string,
    receiptName: string,
    receiptDataUrl: string
  ): ServerPaymentRequest {
    this.userService.requireActiveHumanUser(userId);
    const payment = this.store.payments.find((p) => p.id === requestId && p.userId === userId);
    if (!payment) {
      throw new Error('Deposit request not found.');
    }
    if (payment.kind !== 'DEPOSIT') {
      throw new Error('Payment slip can only be attached to a deposit request.');
    }
    if (payment.status !== 'PENDING') {
      throw new Error('Cannot upload or modify a payment slip after admin review.');
    }
    const safeImg = sanitizeImageDataUrl(receiptDataUrl);
    if (!safeImg) {
      throw new Error('Please upload a valid receipt image under 4 MB.');
    }
    payment.receiptPreviewName = String(receiptName || 'payment_slip.png').trim().slice(0, 120);
    payment.receiptDataUrl = safeImg;
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
    return payment;
  }

  public requestWithdrawal(
    userId: string,
    tokenAmount: number,
    method: PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC | PaymentMethod.SRI_LANKA_BANK,
    destinationDetails: string
  ): ServerPaymentRequest {
    const user = this.userService.requireActiveHumanUser(userId);
    const storedUser = this.store.users.find((u) => u.id === userId);
    if (method === PaymentMethod.SRI_LANKA_BANK && user.country !== 'Sri Lanka') {
      throw new Error('Local bank withdrawal is not available for your country.');
    }
    if (!Number.isFinite(tokenAmount)) {
      throw new Error('Invalid withdrawal token amount.');
    }
    const check = user.wallet.canWithdraw(tokenAmount);
    if (!check.allowed) {
      throw new Error(check.reason ?? 'Withdrawal denied.');
    }
    const cleanDest = String(destinationDetails ?? '').trim().slice(0, 240);
    if (!cleanDest) {
      throw new Error('Destination wallet address or bank account details are required.');
    }

    const rounded = Math.round(tokenAmount);
    const refId = `wd_${Date.now().toString(36).toUpperCase()}`;
    user.wallet.holdTokens(
      rounded,
      `Withdrawal pending approval (${method === PaymentMethod.SRI_LANKA_BANK ? 'Local Bank' : 'USDT TRC-20'})`,
      refId
    );

    const record: ServerPaymentRequest = {
      id: `pay_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId: user.id,
      username: user.username,
      kind: 'WITHDRAWAL',
      method,
      tokenAmount: rounded,
      usdEquivalent: TokenEconomy.tokensToUsd(rounded),
      localCurrencyEquivalent: TokenEconomy.tokensToLkr(rounded),
      referenceId: refId,
      destinationOrBankDetails: cleanDest,
      status: 'PENDING',
      createdAt: Date.now(),
    };
    this.store.payments.unshift(record);

    if (storedUser && (storedUser.promoTokensGrantedTotal ?? 0) > 0) {
      const realDep = storedUser.realDepositedTokens ?? 0;
      const prevWithdrawn = storedUser.realWithdrawnTokens ?? 0;
      const wagered = storedUser.promoTokensWagered ?? 0;
      const requiredWager =
        (storedUser.promoTokensGrantedTotal ?? 0) * this.store.promoConfig.promoPlaythroughMultiplier;
      const exceedsReal = prevWithdrawn + rounded > realDep;
      const hasRiskFlag = Boolean(storedUser.promoRiskFlag && storedUser.promoRiskFlag !== 'NONE');
      const missedRollover =
        this.store.promoConfig.requireRealDepositToWithdrawPromo &&
        (realDep < this.store.promoConfig.minRealDepositToUnlockTokens || wagered < requiredWager);

      if (exceedsReal || hasRiskFlag || missedRollover) {
        this.ledger.appendRiskAlert(
          {
            type: 'PROMO_WITHDRAWAL_REVIEW',
            severity: exceedsReal || hasRiskFlag ? 'CRITICAL' : 'WARNING',
            userId: storedUser.id,
            username: storedUser.username,
            title: `Bonus-Linked Withdrawal Review: @${storedUser.username} (${rounded.toLocaleString()} TKN)`,
            details: `Real Deposits: ${realDep.toLocaleString()} TKN · Free Granted: ${(storedUser.promoTokensGrantedTotal ?? 0).toLocaleString()} TKN · Wagered: ${wagered.toLocaleString()}/${requiredWager.toLocaleString()} TKN · Flag: ${storedUser.promoRiskFlag ?? 'NONE'}.`,
            metrics: {
              requestedTokens: rounded,
              realDepositedTokens: realDep,
              promoGrantedTokens: storedUser.promoTokensGrantedTotal ?? 0,
              wageredTokens: wagered,
            },
          },
          60_000
        );
      }
    }

    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
    return record;
  }

  public adminManualTopUp(params: {
    userId: string;
    amountTokens: number;
    reason: string;
    fundingSource: string;
    referenceCode: string;
    adminUsername: string;
  }): ServerStoredUser {
    const su = this.store.users.find((u) => u.id === params.userId);
    const domainUser = this.users.get(params.userId);
    if (!su || !domainUser) throw new Error('Target user not found.');
    if (params.amountTokens <= 0) throw new Error('Top-up amount must be greater than 0 tokens.');
    if (!params.reason.trim()) throw new Error('Audit reason is required.');

    domainUser.wallet.adjustAvailableByAdmin(
      params.amountTokens,
      `Admin manual top-up (${params.fundingSource}): ${params.reason}`,
      params.referenceCode || undefined
    );
    su.availableBalance = domainUser.wallet.availableBalance;
    su.pendingAdminCreditDelta = 0;
    su.adminAdjustedAt = Date.now();

    this.ledger.appendAudit(
      params.adminUsername,
      'MANUAL_TOPUP',
      su.username,
      `+${params.amountTokens.toLocaleString()} TKN via ${params.fundingSource} (${params.referenceCode || 'N/A'}) — ${params.reason}`
    );
    this.commitChanges({ persistNow: true, affectedUserIds: [params.userId], broadcastArena: false });
    return su;
  }

  public adminReviewPayment(
    paymentId: string,
    approve: boolean,
    note: string,
    adminUsername: string
  ) {
    const payment = this.store.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Payment request not found.');
    if (payment.status !== 'PENDING') throw new Error('Payment request has already been reviewed.');

    const su = this.store.users.find((u) => u.id === payment.userId);
    const domainUser = this.users.get(payment.userId);
    if (!su || !domainUser) throw new Error('Target user not found.');

    payment.status = approve ? 'APPROVED' : 'REJECTED';
    payment.reviewedAt = Date.now();
    payment.adminNote = note.trim() || (approve ? 'Approved by Admin' : 'Rejected by Admin');

    let referralRewardInfo: ReturnType<PromoRiskService['tryGrantReferralBonusForDeposit']> | null = null;
    const affectedIds = new Set<string>([su.id]);

    if (payment.kind === 'DEPOSIT' && approve) {
      const isBank = payment.method === PaymentMethod.SRI_LANKA_BANK;
      domainUser.wallet.creditAvailable(
        payment.tokenAmount,
        isBank ? TransactionType.DEPOSIT_BANK : TransactionType.DEPOSIT_CRYPTO,
        `Approved ${isBank ? 'Local Bank' : payment.method} deposit (${payment.referenceId})`,
        payment.id
      );
      su.availableBalance = domainUser.wallet.availableBalance;
      su.realDepositedTokens = (su.realDepositedTokens ?? 0) + payment.tokenAmount;
      if (su.promoRiskFlag === 'NO_DEPOSIT_FARMER') {
        su.promoRiskFlag = 'NONE';
      }
      referralRewardInfo = this.promoService.tryGrantReferralBonusForDeposit(
        payment.userId,
        payment.tokenAmount,
        payment.id
      );
      if (referralRewardInfo.referrerUserId) affectedIds.add(referralRewardInfo.referrerUserId);
    } else if (payment.kind === 'WITHDRAWAL' && approve) {
      domainUser.wallet.recordWithdrawalFromHold(
        payment.tokenAmount,
        `Approved ${payment.method === PaymentMethod.SRI_LANKA_BANK ? 'Local Bank' : payment.method} withdrawal (${payment.referenceId})`,
        payment.id
      );
      su.heldBalance = domainUser.wallet.heldBalance;
      const prevWithdrawn = su.realWithdrawnTokens ?? 0;
      const nextWithdrawn = prevWithdrawn + payment.tokenAmount;
      const realDep = su.realDepositedTokens ?? 0;
      if ((su.promoTokensGrantedTotal ?? 0) > 0 && nextWithdrawn > realDep) {
        const prevLeakage = Math.max(0, prevWithdrawn - realDep);
        const newlyLeaked = Math.max(0, nextWithdrawn - realDep - prevLeakage);
        if (newlyLeaked > 0) {
          su.promoRealizedLossTokens = (su.promoRealizedLossTokens ?? 0) + newlyLeaked;
          this.promoService.appendPromoLedger({
            kind: 'PROMO_WITHDRAWAL_LEAKAGE',
            userId: su.id,
            username: su.username,
            relatedUsername: payment.referenceId,
            tokenAmount: newlyLeaked,
            realLiabilityImpactTokens: -newlyLeaked,
            note: `Approved withdrawal (${payment.referenceId}) exceeded real deposits (${realDep.toLocaleString()} TKN) by ${newlyLeaked.toLocaleString()} unbacked TKN`,
          });
        }
      }
      su.realWithdrawnTokens = nextWithdrawn;
    } else if (payment.kind === 'WITHDRAWAL' && !approve) {
      domainUser.wallet.releaseHoldToAvailable(
        payment.tokenAmount,
        `Rejected withdrawal ${payment.referenceId} — tokens returned`,
        TransactionType.BET_REFUND,
        payment.id
      );
      su.heldBalance = domainUser.wallet.heldBalance;
      su.availableBalance = domainUser.wallet.availableBalance;
    }
    su.adminAdjustedAt = Date.now();

    this.ledger.appendAudit(
      adminUsername,
      approve ? `APPROVE_${payment.kind}` : `REJECT_${payment.kind}`,
      `${payment.username} (${payment.referenceId})`,
      `${payment.tokenAmount.toLocaleString()} TKN — ${payment.adminNote}${
        referralRewardInfo?.awarded
          ? ` · Referral Bonus +${referralRewardInfo.rewardTokens} TKN each paid to @${referralRewardInfo.referrerUsername} & @${referralRewardInfo.refereeUsername}`
          : ''
      }`
    );

    this.commitChanges({ persistNow: true, affectedUserIds: Array.from(affectedIds), broadcastArena: false });
    return { payment, referralRewardInfo };
  }
}
