import { BaseEntity } from '../core/BaseEntity';
import { TokenEconomy } from './TokenEconomy';
import {
  BetStatus,
  DiceFace,
  IFeeStrategy,
  SideBetCategory,
  SideBetEntry,
  SideBetOptionKey,
  SideBetOptionPoolSummary,
  TransactionType,
} from './types';
import { User } from './User';

export const SIDE_BET_OPTIONS: Record<
  SideBetCategory,
  readonly { key: SideBetOptionKey; label: string; faces: readonly DiceFace[] }[]
> = {
  [SideBetCategory.LOW_HIGH]: [
    { key: 'LOW', label: 'Low (3, 6, 9)', faces: [3, 6, 9] },
    { key: 'HIGH', label: 'High (12, 15, 18)', faces: [12, 15, 18] },
  ],
  [SideBetCategory.SINGLE]: [
    { key: '3', label: 'Single 3', faces: [3] },
    { key: '6', label: 'Single 6', faces: [6] },
    { key: '9', label: 'Single 9', faces: [9] },
    { key: '12', label: 'Single 12', faces: [12] },
    { key: '15', label: 'Single 15', faces: [15] },
    { key: '18', label: 'Single 18', faces: [18] },
  ],
  [SideBetCategory.COUPLE]: [
    { key: '3,6', label: 'Pair 3 & 6', faces: [3, 6] },
    { key: '9,12', label: 'Pair 9 & 12', faces: [9, 12] },
    { key: '15,18', label: 'Pair 15 & 18', faces: [15, 18] },
  ],
};

export interface SideBetSettlementReport {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly rollerUsername: string;
  readonly rolledFace: DiceFace;
  readonly totalPoolPlaced: number;
  readonly totalMatched: number;
  readonly totalRefunded: number;
  readonly totalFeesCollected: number;
  readonly winners: {
    betId: string;
    userId: string;
    username: string;
    option: SideBetOptionKey;
    grossPayout: number;
    feeRate: number;
    netPayout: number;
    fee: number;
  }[];
  readonly notes: string[];
}

export interface SerializedSideBetRound {
  id: string;
  boardId: string;
  roundNumber: number;
  rollerUsername: string;
  secondsRemaining: number;
  isClosed: boolean;
  isSettled: boolean;
  rolledFace: DiceFace | null;
  settlementReport: SideBetSettlementReport | null;
  bets: SideBetEntry[];
}

export class SideBetRound extends BaseEntity<SerializedSideBetRound> {
  public readonly boardId: string;
  public readonly roundNumber: number;
  public rollerUsername: string;
  public secondsRemaining: number;
  public isClosed: boolean = false;
  public isSettled: boolean = false;
  public rolledFace: DiceFace | null = null;
  public settlementReport: SideBetSettlementReport | null = null;

  private _bets: SideBetEntry[] = [];

  constructor(
    boardId: string,
    roundNumber: number,
    rollerUsername: string,
    durationSeconds: number = 20,
    explicitId?: string
  ) {
    super(explicitId ?? `sbr_${boardId}_r${roundNumber}_${Date.now()}`);
    this.boardId = boardId;
    this.roundNumber = roundNumber;
    this.rollerUsername = rollerUsername;
    this.secondsRemaining = durationSeconds;
  }

  public get bets(): readonly SideBetEntry[] {
    return this._bets;
  }

  public toJSON(): SerializedSideBetRound {
    return {
      id: this.id,
      boardId: this.boardId,
      roundNumber: this.roundNumber,
      rollerUsername: this.rollerUsername,
      secondsRemaining: this.secondsRemaining,
      isClosed: this.isClosed,
      isSettled: this.isSettled,
      rolledFace: this.rolledFace,
      settlementReport: this.settlementReport ? { ...this.settlementReport } : null,
      bets: this._bets.map((b) => ({ ...b })),
    };
  }

