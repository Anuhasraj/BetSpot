import React, { useMemo, useState } from 'react';
import { Check, Layers, Lock, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import { DiceBoard } from '../domain/DiceBoard';
import { SIDE_BET_OPTIONS } from '../domain/SideBetRound';
import { TokenEconomy } from '../domain/TokenEconomy';
import { GamePhase, SideBetCategory, SideBetOptionKey } from '../domain/types';
import { BetSpotEngine, InsufficientTokensError } from '../services/BetSpotEngine';
import { DiceTokenIcon } from './DiceTokenIcon';
import { TopUpPromptData } from './TopUpRequiredModal';

interface SideBettingPanelProps {
  board: DiceBoard;
  engine: BetSpotEngine;
  canPlaceSideBets: boolean;
  onError: (msg: string) => void;
  onInsufficientBalance?: (prompt: TopUpPromptData) => void;
  onConfirmed?: () => void;
  onPayEntryFee?: () => void;
}

function buildDefaultStakes(minBet: number): Record<string, string> {
  const m1 = String(minBet);
  const m2 = String(minBet * 2);
  return {
    LOW: m2,
    HIGH: m2,
    '3': m1,
    '6': m1,
    '9': m1,
    '12': m1,
    '15': m1,
    '18': m1,
    '3,6': m2,
    '9,12': m2,
    '15,18': m2,
  };
}

const ALL_SECTIONS: {
  category: SideBetCategory;
  title: string;
  subtitle: string;
  gridClass: string;
}[] = [
  {
    category: SideBetCategory.LOW_HIGH,
    title: '1. Low / High',
    subtitle: '2 Options (Pick 1)',
    gridClass: 'grid grid-cols-2 gap-2 sm:gap-2.5',
  },
  {
    category: SideBetCategory.SINGLE,
    title: '2. Single Number',
    subtitle: '6 Options (Max 5)',
    gridClass: 'grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2.5',
  },
  {
    category: SideBetCategory.COUPLE,
    title: '3. Couple Pair',
    subtitle: '3 Options (Max 2)',
    gridClass: 'grid grid-cols-3 gap-1.5 sm:gap-2.5',
  },
];

export const SideBettingPanel: React.FC<SideBettingPanelProps> = ({
  board,
  engine,
  canPlaceSideBets,
  onError,
  onInsufficientBalance,
  onConfirmed,
  onPayEntryFee,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<
    Partial<Record<SideBetOptionKey, SideBetCategory>>
  >({});
  const [stakesByOption, setStakesByOption] = useState<Record<string, string>>(() =>
    buildDefaultStakes(TokenEconomy.MIN_BET_TOKENS)
  );
  const [submitting, setSubmitting] = useState<boolean>(false);

  const round = board.activeSideBetRound;
  const isWindowOpen = Boolean(round && !round.isClosed);
  const summaries = useMemo(() => (round ? round.getPoolSummaries() : []), [round, round?.bets.length]);
  const lockedSinglesCount = round ? round.getUserSingleOptionsCount(engine.activeUserId) : 0;

  const selectedEntries = useMemo(
    () =>
      Object.entries(selectedOptions).filter(
        (entry): entry is [SideBetOptionKey, SideBetCategory] => Boolean(entry[1])
      ),
    [selectedOptions]
  );

  const toggleOption = (category: SideBetCategory, opt: SideBetOptionKey) => {
    setSelectedOptions((prev) => {
      const next = { ...prev };
      if (next[opt]) {
        delete next[opt];
        return next;
      }
      next[opt] = category;
      return next;
    });
  };

  const removeSelectedOption = (opt: SideBetOptionKey) => {
    setSelectedOptions((prev) => {
      const next = { ...prev };
      delete next[opt];
      return next;
    });
  };

  const applyPresetToAllSelected = (amount: number) => {
    setStakesByOption((prev) => {
      const next = { ...prev };
      for (const [opt] of selectedEntries) {
        next[opt] = String(amount);
      }
      return next;
    });
  };

  const getResolvedStake = (opt: SideBetOptionKey, cat: SideBetCategory): number => {
    const defaultForOpt =
      cat === SideBetCategory.SINGLE ? TokenEconomy.MIN_BET_TOKENS : TokenEconomy.MIN_BET_TOKENS * 2;
    const raw = stakesByOption[opt];
    const parsed = Number(raw ?? defaultForOpt);
    if (Number.isNaN(parsed) || parsed < TokenEconomy.MIN_BET_TOKENS) {
      return defaultForOpt;
    }
    return Math.round(parsed);
  };

  const totalSelectedStake = selectedEntries.reduce((sum, [opt, cat]) => {
    return sum + getResolvedStake(opt, cat);
  }, 0);

  const handleConfirmAll = async () => {
    if (submitting) return;
    const availableBalance = engine.activeUser.wallet.availableBalance;
    if (availableBalance < TokenEconomy.MIN_BET_TOKENS) {
      if (onInsufficientBalance) {
        onInsufficientBalance({
          title: 'Top Up Required for Side Betting',
          message: `Minimum ${TokenEconomy.MIN_BET_TOKENS.toLocaleString()} TKN is required to place a side bet. Please top up your wallet to continue.`,
          requiredTokens: TokenEconomy.MIN_BET_TOKENS,
          availableTokens: availableBalance,
        });
      } else {
        onError(
          `Minimum ${TokenEconomy.MIN_BET_TOKENS.toLocaleString()} TKN is required to place a side bet.`
        );
      }
      return;
    }

    if (!canPlaceSideBets) {
      onError('Join the room or pay entry fee before confirming side bets.');
      return;
    }
    if (!isWindowOpen) {
      onError(
        `Side-betting window opens for ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s before each player rolls (including Turn #1).`
      );
      return;
    }
    if (selectedEntries.length === 0) {
      onError('Select one or more options across any of the 3 sections first.');
      return;
    }

    if (totalSelectedStake >= TokenEconomy.MIN_BET_TOKENS && availableBalance < totalSelectedStake) {
      if (onInsufficientBalance) {
        onInsufficientBalance({
          title: 'Insufficient Tokens for Side Bet',
          message: `Your selected side bets total ${totalSelectedStake.toLocaleString()} TKN, which exceeds your available wallet balance. Please top up your account.`,
          requiredTokens: totalSelectedStake,
          availableTokens: availableBalance,
        });
      } else {
        onError(
          `Insufficient balance: need ${totalSelectedStake.toLocaleString()} TKN, available ${availableBalance.toLocaleString()} TKN.`
        );
      }
      return;
    }

    setSubmitting(true);
    try {
      const batch = selectedEntries.map(([option, category]) => ({
        category,
        option,
        amount: getResolvedStake(option, category),
      }));
      await engine.placeSideBetBatch(board.id, batch);
      setSelectedOptions({});
      onConfirmed?.();
    } catch (err) {
      if (err instanceof InsufficientTokensError && onInsufficientBalance) {
        onInsufficientBalance({
          title: 'Insufficient Tokens for Side Bet',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to confirm selected side bets.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="font-display text-sm font-bold text-amber-100">
            Side-Betting Options (All 3 Sections · Multi-Select)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono-tabular">
          {isWindowOpen && round ? (
            <span className="rounded-md border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-300">
              {board.phase === GamePhase.LOBBY_COUNTDOWN
                ? `1st Roll Open (${round.rollerUsername}) · Starts ${board.lobbySecondsRemaining}s`
                : `Open · ${formatCountdown(round.secondsRemaining)}`}
            </span>
          ) : (
            <span className="rounded-md border border-amber-400/30 bg-[#180805] px-2.5 py-0.5 font-semibold text-amber-200/80">
              {DiceBoard.SIDE_BET_WINDOW_SECONDS}s Window Opens Next Turn
            </span>
          )}
        </div>
      </div>

      {/* ALL 3 SECTIONS RENDERED SIMULTANEOUSLY — ZERO EMPTY GRID SLOTS */}
      <div className="space-y-3.5">
        {ALL_SECTIONS.map((section) => (
          <div key={section.category} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-200">{section.title}</span>
              <span className="text-[11px] font-mono-tabular text-amber-200/65">
                {section.category === SideBetCategory.SINGLE && lockedSinglesCount > 0
                  ? `${section.subtitle} · ${lockedSinglesCount} locked`
                  : section.subtitle}
              </span>
            </div>

            <div className={section.gridClass}>
              {SIDE_BET_OPTIONS[section.category].map((opt) => {
                const isSelected = Boolean(selectedOptions[opt.key]);
                const summary = summaries.find(
                  (s) => s.category === section.category && s.option === opt.key
                );
                const totalPlaced = summary?.totalPlaced ?? 0;
                const totalMatched = summary?.totalMatched ?? 0;
                const totalUnmatched = summary?.totalUnmatched ?? 0;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleOption(section.category, opt.key)}
                    className={`flex flex-col justify-between rounded-xl border p-2 sm:p-2.5 text-left cursor-pointer transition-all w-full ${
                      isSelected
                        ? 'border-amber-300 bg-gradient-to-b from-[#5A2414] to-[#3B160D] shadow-[0_0_12px_rgba(245,158,11,0.22)]'
                        : 'border-amber-500/25 bg-[#180805] hover:border-amber-400/55 hover:bg-[#230C08]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="text-[11px] sm:text-xs font-extrabold text-amber-50 truncate">
                        {opt.label}
                      </span>
                      {isSelected ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 text-[#2A0E07]">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      ) : summary && summary.bettorsCount > 0 ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-200/75 font-mono-tabular shrink-0">
                          <Users className="h-3 w-3" />
                          {summary.bettorsCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 sm:mt-1.5 flex items-center justify-between gap-1 text-[10px] font-mono-tabular">
                      <span className="text-amber-200/65 truncate">
                        <span className="hidden sm:inline">Pool </span>
                        <strong className="text-amber-100">{totalPlaced.toLocaleString()}</strong>
                      </span>
                      {totalMatched > 0 ? (
                        <span className="text-emerald-400 truncate">
                          {totalMatched.toLocaleString()}
                        </span>
                      ) : totalUnmatched > 0 ? (
                        <span className="text-amber-300 truncate">{totalUnmatched.toLocaleString()}</span>
                      ) : (
                        <span className="text-amber-200/40">0</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* UNIFIED BATCH STAKE & CONFIRM ALL BAR (Full Width, No Empty Gaps) */}
      <div className="rounded-xl border border-amber-400/35 bg-[#180805] p-3.5 space-y-3">
        {selectedEntries.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200/75">
            <span className="flex items-center gap-1.5">
              <DiceTokenIcon size="sm" />
              Select options from any or all 3 sections above to bet together in one confirmation.
            </span>
            <span className="font-mono-tabular text-[11px] text-amber-300">
              Min {TokenEconomy.MIN_BET_TOKENS.toLocaleString()} TKN / option
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-amber-100">
                Selected Bets ({selectedEntries.length}) · Total{' '}
                <span className="font-mono-tabular text-amber-300">
                  {totalSelectedStake.toLocaleString()} TKN
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-amber-200/65">Set all:</span>
                {[1, 2, 5, 10].map((mult) => {
                  const preset = TokenEconomy.MIN_BET_TOKENS * mult;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPresetToAllSelected(preset)}
                      className="rounded-md border border-amber-500/30 bg-[#2A100B] px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-amber-200 hover:border-amber-300 cursor-pointer"
                    >
                      {preset.toLocaleString()}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedOptions({})}
                  className="ml-1 flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {selectedEntries.map(([opt, cat]) => {
                const defaultForOpt =
                  cat === SideBetCategory.SINGLE
                    ? TokenEconomy.MIN_BET_TOKENS
                    : TokenEconomy.MIN_BET_TOKENS * 2;
                const rawVal = stakesByOption[opt] ?? String(defaultForOpt);
                const numVal = Number(rawVal);
                const resolvedForInput =
                  Number.isNaN(numVal) || numVal < TokenEconomy.MIN_BET_TOKENS
                    ? defaultForOpt
                    : numVal;
                const tier = engine.feeStrategy.resolveTierForAmount(resolvedForInput);
                return (
                  <div
                    key={opt}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-[#250E09] px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-amber-100 truncate">{opt}</div>
                      <div className="text-[10px] font-mono-tabular text-amber-200/65">
                        Fee {(tier.feeRate * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={TokenEconomy.MIN_BET_TOKENS}
                        step={1}
                        value={rawVal}
                        onChange={(e) =>
                          setStakesByOption((prev) => ({ ...prev, [opt]: e.target.value }))
                        }
                        onBlur={() => {
                          const parsed = Number(rawVal);
                          if (!Number.isFinite(parsed) || parsed < TokenEconomy.MIN_BET_TOKENS) {
                            setStakesByOption((prev) => ({
                              ...prev,
                              [opt]: String(defaultForOpt),
                            }));
                          } else {
                            setStakesByOption((prev) => ({
                              ...prev,
                              [opt]: String(Math.round(parsed)),
                            }));
                          }
                        }}
                        aria-label={`Stake for ${opt}`}
                        className="w-20 rounded-md border border-amber-400/40 bg-[#140705] px-2 py-1 text-right font-mono-tabular text-xs font-bold text-amber-100 focus:border-amber-300 focus:outline-none"
                      />
                      <span className="text-[10px] font-bold text-amber-300/80">TKN</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedOption(opt)}
                        aria-label={`Remove selected bet ${opt}`}
                        title={`Remove ${opt}`}
                        className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/30 hover:text-rose-100 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-2 border-t border-amber-500/15">
              <span className="flex items-center gap-1.5 text-[11px] text-amber-200/75">
                <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                Locked on confirm · Unmatched amounts auto-returned
              </span>

              {!canPlaceSideBets && onPayEntryFee ? (
                <button
                  type="button"
                  onClick={onPayEntryFee}
                  className="w-full sm:w-auto rounded-xl border-b-4 border-sky-900 bg-gradient-to-b from-sky-300 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white hover:from-sky-200 hover:to-blue-500 cursor-pointer whitespace-nowrap shadow-md"
                >
                  Pay {board.tier.spectatorEntryFee.toLocaleString()} TKN Entry Fee to Side-Bet
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canPlaceSideBets || !isWindowOpen || submitting}
                  onClick={() => void handleConfirmAll()}
                  className="w-full sm:w-auto rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-md"
                >
                  {submitting
                    ? 'Confirming Bets...'
                    : !canPlaceSideBets
                    ? 'Join Room First to Confirm'
                    : !isWindowOpen
                    ? `Waiting for ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window`
                    : `CONFIRM ALL BETS (${selectedEntries.length} · ${totalSelectedStake.toLocaleString()} TKN)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Live Round Pool Entries (when active) */}
      {round && round.bets.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-amber-200/80">
            Active Round Pool ({round.bets.length} bets locked)
          </div>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-amber-500/20 bg-[#160705] divide-y divide-amber-500/10">
            {round.bets.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
              >
                <div className="truncate text-amber-100/85">
                  <span className="font-semibold text-amber-100">{b.username}</span> ·{' '}
                  <span className="font-mono-tabular text-amber-300">{b.option}</span>
                </div>
                <div className="flex items-center gap-2 font-mono-tabular shrink-0 text-[11px]">
                  <span className="text-amber-100">{b.originalStake.toLocaleString()} TKN</span>
                  {b.matchedStake > 0 ? (
                    <span className="text-emerald-400">Matched {b.matchedStake.toLocaleString()}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-300">
                      <ShieldAlert className="h-3 w-3" />
                      Waiting Match
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
