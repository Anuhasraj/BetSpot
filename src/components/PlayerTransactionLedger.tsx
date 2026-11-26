import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Gift,
  History,
  Lock,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { TransactionType, WalletTransaction } from '../domain/types';
import { DiceTokenIcon } from './DiceTokenIcon';

type LedgerFilter = 'all' | 'wins' | 'losses' | 'bets' | 'refunds' | 'payments';

interface PlayerTransactionLedgerProps {
  transactions: readonly WalletTransaction[];
  username: string;
  activeBetHeldTokens?: number;
  variant?: 'account' | 'wallet';
}

function getTxMeta(tx: WalletTransaction): {
  label: string;
  badgeClass: string;
  effectLabel: string;
  isPositiveAvailable: boolean;
  isLoss: boolean;
} {
  const isWithdrawHold =
    tx.type === TransactionType.BET_HOLD && tx.description.startsWith('Withdrawal');

  switch (tx.type) {
    case TransactionType.BET_WIN:
      return {
        label: 'WIN (+)',
        badgeClass: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
        effectLabel: 'Credited to Available',
        isPositiveAvailable: true,
        isLoss: false,
      };
    case TransactionType.BET_LOSS:
      return {
        label: 'LOSS (-)',
        badgeClass: 'border-rose-500/45 bg-rose-500/15 text-rose-300',
        effectLabel: 'Settled from Held Stake',
        isPositiveAvailable: false,
        isLoss: true,
      };
    case TransactionType.BET_HOLD:
      return {
        label: isWithdrawHold ? 'WITHDRAW HOLD' : 'BET LOCKED',
        badgeClass: 'border-amber-400/45 bg-amber-500/15 text-amber-300',
        effectLabel: isWithdrawHold ? 'Held for Payout' : 'Available → Held Bet',
        isPositiveAvailable: false,
        isLoss: false,
      };
    case TransactionType.BET_REFUND:
      return {
        label: 'REFUND (+)',
        badgeClass: 'border-sky-400/45 bg-sky-500/15 text-sky-300',
        effectLabel: 'Returned to Available',
        isPositiveAvailable: true,
        isLoss: false,
      };
    case TransactionType.ENTRY_FEE:
      return {
        label: 'ENTRY FEE (-)',
        badgeClass: 'border-orange-400/45 bg-orange-500/15 text-orange-300',
        effectLabel: 'Deducted from Available',
        isPositiveAvailable: false,
        isLoss: true,
      };
    case TransactionType.SIGNUP_BONUS:
      return {
        label: 'WELCOME (+)',
        badgeClass: 'border-amber-400/50 bg-amber-500/15 text-amber-300',
        effectLabel: 'Free New User Welcome Bonus',
        isPositiveAvailable: true,
        isLoss: false,
      };
    case TransactionType.REFERRAL_BONUS:
      return {
        label: 'REFERRAL (+)',
        badgeClass: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300',
        effectLabel: 'Invite & Earn Referral Reward',
        isPositiveAvailable: true,
        isLoss: false,
      };
    case TransactionType.DEPOSIT_CRYPTO:
    case TransactionType.DEPOSIT_BANK:
    case TransactionType.ADMIN_TOPUP:
      return {
        label: 'CREDIT (+)',
        badgeClass: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
        effectLabel: 'Added to Available',
        isPositiveAvailable: true,
        isLoss: false,
      };
    case TransactionType.WITHDRAWAL:
      return {
        label: 'WITHDRAWAL (-)',
        badgeClass: 'border-rose-500/45 bg-rose-500/15 text-rose-300',
        effectLabel: 'Payout Completed',
        isPositiveAvailable: false,
        isLoss: true,
      };
    case TransactionType.ADMIN_ADJUSTMENT:
    default:
      return {
        label: tx.amount >= 0 ? 'ADJUST (+)' : 'ADJUST (-)',
        badgeClass: 'border-slate-500/45 bg-slate-500/15 text-slate-300',
        effectLabel: tx.amount >= 0 ? 'Credited by Admin' : 'Deducted by Admin',
        isPositiveAvailable: tx.amount >= 0,
        isLoss: tx.amount < 0,
      };
  }
}