  public static fromServerSnapshot(data: SerializedSideBetRound): SideBetRound {
    const round = new SideBetRound(
      data.boardId,
      data.roundNumber,
      data.rollerUsername,
      data.secondsRemaining,
      data.id
    );
    round.isClosed = Boolean(data.isClosed);
    round.isSettled = Boolean(data.isSettled);
    round.rolledFace = data.rolledFace ?? null;
    round.settlementReport = data.settlementReport ? { ...data.settlementReport } : null;
    round._bets = Array.isArray(data.bets) ? data.bets.map((b) => ({ ...b })) : [];
    return round;
  }

  public getUserOptionsForCategory(userId: string, category: SideBetCategory): Set<SideBetOptionKey> {
    return new Set(
      this._bets
        .filter(
          (b) =>
            b.userId === userId &&
            b.category === category &&
            b.status !== BetStatus.CANCELLED &&
            b.status !== BetStatus.SUSPENDED
        )
        .map((b) => b.option)
    );
  }

  public getUserSingleOptionsCount(userId: string): number {
    return this.getUserOptionsForCategory(userId, SideBetCategory.SINGLE).size;
  }

  public static getMaxOptionsForCategory(category: SideBetCategory): number {
    switch (category) {
      case SideBetCategory.LOW_HIGH:
        return 1;
      case SideBetCategory.COUPLE:
        return 2;
      case SideBetCategory.SINGLE:
        return 5;
    }
  }

  /**
   * Places an irrevocable (locked) side bet.
   * Holds the full confirmed stake for the open betting round so any opposing bets
   * (human or counter-liquidity) arriving before roll lock can match it 1:1.
   * Any portion still unmatched when the dice lands is 100% auto-refunded on settle().
   */
  public placeBet(
    user: User,
    category: SideBetCategory,
    option: SideBetOptionKey,
    amount: number
  ): { entry: SideBetEntry; immediateExcessRefund: number } {
    if (this.isClosed) {
      throw new Error('Side-betting window is closed for this roll.');
    }
    if (!user.isActive) {
      throw new Error('Account is suspended.');
    }
    const stake = Math.round(amount);
    if (stake < TokenEconomy.MIN_BET_TOKENS) {
      throw new Error(`Minimum side bet is ${TokenEconomy.MIN_BET_TOKENS} TKN.`);
    }

    // Prevent hedging/locking every outcome in the same category against oneself
    const existingOpts = this.getUserOptionsForCategory(user.id, category);
    const maxOpts = SideBetRound.getMaxOptionsForCategory(category);
    if (!existingOpts.has(option) && existingOpts.size >= maxOpts) {
      if (category === SideBetCategory.LOW_HIGH) {
        throw new Error('Cannot bet both LOW and HIGH simultaneously in the same round.');
      }
      if (category === SideBetCategory.COUPLE) {
        throw new Error('Cannot bet all 3 Couple pairs simultaneously — maximum 2 pairs per roll.');
      }
      throw new Error(
        'Cannot bet all 6 Single faces simultaneously — maximum 5 Single numbers allowed per roll.'
      );
    }

    // Hold full confirmed stake from wallet
    user.wallet.holdTokens(
      stake,
      `Side bet locked: ${category} -> ${option} (Round #${this.roundNumber})`,
      this.id
    );

    const randSuffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : String(Date.now()).slice(-6);

    const entry: SideBetEntry = {
      id: `sb_${Date.now()}_${randSuffix}`,
      roundId: this.id,
      boardId: this.boardId,
      userId: user.id,
      username: user.username,
      category,
      option,
      originalStake: stake,
      matchedStake: 0,
      unmatchedRefunded: 0,
      status: BetStatus.ACTIVE,
      payout: 0,
      feeDeducted: 0,
      placedAt: Date.now(),
    };

    this._bets.push(entry);
    this.recomputeCategoryMatching(category);

    return { entry, immediateExcessRefund: 0 };
  }

