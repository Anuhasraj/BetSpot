import React from 'react';
import { X } from 'lucide-react';
import { TierDefinition } from '../domain/types';
import { DiceTokenIcon } from './DiceTokenIcon';

export interface PreJoinBetModalProps {
  tier: TierDefinition;
  isNextRound?: boolean;
  betInput: string;
  availableBalance: number;
  busy: boolean;
  onChangeBetInput: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Modal dialog prompting the player to choose their main-game stake
 * before entering room matchmaking or starting the next round.
 */
export const PreJoinBetModal: React.FC<PreJoinBetModalProps> = ({
  tier,
  isNextRound = false,
  betInput,
  availableBalance,
  busy,
  onChangeBetInput,
  onConfirm,
  onClose,
}) => {
  const stepBase = Math.max(1, tier.minTokens);
  const midStake =
    Math.round((tier.minTokens + tier.maxTokens) / 2 / stepBase) * stepBase;
  const presets = Array.from(
    new Set([
      tier.minTokens,
      Math.min(tier.maxTokens, tier.minTokens * 2),
      Math.min(tier.maxTokens, Math.max(tier.minTokens, midStake)),
      tier.maxTokens,
    ])
  ).sort((a, b) => a - b);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select Main Game Bet"
      onClick={() => !busy && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-[#34140D] to-[#1A0805] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.85)] space-y-4"
      >
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
          <div className="flex items-center gap-2">
            <DiceTokenIcon size="sm" />
            <div>
              <h3 className="font-display text-base font-bold text-amber-100">
                {isNextRound ? 'Next Round Bet' : 'Place Main Game Bet'}
              </h3>
              <p className="text-[11px] text-amber-200/75">
                {tier.label} · Max {tier.maxSeats} Players ·{' '}
                {(tier.feeRate * 100).toFixed(0)}% Fee
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close bet modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/35 bg-[#190805] text-amber-200 hover:bg-[#441A10] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-200/80">
              Bet Range:{' '}
              <strong className="font-mono-tabular text-amber-200">
                {tier.minTokens.toLocaleString()}–{tier.maxTokens.toLocaleString()} TKN
              </strong>
            </span>
            <span className="font-mono-tabular text-[11px] text-emerald-300">
              Bal: {availableBalance.toLocaleString()} TKN
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onChangeBetInput(String(amt))}
                className={`rounded-lg border px-2.5 py-1.5 font-mono-tabular text-xs font-semibold cursor-pointer ${
                  Number(betInput) === amt
                    ? 'border-amber-300 bg-amber-400/25 text-amber-100'
                    : 'border-amber-500/30 bg-[#250E09] text-amber-200/80 hover:text-amber-100'
                }`}
              >
                {amt.toLocaleString()} TKN
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-xl border border-amber-400/45 bg-[#230C08] px-3.5 py-2.5">
            <input
              type="number"
              min={tier.minTokens}
              max={tier.maxTokens}
              step={1}
              value={betInput}
              onChange={(e) => onChangeBetInput(e.target.value)}
              aria-label="Main Game Bet Amount"
              className="w-full bg-transparent font-mono-tabular text-base font-bold text-amber-100 focus:outline-none"
            />
            <span className="text-xs font-bold text-amber-300/80 ml-2">TKN</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-amber-400/35 bg-[#2A100B] px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-[#3B170F] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer"
          >
            {busy ? 'Joining...' : 'Confirm & Find Room'}
          </button>
        </div>
      </div>
    </div>
  );
};