export const PlayerTransactionLedger: React.FC<PlayerTransactionLedgerProps> = ({
  transactions,
  username,
  activeBetHeldTokens = 0,
  variant = 'account',
}) => {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [search, setSearch] = useState('');

  const summary = useMemo(() => {
    let winCount = 0;
    let winTokens = 0;
    let lossCount = 0;
    let lossTokens = 0;
    let refundCount = 0;
    let refundTokens = 0;
    let betStakesHeld = 0;
    let entryFees = 0;

    for (const tx of transactions) {
      if (tx.type === TransactionType.BET_WIN) {
        winCount += 1;
        winTokens += Math.max(0, tx.amount);
      } else if (tx.type === TransactionType.BET_LOSS) {
        lossCount += 1;
        lossTokens += Math.abs(tx.amount);
      } else if (
        tx.type === TransactionType.BET_REFUND &&
        !tx.description.startsWith('Rejected withdrawal')
      ) {
        refundCount += 1;
        refundTokens += Math.max(0, tx.amount);
      } else if (
        tx.type === TransactionType.BET_HOLD &&
        !tx.description.startsWith('Withdrawal')
      ) {
        betStakesHeld += Math.abs(tx.amount);
      } else if (tx.type === TransactionType.ENTRY_FEE) {
        entryFees += Math.abs(tx.amount);
      }
    }

    const inPlayHeld = Math.max(0, Math.round(activeBetHeldTokens));
    const netGamingPnl = winTokens + refundTokens + inPlayHeld - betStakesHeld - entryFees;
    return {
      winCount,
      winTokens,
      lossCount,
      lossTokens,
      refundCount,
      refundTokens,
      betStakesHeld,
      inPlayHeld,
      entryFees,
      netGamingPnl,
    };
  }, [transactions, activeBetHeldTokens]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      const isWithdrawHold =
        tx.type === TransactionType.BET_HOLD && tx.description.startsWith('Withdrawal');
      if (filter === 'wins' && tx.type !== TransactionType.BET_WIN) return false;
      if (filter === 'losses' && tx.type !== TransactionType.BET_LOSS) return false;
      if (filter === 'bets' && (tx.type !== TransactionType.BET_HOLD || isWithdrawHold)) return false;
      if (filter === 'refunds' && tx.type !== TransactionType.BET_REFUND) return false;
      if (
        filter === 'payments' &&
        tx.type !== TransactionType.ENTRY_FEE &&
        tx.type !== TransactionType.DEPOSIT_CRYPTO &&
        tx.type !== TransactionType.DEPOSIT_BANK &&
        tx.type !== TransactionType.WITHDRAWAL &&
        tx.type !== TransactionType.ADMIN_TOPUP &&
        tx.type !== TransactionType.ADMIN_ADJUSTMENT &&
        tx.type !== TransactionType.SIGNUP_BONUS &&
        tx.type !== TransactionType.REFERRAL_BONUS &&
        !isWithdrawHold
      ) {
        return false;
      }

      if (q) {
        const hay = `${tx.type} ${tx.description} ${tx.referenceId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filter, search]);

  const containerCls =
    variant === 'account'
      ? 'rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4'
      : 'rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-4';

  const subCardCls =
    variant === 'account'
      ? 'rounded-xl border border-amber-500/20 bg-[#190907] p-3.5'
      : 'rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5';

  const tableBoxCls =
    variant === 'account'
      ? 'overflow-x-auto rounded-xl border border-amber-500/20 bg-[#190907]'
      : 'overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]';

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <section className={containerCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <h2 className="font-display text-base font-semibold text-amber-50">
              Win / Loss Audit &amp; Wallet Transaction History
            </h2>
            <p className="text-xs text-slate-400">
              Every bet locked, won, lost, refunded, entry fee, and payment explaining every token change for @{username}.
            </p>
          </div>
        </div>
        <span className="font-mono-tabular text-xs font-semibold text-amber-300">
          {transactions.length} Total Entries
        </span>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={subCardCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Total Wins ({summary.winCount})</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-base font-bold text-emerald-400">
            +{summary.winTokens.toLocaleString()} TKN
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">Credited payouts from wins</div>
        </div>

        <div className={subCardCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Total Losses ({summary.lossCount})</span>
            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-base font-bold text-rose-400">
            -{summary.lossTokens.toLocaleString()} TKN
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {summary.entryFees > 0
              ? `Plus -${summary.entryFees.toLocaleString()} TKN entry fees`
              : 'Settled lost stakes'}
          </div>
        </div>

        <div className={subCardCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Refunds Returned ({summary.refundCount})</span>
            <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-base font-bold text-sky-300">
            +{summary.refundTokens.toLocaleString()} TKN
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            Excess min-bet &amp; unmatched returns
          </div>
        </div>

        <div className={subCardCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Net Gaming Profit / Loss</span>
            <DiceTokenIcon size="xs" />
          </div>
          <div
            className={`mt-1 font-mono-tabular text-base font-bold ${
              summary.netGamingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {summary.netGamingPnl >= 0
              ? `+${summary.netGamingPnl.toLocaleString()}`
              : summary.netGamingPnl.toLocaleString()}{' '}
            TKN
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {summary.inPlayHeld > 0
              ? `Excludes ${summary.inPlayHeld.toLocaleString()} TKN held in active bets`
              : 'Wins + Refunds − Bets − Fees'}
          </div>
        </div>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-amber-500/20 bg-[#140705] p-1">
          {[
            { id: 'all', label: `All (${transactions.length})` },
            { id: 'wins', label: `Wins (${summary.winCount})` },
            { id: 'losses', label: `Losses (${summary.lossCount})` },
            { id: 'bets', label: 'Bets Placed' },
            { id: 'refunds', label: `Refunds (${summary.refundCount})` },
            { id: 'payments', label: 'Fees & Payments' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as LedgerFilter)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-[#461B12] text-amber-300'
                  : 'text-slate-300/75 hover:text-amber-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search room, match, option..."
            aria-label="Search transaction history"
            className="w-full rounded-lg border border-amber-500/25 bg-[#140705] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Detailed Audit Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-amber-500/15 bg-[#140705] py-8 text-center text-xs text-slate-400">
          {transactions.length === 0
            ? `No transactions recorded yet for @${username}. Place a bet or deposit tokens to see live token changes.`
            : 'No matching transactions found for this filter.'}
        </div>
      ) : (
        <div className={`${tableBoxCls} max-h-[440px] overflow-y-auto`}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#140705] border-b border-amber-500/20 text-[11px] text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Time</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Type</th>
                <th className="px-3 py-2.5 font-medium">Reason &amp; Bet Details</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Token Change</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/10">
              {filtered.map((tx) => {
                const meta = getTxMeta(tx);
                return (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap align-top">
                      {formatTime(tx.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${meta.badgeClass}`}
                      >
                        {tx.type === TransactionType.BET_HOLD ? (
                          <Lock className="h-2.5 w-2.5" />
                        ) : tx.type === TransactionType.SIGNUP_BONUS ||
                          tx.type === TransactionType.REFERRAL_BONUS ? (
                          <Gift className="h-2.5 w-2.5" />
                        ) : meta.isPositiveAvailable ? (
                          <ArrowDownRight className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-slate-100 font-medium leading-snug">{tx.description}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{meta.effectLabel}</div>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono-tabular font-bold whitespace-nowrap align-top ${
                        meta.isPositiveAvailable
                          ? 'text-emerald-400'
                          : meta.isLoss
                          ? 'text-rose-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} TKN
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-tabular text-slate-200 whitespace-nowrap align-top">
                      <div>{tx.balanceAfter.toLocaleString()} TKN</div>
                      {tx.heldAfter > 0 && (
                        <div className="text-[10px] text-amber-300/75">
                          Held: {tx.heldAfter.toLocaleString()}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
