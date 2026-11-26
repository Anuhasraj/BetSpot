import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Gift,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react';
import { TokenEconomy } from '../domain/TokenEconomy';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { DiceTokenIcon } from './DiceTokenIcon';

interface InviteAndEarnCardProps {
  engine: BetSpotEngine;
  variant?: 'account' | 'wallet';
}

export const InviteAndEarnCard: React.FC<InviteAndEarnCardProps> = ({
  engine,
  variant = 'account',
}) => {
  const user = engine.activeUser;
  const promo = engine.promoConfig;
  const summary = engine.referralSummary;

  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void engine.fetchMyReferralSummary();
  }, [engine, user.id]);

  const referralCode = (summary?.referralCode || user.referralCode || '').trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const referralLink = `${origin}/?ref=${encodeURIComponent(referralCode)}`;
  const minDepositUsd = (promo.referralMinDepositTokens / TokenEconomy.TOKENS_PER_USD).toFixed(2);

  const handleCopy = async (value: string, kind: 'link' | 'code') => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedType(kind);
      window.setTimeout(() => {
        setCopiedType((prev) => (prev === kind ? null : prev));
      }, 2200);
    } catch {
      // Clipboard blocked silently
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await engine.fetchMyReferralSummary();
    } finally {
      setRefreshing(false);
    }
  };

  const containerCls =
    variant === 'account'
      ? 'rounded-xl border border-amber-500/30 bg-[#2A100B] p-5 space-y-5'
      : 'rounded-xl border border-emerald-500/30 bg-[#131A26] p-5 space-y-5';

  const innerBoxCls =
    variant === 'account'
      ? 'rounded-xl border border-amber-500/20 bg-[#190907] p-4'
      : 'rounded-xl border border-slate-800 bg-[#0B0F17] p-4';

  const kpiBoxCls =
    variant === 'account'
      ? 'rounded-xl border border-amber-500/20 bg-[#190907] p-3.5'
      : 'rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5';

  const referredByUsername = summary?.referredByUsername || user.referredByUsername;
  const myReferralStatus = summary?.myReferralStatus;
  const referrals = summary?.referrals ?? [];

  return (
    <section className={containerCls}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/25 to-emerald-500/20 text-amber-300">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-amber-50">
                Invite &amp; Earn Referral Program
              </h2>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  promo.referralProgramEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                }`}
              >
                {promo.referralProgramEnabled ? 'ACTIVE REWARDS' : 'PAUSED'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300/85 leading-relaxed max-w-2xl">
              Share your referral link with friends. When a friend joins using your link and completes a deposit of at least{' '}
              <strong className="text-amber-300 font-mono-tabular">
                ${minDepositUsd} ({promo.referralMinDepositTokens.toLocaleString()} TKN)
              </strong>
              , <strong className="text-emerald-400">both you and your friend receive +{promo.referralBonusTokens.toLocaleString()} Bonus Tokens</strong> automatically!
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-black/25 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-black/40 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Stats
        </button>
      </div>

      {/* Inbound referral badge if this user was invited */}
      {referredByUsername && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            myReferralStatus === 'REWARDED'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-amber-300 shrink-0" />
            <span>
              You joined via <strong>@{referredByUsername}</strong>&apos;s invite.{' '}
              {myReferralStatus === 'REWARDED' ? (
                <strong className="text-emerald-300">
                  Both of you earned +{promo.referralBonusTokens.toLocaleString()} Bonus TKN!
                </strong>
              ) : (
                <span>
                  Deposit at least <strong>${minDepositUsd} ({promo.referralMinDepositTokens.toLocaleString()} TKN)</strong> to unlock{' '}
                  <strong>+{promo.referralBonusTokens.toLocaleString()} Bonus TKN</strong> for you &amp; @{referredByUsername}.
                </span>
              )}
            </span>
          </div>
          <span
            className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${
              myReferralStatus === 'REWARDED'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {myReferralStatus === 'REWARDED' ? 'REWARDED' : `AWAITING $${minDepositUsd}+ DEPOSIT`}
          </span>
        </div>
      )}

      {/* Share Link & Code Box */}
      <div className={`${innerBoxCls} space-y-3`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-8 space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200/80">
              <Share2 className="h-3.5 w-3.5 text-amber-400" />
              Your Personal Referral Invite Link
            </label>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                aria-label="Your personal referral link"
                onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                className="w-full rounded-lg border border-amber-500/30 bg-black/35 px-3 py-2 font-mono-tabular text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCopy(referralLink, 'link')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
              >
                {copiedType === 'link' ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied Link!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Referral Link
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <label className="block text-[11px] font-semibold text-amber-200/80">
              Referral Code
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-amber-500/30 bg-black/35 px-3 py-2 font-mono-tabular text-xs font-bold tracking-wider text-amber-300">
                {referralCode}
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(referralCode, 'code')}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/45 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
              >
                {copiedType === 'code' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 3-Step Visual Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-500/15 text-[11px]">
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="font-bold text-amber-300">1. Share Your Link</div>
            <div className="mt-0.5 text-slate-300/80">
              Send your invite link or code to a friend to register on BetSpot.
            </div>
          </div>
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="font-bold text-sky-300">
              2. Friend Deposits ${minDepositUsd}+
            </div>
            <div className="mt-0.5 text-slate-300/80">
              Your friend deposits at least {promo.referralMinDepositTokens.toLocaleString()} TKN (${minDepositUsd} USD).
            </div>
          </div>
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="font-bold text-emerald-400">
              3. Both Earn +{promo.referralBonusTokens.toLocaleString()} TKN
            </div>
            <div className="mt-0.5 text-slate-300/80">
              Instant bonus credited to both your wallets once approved!
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={kpiBoxCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Friends Invited</span>
            <Users className="h-3.5 w-3.5 text-amber-300" />
          </div>
          <div className="mt-1 font-mono-tabular text-lg font-bold text-slate-50">
            {summary?.totalInvited ?? 0}
          </div>
        </div>

        <div className={kpiBoxCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Pending ${minDepositUsd} Deposit</span>
            <Clock className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-lg font-bold text-amber-300">
            {summary?.pendingCount ?? 0}
          </div>
        </div>

        <div className={kpiBoxCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Qualified &amp; Paid</span>
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-lg font-bold text-emerald-400">
            {summary?.qualifiedCount ?? 0}
          </div>
        </div>

        <div className={kpiBoxCls}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Total Bonus Earned</span>
            <DiceTokenIcon size="xs" />
          </div>
          <div className="mt-1 font-mono-tabular text-lg font-bold text-emerald-400">
            +{(summary?.totalEarnedTokens ?? 0).toLocaleString()} TKN
          </div>
        </div>
      </div>

      {/* Referral History Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200/75">
          Invited Friends ({referrals.length})
        </h3>
        {referrals.length === 0 ? (
          <div className="rounded-lg border border-amber-500/15 bg-black/20 p-4 text-center text-xs text-slate-400">
            No friends have joined using your link yet. Copy your referral link above and invite friends to start earning +{promo.referralBonusTokens.toLocaleString()} Bonus Tokens each!
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-amber-500/20 bg-black/25">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-amber-500/15 text-[11px] text-slate-400">
                  <th className="px-3 py-2 font-medium">Invited Friend</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium text-right">Qualifying Deposit</th>
                  <th className="px-3 py-2 font-medium text-right">Your Reward</th>
                  <th className="px-3 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/10">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="h-10">
                    <td className="px-3 py-2 font-semibold text-slate-100">
                      @{ref.refereeUsername}
                    </td>
                    <td className="px-3 py-2 font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono-tabular text-slate-300">
                      {ref.qualifyingDepositTokens > 0
                        ? `${ref.qualifyingDepositTokens.toLocaleString()} TKN`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono-tabular font-bold text-emerald-400">
                      {ref.status === 'REWARDED'
                        ? `+${ref.referrerRewardTokens.toLocaleString()} TKN`
                        : `+${promo.referralBonusTokens.toLocaleString()} TKN pending`}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span
                        className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold ${
                          ref.status === 'REWARDED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {ref.status === 'REWARDED' ? 'REWARDED' : `AWAITING $${minDepositUsd}+ DEPOSIT`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
