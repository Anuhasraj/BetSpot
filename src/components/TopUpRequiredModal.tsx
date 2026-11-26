import React, { useEffect } from 'react';
import { AlertTriangle, Wallet, X } from 'lucide-react';
import { TokenEconomy } from '../domain/TokenEconomy';
import { DiceTokenIcon } from './DiceTokenIcon';

export interface TopUpPromptData {
  title: string;
  message: string;
  requiredTokens: number;
  availableTokens: number;
}

interface TopUpRequiredModalProps {
  prompt: TopUpPromptData | null;
  onClose: () => void;
  onGoToWallet: () => void;
}

export const TopUpRequiredModal: React.FC<TopUpRequiredModalProps> = ({
  prompt,
  onClose,
  onGoToWallet,
}) => {
  useEffect(() => {
    if (!prompt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prompt, onClose]);

  if (!prompt) return null;

  const shortfall = Math.max(0, prompt.requiredTokens - prompt.availableTokens);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-[#34140D] to-[#1A0805] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-[#280E08] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/45 bg-amber-500/15 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2
              id="topup-modal-title"
              className="font-display text-sm sm:text-base font-bold text-amber-100 truncate"
            >
              {prompt.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/35 bg-[#190805] text-amber-200 hover:bg-[#441A10] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs sm:text-sm text-amber-100/85 leading-relaxed">
            {prompt.message}
          </p>

          <div className="rounded-xl border border-amber-500/25 bg-[#180805] p-3.5 space-y-2 text-xs font-mono-tabular">
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-amber-200/70">Required Minimum</span>
              <span className="font-bold text-amber-300">
                {prompt.requiredTokens.toLocaleString()} TKN ({TokenEconomy.formatUsd(prompt.requiredTokens)})
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-amber-200/70">Available in Wallet</span>
              <span className="font-bold text-rose-300">
                {prompt.availableTokens.toLocaleString()} TKN
              </span>
            </div>
            {shortfall > 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-amber-500/15 pt-2">
                <span className="font-sans text-amber-200/80">Top-Up Needed</span>
                <span className="font-bold text-emerald-400">
                  +{shortfall.toLocaleString()} TKN
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-amber-400/35 bg-[#240D08] px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-[#3A170F] cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onGoToWallet}
              className="flex items-center justify-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer shadow-md"
            >
              <Wallet className="h-4 w-4" />
              <span>Top Up Account</span>
              <DiceTokenIcon size="xs" tone="dark" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