  public cancelBetByAdmin(betId: string, userLookup: (userId: string) => User | undefined): boolean {
    const bet = this._bets.find((b) => b.id === betId);
    if (!bet || bet.status === BetStatus.CANCELLED || bet.status === BetStatus.WON || bet.status === BetStatus.LOST) {
      return false;
    }
    const user = userLookup(bet.userId);
    if (user) {
      user.wallet.releaseHoldToAvailable(
        bet.originalStake,
        `Admin cancelled side bet (${bet.option})`,
        TransactionType.BET_REFUND,
        bet.id
      );
    }
    bet.status = BetStatus.CANCELLED;
    bet.matchedStake = 0;
    this.recomputeCategoryMatching(bet.category);
    return true;
  }

  public refundAllActiveBets(userLookup: (userId: string) => User | undefined, reason: string): void {
    for (const bet of this._bets) {
      if (
        bet.status === BetStatus.CANCELLED ||
        bet.status === BetStatus.WON ||
        bet.status === BetStatus.LOST ||
        bet.status === BetStatus.REFUNDED
      ) {
        continue;
      }
      const user = userLookup(bet.userId);
      if (user) {
        user.wallet.releaseHoldToAvailable(
          bet.originalStake,
          `${reason} (${bet.option})`,
          TransactionType.BET_REFUND,
          bet.id
        );
      }
      bet.unmatchedRefunded += bet.originalStake;
      bet.matchedStake = 0;
      bet.status = BetStatus.REFUNDED;
    }
    this.isClosed = true;
    this.isSettled = true;
  }

  public suspendBetByAdmin(betId: string): boolean {
    const bet = this._bets.find((b) => b.id === betId);
    if (!bet || bet.status === BetStatus.CANCELLED || bet.status === BetStatus.WON || bet.status === BetStatus.LOST) {
      return false;
    }
    bet.status = bet.status === BetStatus.SUSPENDED ? BetStatus.ACTIVE : BetStatus.SUSPENDED;
    this.recomputeCategoryMatching(bet.category);
    return true;
  }

  public recomputeCategoryMatching(category: SideBetCategory): void {
    const active = this._bets.filter(
      (b) => b.category === category && b.status !== BetStatus.CANCELLED && b.status !== BetStatus.SUSPENDED
    );
    if (active.length === 0) return;

    const distinctUsers = new Set(active.map((b) => b.userId));
    const byOption = new Map<SideBetOptionKey, SideBetEntry[]>();
    for (const b of active) {
      const list = byOption.get(b.option) ?? [];
      list.push(b);
      byOption.set(b.option, list);
    }

    if (byOption.size <= 1 || distinctUsers.size <= 1) {
      // Zero opposing bets OR single bettor only (never self-match against oneself)
      for (const b of active) {
        b.matchedStake = 0;
        b.status = BetStatus.ACTIVE;
      }
      return;
    }

    // Total liquidity per option
    const optionTotals = Array.from(byOption.entries()).map(([opt, list]) => ({
      option: opt,
      total: list.reduce((s, b) => s + b.originalStake, 0),
      list,
    }));

    const grandTotal = optionTotals.reduce((s, o) => s + o.total, 0);

    // In a multi-option P2P pool, any single option can at most match the sum of all opposing options.
    // Specifically, max matched per option i is min(total_i, grandTotal - total_i).
    // For 2 options (A, B), min(A, B) matches cleanly 1:1.
    // For 3+ options, if one option exceeds sum of others, excess on that heavy option is unmatched;
    // otherwise every option is matched against opposing options!
    const maxOption = optionTotals.reduce((a, b) => (a.total >= b.total ? a : b));
    const othersTotal = grandTotal - maxOption.total;

    if (maxOption.total > othersTotal) {
      // Heavy option can only match `othersTotal`; all other options match 100%
      const heavyRatio = othersTotal / maxOption.total;
      let allocated = 0;
      maxOption.list.forEach((b, idx) => {
        const m =
          idx === maxOption.list.length - 1
            ? othersTotal - allocated
            : Math.floor(b.originalStake * heavyRatio);
        allocated += m;
        b.matchedStake = m;
        b.status = m > 0 ? BetStatus.MATCHED : BetStatus.ACTIVE;
      });
      for (const o of optionTotals) {
        if (o.option === maxOption.option) continue;
        for (const b of o.list) {
          b.matchedStake = b.originalStake;
          b.status = BetStatus.MATCHED;
        }
      }
    } else {
      // Every option has >= 1 counter-liquidity covering it completely
      for (const o of optionTotals) {
        for (const b of o.list) {
          b.matchedStake = b.originalStake;
          b.status = BetStatus.MATCHED;
        }
      }
    }
  }

