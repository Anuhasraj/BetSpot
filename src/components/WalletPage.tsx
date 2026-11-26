import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  Upload,
  Wallet as WalletIcon,
} from 'lucide-react';
import { TokenEconomy } from '../domain/TokenEconomy';
import { ApprovalStatus } from '../domain/types';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { readAndCompressImageFile } from '../utils/imageUpload';
import { DiceTokenIcon } from './DiceTokenIcon';
import { InviteAndEarnCard } from './InviteAndEarnCard';
import { DepositModal, WithdrawModal } from './WalletModals';
import { PlayerTransactionLedger } from './PlayerTransactionLedger';

interface WalletPageProps {
  engine: BetSpotEngine;
  onError: (msg: string) => void;
}

export const WalletPage: React.FC<WalletPageProps> = ({ engine, onError }) => {
  const user = engine.activeUser;
  const wallet = user.wallet;

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const userPayments = engine.paymentService.requests.filter((r) => r.userId === user.id);
  const pendingWithdrawalTokens = userPayments
    .filter((p) => p.kind === 'WITHDRAWAL' && p.status === ApprovalStatus.PENDING)
    .reduce((sum, p) => sum + p.tokenAmount, 0);
  const activeBetHeldTokens = Math.max(0, wallet.heldBalance - pendingWithdrawalTokens);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
            Token Wallet &amp; Payments
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Fixed Base Peg: 1 USD = {TokenEconomy.TOKENS_PER_USD.toLocaleString()} Tokens · Min Deposit ${TokenEconomy.MIN_DEPOSIT_USD.toFixed(2)} ({TokenEconomy.MIN_DEPOSIT_TOKENS.toLocaleString()} TKN) · Min Withdrawal ${TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)} ({TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsDepositOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer shadow-md"
          >
            <ArrowDownLeft className="h-4 w-4" />
            Deposit Tokens
          </button>

          <button
            type="button"
            onClick={() => setIsWithdrawOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-[#28120A] px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-[#3A1B10] cursor-pointer shadow-md"
          >
            <ArrowUpRight className="h-4 w-4" />
            Request Withdrawal
          </button>
        </div>
      </div>

      {/* Wallet KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Balance</span>
            <DiceTokenIcon size="md" />
          </div>
          <div className="mt-2 flex items-center gap-2 font-mono-tabular text-2xl font-bold text-emerald-400">
            <DiceTokenIcon size="lg" />
            <span>{TokenEconomy.formatTokens(wallet.availableBalance)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono-tabular text-xs text-slate-400">
            <span>{TokenEconomy.formatUsd(wallet.availableBalance)} USD</span>
            {wallet.heldBalance > 0 && (
              <span className="text-amber-300">
                Held / In Bets: {TokenEconomy.formatTokens(wallet.heldBalance)}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5">
          <div className="text-xs text-slate-400">Account &amp; Payment Status</div>
          <div className="mt-2 font-display text-lg font-bold text-slate-100">
            {user.displayName} (@{user.username})
          </div>
          <div className="mt-1 font-mono-tabular text-xs text-slate-400">
            {userPayments.filter((p) => p.status === ApprovalStatus.PENDING).length} Pending Requests ·{' '}
            {user.role}
          </div>
        </div>
      </div>

      {/* Deposit / Withdraw Action Cards & Tier Fee Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Deposit Option Card */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-5">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-50">
                  Deposit Tokens
                </h2>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Top up your BetSpot wallet starting from ${TokenEconomy.MIN_DEPOSIT_USD.toFixed(2)} USD ({TokenEconomy.MIN_DEPOSIT_TOKENS.toLocaleString()} TKN). Select your payment method in the deposit popup, get your unique reference ID, and upload your payment slip for verification.
                </p>
              </div>
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <DiceTokenIcon size="xs" />
                  <span>Crypto (USDT TRC-20 Only) · Unique Ref</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>Upload slip for verification</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDepositOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Deposit Now</span>
            </button>
          </div>

          {/* Withdraw Option Card */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-5">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-50">
                  Withdraw Tokens
                </h2>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Cash out winnings from {TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN (${TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)} USD). Choose USDT (TRC-20) or Local Bank Account in the withdrawal popup and submit your payout details for processing.
                </p>
              </div>
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <WalletIcon className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Crypto Wallet Payout (USDT TRC-20)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Landmark className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>Local Bank Transfer · Verified Payout</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsWithdrawOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-[#28120A] px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-[#3A1B10] cursor-pointer"
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Withdraw Now</span>
            </button>
          </div>
        </div>

        {/* Right 5 cols: Tier Fee Matrix & Payment Requests */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Automatic Tier Fee Schedule
            </h2>
            <p className="text-xs text-slate-400">
              Applied to Main Dice winners by board tier, and automatically mapped by bet amount on Side-Bets and Sports predictions.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F17]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="px-3 py-2 font-medium">Room</th>
                    <th className="px-3 py-2 font-medium text-right">Bet Range (TKN)</th>
                    <th className="px-3 py-2 font-medium text-right">Winner Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono-tabular">
                  {TokenEconomy.TIERS.map((t) => (
                    <tr key={t.id} className="h-8">
                      <td className="px-3 py-1.5 text-slate-200 font-sans">
                        {t.label.split('·')[1]?.trim() ?? t.label}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-300">
                        {t.minTokens.toLocaleString()}–{t.maxTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right text-amber-400 font-semibold">
                        {(t.feeRate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#131A26] p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Your Payment Requests ({userPayments.length})
            </h2>
            {userPayments.length === 0 ? (
              <p className="text-xs text-slate-500">No deposit or withdrawal requests yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {userPayments.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-100">
                          {req.kind} · {req.tokenAmount.toLocaleString()} TKN (${req.usdEquivalent.toFixed(2)} USD)
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {req.referenceId} · {req.destinationOrBankDetails}
                        </div>
                      </div>
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold shrink-0 ${
                          req.status === ApprovalStatus.APPROVED
                            ? 'text-emerald-400'
                            : req.status === ApprovalStatus.REJECTED
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    {req.status === ApprovalStatus.PENDING && (
                      <div className="text-[11px] text-amber-300/80">
                        Pending Admin Review · Submitted {new Date(req.createdAt).toLocaleString()}
                      </div>
                    )}

                    {(req.status === ApprovalStatus.APPROVED ||
                      req.status === ApprovalStatus.REJECTED) && (
                      <div
                        className={`rounded-md border px-2.5 py-1.5 text-[11px] space-y-0.5 ${
                          req.status === ApprovalStatus.APPROVED
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                            : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        <div className="font-semibold">
                          {req.status === ApprovalStatus.APPROVED
                            ? 'Approved by Admin'
                            : 'Rejected by Admin'}
                          {req.reviewedAt ? ` · ${new Date(req.reviewedAt).toLocaleString()}` : ''}
                        </div>
                        {req.adminNote && <div className="text-slate-200/90">Note: {req.adminNote}</div>}
                      </div>
                    )}

                    {req.kind === 'DEPOSIT' && req.status === ApprovalStatus.PENDING && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                        {req.receiptPreviewName ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 truncate">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Slip sent: {req.receiptPreviewName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-300/85">
                            No slip uploaded yet
                          </span>
                        )}

                        <label className="flex items-center gap-1 rounded-md border border-amber-400/40 bg-[#1A120A] px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-[#2A1C0E] cursor-pointer shrink-0">
                          <Upload className="h-3 w-3 text-amber-300" />
                          <span>{req.receiptPreviewName ? 'Replace Slip' : 'Upload Payment Slip'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              void readAndCompressImageFile(file, {
                                maxDimension: 1280,
                                quality: 0.82,
                              })
                                .then((compressed) =>
                                  engine.attachDepositReceipt(req.id, file.name, compressed)
                                )
                                .catch((err) => {
                                  onError(
                                    err instanceof Error ? err.message : 'Unable to upload slip.'
                                  );
                                });
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite & Earn Referral Program */}
      <InviteAndEarnCard engine={engine} variant="wallet" />

      {/* Win / Loss Audit & Full Wallet Transaction History */}
      <PlayerTransactionLedger
        transactions={wallet.transactions}
        username={user.username}
        activeBetHeldTokens={activeBetHeldTokens}
        variant="wallet"
      />

      <DepositModal
        isOpen={isDepositOpen}
        engine={engine}
        onClose={() => setIsDepositOpen(false)}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        engine={engine}
        availableBalance={wallet.availableBalance}
        onClose={() => setIsWithdrawOpen(false)}
      />
    </div>
  );
};