  public getPoolSummaries(category?: SideBetCategory): SideBetOptionPoolSummary[] {
    const categories = category ? [category] : [SideBetCategory.LOW_HIGH, SideBetCategory.SINGLE, SideBetCategory.COUPLE];
    const summaries: SideBetOptionPoolSummary[] = [];

    for (const cat of categories) {
      for (const optDef of SIDE_BET_OPTIONS[cat]) {
        const entries = this._bets.filter(
          (b) =>
            b.category === cat &&
            b.option === optDef.key &&
            b.status !== BetStatus.CANCELLED &&
            b.status !== BetStatus.SUSPENDED
        );
        const totalPlaced = entries.reduce((s, e) => s + e.originalStake, 0);
        const totalMatched = entries.reduce((s, e) => s + e.matchedStake, 0);
        summaries.push({
          category: cat,
          option: optDef.key,
          label: optDef.label,
          totalPlaced,
          totalMatched,
          totalUnmatched: Math.max(0, totalPlaced - totalMatched),
          bettorsCount: new Set(entries.map((e) => e.userId)).size,
          contributors: entries.map((e) => ({
            username: e.username,
            amount: e.originalStake,
            matched: e.matchedStake,
          })),
        });
      }
    }
    return summaries;
  }

  public settle(
    rolledFace: DiceFace,
    feeStrategy: IFeeStrategy,
    userLookup: (userId: string) => User | undefined
  ): SideBetSettlementReport {
    if (this.isSettled && this.settlementReport) {
      return this.settlementReport;
    }
    this.isClosed = true;
    this.isSettled = true;
    this.rolledFace = rolledFace;

    let totalPoolPlaced = 0;
    let totalMatchedAll = 0;
    let totalRefunded = 0;
    let totalFeesCollected = 0;
    const winners: SideBetSettlementReport['winners'] = [];
    const notes: string[] = [];

    for (const cat of [SideBetCategory.LOW_HIGH, SideBetCategory.SINGLE, SideBetCategory.COUPLE]) {
      this.recomputeCategoryMatching(cat);
      const catBets = this._bets.filter(
        (b) => b.category === cat && b.status !== BetStatus.CANCELLED && b.status !== BetStatus.SUSPENDED
      );
      if (catBets.length === 0) continue;

      const winningOptions = new Set(
        SIDE_BET_OPTIONS[cat].filter((o) => o.faces.includes(rolledFace)).map((o) => o.key)
      );

      const matchedBets = catBets.filter((b) => b.matchedStake > 0);
      const totalMatchedInCat = matchedBets.reduce((s, b) => s + b.matchedStake, 0);
      const winningMatchedBets = matchedBets.filter((b) => winningOptions.has(b.option));
      const winningMatchedPool = winningMatchedBets.reduce((s, b) => s + b.matchedStake, 0);

      totalPoolPlaced += catBets.reduce((s, b) => s + b.originalStake, 0);

      // Refund any unmatched portion on all active bets in this category
      for (const bet of catBets) {
        const unmatched = bet.originalStake - bet.matchedStake;
        if (unmatched > 0) {
          const user = userLookup(bet.userId);
          if (user) {
            user.wallet.releaseHoldToAvailable(
              unmatched,
              `Unmatched side-bet auto-returned (${bet.option})`,
              TransactionType.BET_REFUND,
              bet.id
            );
          }
          bet.unmatchedRefunded += unmatched;
          totalRefunded += unmatched;
        }
      }

      // If zero matched counter-bets OR dice landed on an unbet number/option -> auto-return matched tokens
      if (totalMatchedInCat === 0 || winningMatchedPool === 0) {
        if (matchedBets.length > 0) {
          notes.push(
            `${cat}: Dice landed on ${rolledFace} (unbet option). Auto-returned ${totalMatchedInCat.toLocaleString()} TKN to bettors.`
          );
        }
        for (const bet of matchedBets) {
          const user = userLookup(bet.userId);
          if (user) {
            user.wallet.releaseHoldToAvailable(
              bet.matchedStake,
              `Dice landed on unbet option (${rolledFace}) — auto-returned`,
              TransactionType.BET_REFUND,
              bet.id
            );
          }
          bet.status = BetStatus.REFUNDED;
          totalRefunded += bet.matchedStake;
        }
        continue;
      }

      totalMatchedAll += totalMatchedInCat;
      const losingMatchedBets = matchedBets.filter((b) => !winningOptions.has(b.option));
      const losingPool = losingMatchedBets.reduce((s, b) => s + b.matchedStake, 0);

      // Settle losers
      for (const loser of losingMatchedBets) {
        const user = userLookup(loser.userId);
        if (user) {
          user.wallet.recordLossFromHold(
            loser.matchedStake,
            `Lost side bet on ${loser.option} (Face ${rolledFace} rolled in Round #${this.roundNumber})`,
            loser.id
          );
        }
        loser.status = BetStatus.LOST;
      }

      // Distribute losingPool deterministically with floor + largest-remainder so total profits === losingPool
      const rawShares = winningMatchedBets.map((w, idx) => {
        const exact = (losingPool * w.matchedStake) / winningMatchedPool;
        const floored = Math.floor(exact);
        return { idx, floored, rem: exact - floored };
      });
      const floorSum = rawShares.reduce((s, r) => s + r.floored, 0);
      const leftover = Math.max(0, losingPool - floorSum);
      const byRem = [...rawShares].sort((a, b) => b.rem - a.rem || a.idx - b.idx);
      const profits = rawShares.map((r) => r.floored);
      for (let i = 0; i < leftover && i < byRem.length; i++) {
        profits[byRem[i].idx] += 1;
      }

      // Settle winners proportionally by matched stake + deduct dynamic Tier Fee based on bet amount
      winningMatchedBets.forEach((winner, idx) => {
        const user = userLookup(winner.userId);
        const grossProfit = profits[idx] ?? 0;
        const grossReturn = winner.matchedStake + grossProfit;

        const feeCalc = feeStrategy.calculateWinnerFee(grossReturn, winner.matchedStake);
        if (user) {
          user.wallet.consumeHeldTokens(winner.matchedStake);
          user.wallet.creditAvailable(
            feeCalc.netPayout,
            TransactionType.BET_WIN,
            `Side-bet win on ${winner.option} (Face ${rolledFace}, ${Math.round(feeCalc.feeRate * 100)}% fee)`,
            winner.id
          );
        }
        winner.status = BetStatus.WON;
        winner.payout = feeCalc.netPayout;
        winner.feeDeducted = feeCalc.feeAmount;
        totalFeesCollected += feeCalc.feeAmount;
        winners.push({
          betId: winner.id,
          userId: winner.userId,
          username: winner.username,
          option: winner.option,
          grossPayout: feeCalc.grossAmount,
          feeRate: feeCalc.feeRate,
          netPayout: feeCalc.netPayout,
          fee: feeCalc.feeAmount,
        });
      });
    }

    const report: SideBetSettlementReport = {
      roundId: this.id,
      roundNumber: this.roundNumber,
      rollerUsername: this.rollerUsername,
      rolledFace,
      totalPoolPlaced,
      totalMatched: totalMatchedAll,
      totalRefunded,
      totalFeesCollected,
      winners,
      notes,
    };
    this.settlementReport = report;
    return report;
  }
}
