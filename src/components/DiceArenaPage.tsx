import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dices,
  Eye,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Ticket,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { DiceBoard } from '../domain/DiceBoard';
import { TokenEconomy } from '../domain/TokenEconomy';
import { GamePhase, TierId } from '../domain/types';
import { BetSpotEngine, InsufficientTokensError } from '../services/BetSpotEngine';
import { useDiceCountdownAudio } from '../hooks/useDiceCountdownAudio';
import { ROOM_ARENA_THEMES } from '../three/daduketaTextures';
import { AvatarFrame } from './AvatarFrame';
import { ArenaRoomLedger, RoomLedgerTab } from './ArenaRoomLedger';
import { Daduketa3DArena } from './Daduketa3DArena';
import { DaduketaDieFace } from './DaduketaDieFace';
import { DiceTokenIcon } from './DiceTokenIcon';
import { PreJoinBetModal } from './PreJoinBetModal';
import { SideBetArenaView } from './SideBetArenaView';
import { SideBettingPanel } from './SideBettingPanel';
import { TopUpPromptData } from './TopUpRequiredModal';
import { WaitingRoomOverlay } from './WaitingRoomOverlay';

interface DiceArenaPageProps {
  engine: BetSpotEngine;
  onError: (msg: string) => void;
  onInsufficientBalance: (prompt: TopUpPromptData) => void;
  directEntryBoardRequest?: { boardId: string; nonce: number } | null;
}

type ArenaScreen = 'lobby' | 'searching' | 'play' | 'sidebet_list' | 'sidebet_board';

const TIER_CARD_STYLES = [
  'from-[#7C3F1D] via-[#5B2B12] to-[#361708] border-amber-600/60',
  'from-[#475569] via-[#334155] to-[#1E293B] border-slate-300/60',
  'from-[#B57618] via-[#8F5910] to-[#573407] border-amber-300/70',
  'from-[#5B21B6] via-[#4C1D95] to-[#2E1065] border-violet-300/75',
  'from-[#0891B2] via-[#0E7490] to-[#083344] border-cyan-300/85',
  'from-[#581C3A] via-[#3A1025] to-[#1C0611] border-amber-300/80',
];

export const DiceArenaPage: React.FC<DiceArenaPageProps> = ({
  engine,
  onError,
  onInsufficientBalance,
  directEntryBoardRequest,
}) => {
  const [screen, setScreen] = useState<ArenaScreen>('lobby');
  const [selectedTierId, setSelectedTierId] = useState<TierId>(TierId.TIER_1);
  const [enteredBoardId, setEnteredBoardId] = useState<string | null>(null);
  const [focusedCardIdx, setFocusedCardIdx] = useState<number>(0);
  const [betInput, setBetInput] = useState<string>(() => String(TokenEconomy.MIN_BET_TOKENS));
  const [isBetPopupOpen, setIsBetPopupOpen] = useState<boolean>(false);
  const [ledgerTab, setLedgerTab] = useState<RoomLedgerTab>('rolls');
  const [searchingRoom, setSearchingRoom] = useState<{
    tierId: TierId;
    boardId: string;
    roomName: string;
    maxSeats: number;
    betAmount: number;
  } | null>(null);
  const [preJoinTier, setPreJoinTier] = useState<{
    tierId: TierId;
    idx: number;
    isNextRound?: boolean;
    fromBoardId?: string;
  } | null>(null);
  const [preJoinBetInput, setPreJoinBetInput] = useState<string>('');
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [animatedWinTokens, setAnimatedWinTokens] = useState<number>(0);
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const activeUser = engine.activeUser;
  const activePlayBoard = enteredBoardId ? engine.getBoard(enteredBoardId) : null;

  useDiceCountdownAudio(activePlayBoard, screen === 'play');

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const settledWinnerMatch =
    screen === 'play' &&
    activePlayBoard?.phase === GamePhase.SETTLED &&
    activePlayBoard.matchHistory[0]?.winnerUserId === activeUser.id
      ? activePlayBoard.matchHistory[0]
      : null;
  const settledWinKey = settledWinnerMatch
    ? `${activePlayBoard?.id}_${settledWinnerMatch.matchNumber}`
    : '';

  useEffect(() => {
    if (!settledWinnerMatch) {
      setAnimatedWinTokens(0);
      return;
    }
    const target = settledWinnerMatch.netPayout;
    const durationMs = 950;
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedWinTokens(Math.round(target * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [settledWinKey]);

  // Automatically transition from Waiting Animation -> Play Ground as soon as 2+ players are seated or match starts
  useEffect(() => {
    if (screen !== 'searching' || !searchingRoom) return;
    try {
      const liveBoard = engine.getBoard(searchingRoom.boardId);
      const matchStarted =
        liveBoard.occupiedCount >= 2 ||
        (liveBoard.phase !== GamePhase.WAITING_FOR_PLAYERS &&
          liveBoard.phase !== GamePhase.LOBBY_COUNTDOWN);
      if (matchStarted) {
        setSearchingRoom(null);
        setScreen('play');
      }
    } catch {
      // Ignore if board not yet synced
    }
  });

  useEffect(() => {
    if (!directEntryBoardRequest?.boardId) return;
    try {
      const targetBoard = engine.getBoard(directEntryBoardRequest.boardId);
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setSelectedTierId(targetBoard.tier.id);
      setEnteredBoardId(targetBoard.id);
      const userSeat = targetBoard.occupiedSeats.find((s) => s.userId === activeUser.id);
      setBetInput(
        String(userSeat?.initialBet ?? targetBoard.currentMinBet ?? targetBoard.tier.minTokens)
      );
      setIsBetPopupOpen(false);
      setScreen('play');
    } catch {
      // Ignore stale invite board ID
    }
  }, [directEntryBoardRequest?.nonce]);

  const scrollToTierIdx = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(TokenEconomy.TIERS.length - 1, nextIdx));
    setFocusedCardIdx(clamped);
    const el = carouselRef.current;
    if (!el) return;
    const targetCard = el.children[clamped] as HTMLElement | undefined;
    if (targetCard) {
      const targetLeft =
        targetCard.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      el.scrollTo({
        left: targetLeft,
        behavior: 'smooth',
      });
    }
  };

  const slideCarousel = (direction: 'left' | 'right') => {
    const nextIdx = direction === 'left' ? focusedCardIdx - 1 : focusedCardIdx + 1;
    scrollToTierIdx(nextIdx);
  };

  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const elLeft = el.getBoundingClientRect().left;
    let closestIdx = 0;
    let minDiff = Infinity;
    Array.from(el.children).forEach((child, idx) => {
      const card = child as HTMLElement;
      const diff = Math.abs(card.getBoundingClientRect().left - elLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    if (closestIdx !== focusedCardIdx) {
      setFocusedCardIdx(closestIdx);
    }
  };

  const handleClickPlayDice = (tierId: TierId, idx: number) => {
    if (actionBusy) return;
    const tier = engine.feeStrategy.getTierById(tierId);
    setFocusedCardIdx(idx);
    setSelectedTierId(tierId);
    setRoomNotice(null);
    setPreJoinBetInput(String(tier.minTokens));
    setPreJoinTier({ tierId, idx });
  };

  const handleConfirmPreJoinBet = async () => {
    if (actionBusy || !preJoinTier) return;
    const tier = engine.feeStrategy.getTierById(preJoinTier.tierId);
    const parsed = Number(preJoinBetInput);
    const roundedBet = Number.isFinite(parsed) ? Math.round(parsed) : 0;

    if (roundedBet < tier.minTokens || roundedBet > tier.maxTokens) {
      onError(
        `Bet for ${tier.label} must be between ${tier.minTokens.toLocaleString()} and ${tier.maxTokens.toLocaleString()} TKN.`
      );
      return;
    }

    if (activeUser.wallet.availableBalance < roundedBet) {
      setPreJoinTier(null);
      onInsufficientBalance({
        title: 'Insufficient Tokens to Play Dice',
        message: `You need ${roundedBet.toLocaleString()} TKN in your available balance to join ${tier.label}.`,
        requiredTokens: roundedBet,
        availableTokens: activeUser.wallet.availableBalance,
      });
      return;
    }

    setActionBusy(true);
    try {
      if (preJoinTier.isNextRound && preJoinTier.fromBoardId) {
        try {
          const fromBoard = engine.getBoard(preJoinTier.fromBoardId);
          if (fromBoard.phase === GamePhase.SETTLED) {
            await engine.resetDiceBoardForNextMatch(preJoinTier.fromBoardId);
          }
        } catch {
          // Board may have already been reset by another player
        }
      }

      const outcome = await engine.enterTierForPlay(preJoinTier.tierId, roundedBet);
      setPreJoinTier(null);
      setEnteredBoardId(outcome.board.id);
      setBetInput(String(roundedBet));
      setIsBetPopupOpen(false);

      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      const matchReadyImmediately =
        outcome.board.occupiedCount >= 2 ||
        (outcome.board.phase !== GamePhase.WAITING_FOR_PLAYERS &&
          outcome.board.phase !== GamePhase.LOBBY_COUNTDOWN);

      if (matchReadyImmediately) {
        setSearchingRoom(null);
        setScreen('play');
      } else {
        const roomName =
          outcome.board.tier.label.split('·')[1]?.trim() ?? outcome.board.tier.label;
        setSearchingRoom({
          tierId: preJoinTier.tierId,
          boardId: outcome.board.id,
          roomName,
          maxSeats: outcome.board.maxSeats,
          betAmount: roundedBet,
        });
        setScreen('searching');
      }
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        setPreJoinTier(null);
        onInsufficientBalance({
          title: 'Insufficient Tokens to Play Dice',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to enter Play Dice room.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleClickSideBetTier = (tierId: TierId, idx: number) => {
    setFocusedCardIdx(idx);
    setSelectedTierId(tierId);
    setScreen('sidebet_list');
  };

  const handlePayAndEnterSideBetBoard = async (board: DiceBoard) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const entered = await engine.enterBoardAsSideBettor(board.id);
      setEnteredBoardId(entered.id);
      setScreen('sidebet_board');
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        onInsufficientBalance({
          title: 'Top Up Required to Side Bet',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to enter room for Side Bet.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const openBetDashboard = () => {
    setIsBetPopupOpen(true);
  };

  useEffect(() => {
    if (!isBetPopupOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBetPopupOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBetPopupOpen]);

  const renderPreJoinModal = () => {
    if (!preJoinTier) return null;
    const tier = engine.feeStrategy.getTierById(preJoinTier.tierId);
    return (
      <PreJoinBetModal
        tier={tier}
        isNextRound={preJoinTier.isNextRound}
        betInput={preJoinBetInput}
        availableBalance={activeUser.wallet.availableBalance}
        busy={actionBusy}
        onChangeBetInput={setPreJoinBetInput}
        onConfirm={() => void handleConfirmPreJoinBet()}
        onClose={() => setPreJoinTier(null)}
      />
    );
  };

  // --- 1. LOBBY VIEW: 6 Horizontally Sliding Tier Cards ---
  if (screen === 'lobby') {
    return (
      <div className="space-y-6">
        {roomNotice && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/45 bg-[#33140D] px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg">
            <span>{roomNotice}</span>
            <button
              type="button"
              onClick={() => setRoomNotice(null)}
              aria-label="Dismiss notification"
              className="text-amber-300 hover:text-amber-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* 6 Sliding Tier Cards with Flanking Left / Right Navigation Buttons */}
        <div className="rounded-2xl border-2 border-amber-500/30 bg-[#230C08]/90 p-2.5 sm:p-5 shadow-xl">
          <div className="flex items-center gap-2 sm:gap-3.5">
            <button
              type="button"
              onClick={() => slideCarousel('left')}
              disabled={focusedCardIdx === 0}
              aria-label="Previous tier board"
              className="flex h-11 w-9 sm:h-12 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/45 bg-[#33140D] text-amber-200 hover:bg-[#4A1D13] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-md"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex flex-1 min-w-0 gap-3 sm:gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2"
            >
              {TokenEconomy.TIERS.map((tier, idx) => {
                const style = TIER_CARD_STYLES[idx % TIER_CARD_STYLES.length];

                return (
                  <div
                    key={tier.id}
                    className={`snap-start shrink-0 w-full sm:w-[310px] flex flex-col justify-between rounded-2xl border-2 bg-gradient-to-b p-4 sm:p-5 shadow-lg transition-transform duration-150 sm:hover:-translate-y-1 ${style}`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200/90">
                            Tier {idx + 1} Room
                          </div>
                          <h2 className="font-display mt-0.5 text-lg font-extrabold text-white">
                            {tier.label.split('·')[1]?.trim() ?? tier.label}
                          </h2>
                        </div>
                        <span className="rounded-md border border-amber-300/40 bg-black/30 px-2 py-1 font-mono-tabular text-xs font-bold text-amber-200">
                          {(tier.feeRate * 100).toFixed(0)}% Fee
                        </span>
                      </div>

                      <div className="space-y-2 rounded-xl border border-white/15 bg-black/25 p-3.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/75">Bet Range</span>
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono-tabular font-bold text-amber-200 text-right">
                            <DiceTokenIcon size="xs" />
                            <span>
                              {tier.minTokens.toLocaleString()} – {tier.maxTokens.toLocaleString()} TKN
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/75">Side-Bet Fee</span>
                          <span className="inline-flex items-center gap-1 font-mono-tabular font-semibold text-white">
                            <DiceTokenIcon size="xs" />
                            <span>{tier.spectatorEntryFee.toLocaleString()} TKN</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/75">Players Per Room</span>
                          <span className="font-mono-tabular font-bold text-emerald-300 text-right">
                            {tier.maxSeats} Players
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* TWO ENTRY OPTIONS PER TIER CARD */}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleClickPlayDice(tier.id, idx)}
                        className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer shadow-md whitespace-nowrap"
                      >
                        <Swords className="h-3.5 w-3.5 shrink-0" />
                        Play Dice
                      </button>

                      <button
                        type="button"
                        onClick={() => handleClickSideBetTier(tier.id, idx)}
                        className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 rounded-xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-500 px-3 py-2.5 text-xs font-extrabold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 cursor-pointer shadow-md whitespace-nowrap"
                      >
                        <Layers className="h-3.5 w-3.5 shrink-0" />
                        Side Bet
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => slideCarousel('right')}
              disabled={focusedCardIdx === TokenEconomy.TIERS.length - 1}
              aria-label="Next tier board"
              className="flex h-11 w-9 sm:h-12 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/45 bg-[#33140D] text-amber-200 hover:bg-[#4A1D13] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-md"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            {TokenEconomy.TIERS.map((tier, idx) => (
              <button
                key={tier.id}
                type="button"
                aria-label={`Focus Tier ${idx + 1}`}
                onClick={() => scrollToTierIdx(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  focusedCardIdx === idx ? 'w-7 bg-amber-300' : 'w-2 bg-amber-500/35 hover:bg-amber-400/60'
                }`}
              />
            ))}
          </div>
        </div>
        {renderPreJoinModal()}
      </div>
    );
  }

  // --- 1B. MATCHMAKING / WAITING FOR PLAYERS ANIMATION ---
  if (screen === 'searching' && searchingRoom) {
    let liveSearchingBoard: DiceBoard | null = null;
    try {
      liveSearchingBoard = engine.getBoard(searchingRoom.boardId);
    } catch {
      liveSearchingBoard = null;
    }

    return (
      <WaitingRoomOverlay
        tierId={searchingRoom.tierId}
        roomName={searchingRoom.roomName}
        maxSeats={searchingRoom.maxSeats}
        betAmount={searchingRoom.betAmount}
        occupiedCount={liveSearchingBoard?.occupiedCount ?? 1}
        busy={actionBusy}
        onCancelAndRefund={() => {
          if (searchTimeoutRef.current !== null) {
            window.clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = null;
          }
          void (async () => {
            try {
              await engine.leaveMainSeat(searchingRoom.boardId);
            } catch {
              await engine.leaveLobbyVisitor(searchingRoom.boardId);
            }
            setSearchingRoom(null);
            setEnteredBoardId(null);
            setScreen('lobby');
          })();
        }}
      />
    );
  }

  // --- 2. SIDE BET ACTIVE BOARDS PICKER ---
  if (screen === 'sidebet_list') {
    const tier = engine.feeStrategy.getTierById(selectedTierId);
    const activeBoards = engine.getActivePlayingBoardsForTier(selectedTierId);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setScreen('lobby')}
            className="flex items-center gap-2 rounded-lg border border-amber-400/35 bg-[#2A100B] px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-[#3B170F] cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Room Lobby
          </button>

          <div className="text-left sm:text-right">
            <h1 className="font-display text-lg sm:text-xl font-bold text-amber-100">
              {tier.label} · Active Playing Rooms
            </h1>
            <p className="text-xs text-amber-200/75">
              Pay the {tier.spectatorEntryFee.toLocaleString()} TKN system entry fee to enter a room for Side Betting (Watch &amp; Side-Bet Only).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-sky-400/35 bg-[#16294A]/70 px-4 py-3 text-xs text-sky-100">
          <Eye className="h-4 w-4 text-sky-300 shrink-0" />
          <span>
            Choose any active room below where players are currently playing. Entering through Side Bet lets you watch the live game and place side bets only — main seat play is disabled.
          </span>
        </div>

        {activeBoards.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/25 bg-[#260E09] p-8 text-center space-y-3">
            <div className="text-sm font-bold text-amber-100">
              No active rooms with players in {tier.label} right now.
            </div>
            <p className="text-xs text-amber-200/70 max-w-md mx-auto">
              Rooms appear here as soon as players join or start a match in this tier. Return to the Room Lobby to check another active tier or start a room via Play Dice.
            </p>
            <button
              type="button"
              onClick={() => setScreen('lobby')}
              className="rounded-xl border-b-2 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2 text-xs font-extrabold text-[#2A0E07] cursor-pointer"
            >
              Back to Room Lobby
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeBoards.map((b) => {
              const isUserPlayingHere = b.isUserSeated(activeUser.id);
              const alreadyPaidFee = b.isUserSideBettor(activeUser.id);
              const potDisplay =
                b.phase === GamePhase.IN_PROGRESS_ROLL ||
                b.phase === GamePhase.SIDE_BET_WINDOW ||
                b.phase === GamePhase.TIE_BREAKER
                  ? b.lockedPot
                  : b.projectedPot;
              const phaseLabel =
                b.phase === GamePhase.SIDE_BET_WINDOW
                  ? `Side-Bet Window (${b.activeSideBetRound?.secondsRemaining ?? DiceBoard.SIDE_BET_WINDOW_SECONDS}s)`
                  : b.phase === GamePhase.IN_PROGRESS_ROLL
                  ? 'Live Rolling Match'
                  : b.phase === GamePhase.TIE_BREAKER
                  ? 'Tie-Breaker Active'
                  : `Lobby Starting (${b.lobbySecondsRemaining}s)`;

              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-2xl border-2 border-amber-500/35 bg-gradient-to-b from-[#3A170E] to-[#220B07] p-5 shadow-lg space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          Room #{b.tableNumber} · Match #{b.matchCounter}
                        </div>
                        <h2 className="font-display text-base font-extrabold text-amber-50">
                          {tier.label.split('·')[1]?.trim() ?? tier.label}
                        </h2>
                      </div>
                      <span className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                        {phaseLabel}
                      </span>
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-amber-500/20 bg-[#180805] p-3 text-xs font-mono-tabular">
                      <div className="flex justify-between">
                        <span className="text-amber-100/65">Active Players</span>
                        <span className="font-bold text-amber-100">
                          {b.occupiedCount} / {b.maxSeats}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-100/65">Current Room Pot</span>
                        <span className="font-bold text-amber-300">{potDisplay.toLocaleString()} TKN</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-100/65">System Entry Fee</span>
                        <span className="font-bold text-sky-300">
                          {b.tier.spectatorEntryFee.toLocaleString()} TKN
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {b.occupiedSeats.slice(0, 5).map((s) => {
                        const seatUser = engine.userLookup(s.userId);
                        return (
                          <div
                            key={s.seatIndex}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-[#1B0906] px-2 py-1 text-[11px] text-amber-100"
                          >
                            <AvatarFrame
                              src={s.avatarUrl}
                              username={s.username}
                              size="sm"
                              frameId={seatUser?.avatarFrameId}
                              country={seatUser?.country || undefined}
                            />
                            <span className="truncate max-w-[80px]">{s.username}</span>
                          </div>
                        );
                      })}
                      {b.occupiedCount > 5 && (
                        <span className="text-[11px] font-mono-tabular text-amber-200/70">
                          +{b.occupiedCount - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  {isUserPlayingHere ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => {
                        setEnteredBoardId(b.id);
                        setScreen('sidebet_board');
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer shadow-md whitespace-nowrap"
                    >
                      <Layers className="h-4 w-4" />
                      Your Active Room · Side Bet Free
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handlePayAndEnterSideBetBoard(b)}
                      className="flex items-center justify-center gap-2 rounded-xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-xs font-extrabold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 disabled:opacity-60 cursor-pointer shadow-md whitespace-nowrap"
                    >
                      <Ticket className="h-4 w-4" />
                      {alreadyPaidFee
                        ? 'Enter Side-Bet Arena (Fee Paid)'
                        : `Pay ${b.tier.spectatorEntryFee.toLocaleString()} TKN & Watch / Side Bet`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Resolve active board for 'sidebet_board' or 'play'
  const board: DiceBoard = engine.getBoard(enteredBoardId ?? engine.diceBoards[0].id);

  // --- 3. SIDE-BET BOARD VIEW (Watch & Side-Bet Only) ---
  if (screen === 'sidebet_board') {
    return (
      <SideBetArenaView
        board={board}
        engine={engine}
        onBackToActiveBoards={() => setScreen('sidebet_list')}
        onError={onError}
        onInsufficientBalance={onInsufficientBalance}
      />
    );
  }

  // --- 4. PLAY DICE VIEW (Separated Joined Players Panel | Main Plank Arena | Bottom Slide-Up Betting Popup) ---
  const isSeated = board.isUserActivelySeated(activeUser.id);
  const currentSeat = board.occupiedSeats.find((s) => s.userId === activeUser.id && !s.hasLeftMatch) ?? null;

  const handleJoinMainSeat = async () => {
    if (actionBusy) return;
    const amount = Number(betInput);
    const roundedBet = Number.isNaN(amount) ? 0 : Math.round(amount);
    if (
      roundedBet >= board.tier.minTokens &&
      roundedBet <= board.tier.maxTokens &&
      activeUser.wallet.availableBalance < roundedBet
    ) {
      onInsufficientBalance({
        title: 'Insufficient Tokens for Seat Bet',
        message: `You need ${roundedBet.toLocaleString()} TKN in your available balance to join this seat. Please top up your account.`,
        requiredTokens: roundedBet,
        availableTokens: activeUser.wallet.availableBalance,
      });
      return;
    }

    setActionBusy(true);
    try {
      await engine.joinMainSeat(board.id, amount);
      setIsBetPopupOpen(false);
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        setIsBetPopupOpen(false);
        onInsufficientBalance({
          title: 'Insufficient Tokens for Seat Bet',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to place bet and take seat.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateSeatBet = async () => {
    if (actionBusy) return;
    const amount = Number(betInput);
    const roundedBet = Number.isNaN(amount) ? 0 : Math.round(amount);
    const effectiveAvailable =
      activeUser.wallet.availableBalance + (currentSeat?.initialBet ?? 0);
    if (
      roundedBet >= board.tier.minTokens &&
      roundedBet <= board.tier.maxTokens &&
      effectiveAvailable < roundedBet
    ) {
      onInsufficientBalance({
        title: 'Insufficient Tokens to Raise Bet',
        message: `Raising your seat stake to ${roundedBet.toLocaleString()} TKN requires ${(
          roundedBet - effectiveAvailable
        ).toLocaleString()} more TKN. Please top up your account.`,
        requiredTokens: roundedBet - (currentSeat?.initialBet ?? 0),
        availableTokens: activeUser.wallet.availableBalance,
      });
      return;
    }

    setActionBusy(true);
    try {
      await engine.updateMainSeatBet(board.id, amount);
      setIsBetPopupOpen(false);
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        setIsBetPopupOpen(false);
        onInsufficientBalance({
          title: 'Insufficient Tokens to Raise Bet',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to update bet amount.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeaveMainSeat = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await engine.leaveMainSeat(board.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Cannot leave seat now.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRollDice = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await engine.executeUserTurnRoll(board.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Roll failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleQuickStartMatch = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await engine.quickStartMatch(board.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to start match yet.');
    } finally {
      setActionBusy(false);
    }
  };

  const currentTurnSeat =
    board.currentTurnSeatIndex !== null ? board.seats[board.currentTurnSeatIndex] : null;
  const minBetDisplay = board.currentMinBet ?? board.tier.minTokens;
  const activePot =
    board.phase === GamePhase.IN_PROGRESS_ROLL ||
    board.phase === GamePhase.SIDE_BET_WINDOW ||
    board.phase === GamePhase.TIE_BREAKER
      ? board.lockedPot
      : board.projectedPot;

  const isPreMatch =
    board.phase === GamePhase.WAITING_FOR_PLAYERS || board.phase === GamePhase.LOBBY_COUNTDOWN;
  const isUserOwnRollTurn =
    (board.phase === GamePhase.IN_PROGRESS_ROLL || board.phase === GamePhase.TIE_BREAKER) &&
    currentTurnSeat !== null &&
    currentTurnSeat.userId === activeUser.id;
  const isOtherPlayerActiveTurn =
    (board.phase === GamePhase.IN_PROGRESS_ROLL ||
      board.phase === GamePhase.TIE_BREAKER ||
      board.phase === GamePhase.SIDE_BET_WINDOW) &&
    !isUserOwnRollTurn;

  const turnCountdownProgress: number | undefined =
    board.pendingRollReveal
      ? 0
      : board.phase === GamePhase.SIDE_BET_WINDOW && board.activeSideBetRound
      ? Math.max(
          0,
          Math.min(1, board.activeSideBetRound.secondsRemaining / DiceBoard.SIDE_BET_WINDOW_SECONDS)
        )
      : board.phase === GamePhase.IN_PROGRESS_ROLL || board.phase === GamePhase.TIE_BREAKER
      ? Math.max(
          0,
          Math.min(1, board.turnRollSecondsRemaining / DiceBoard.TURN_ROLL_TIMEOUT_SECONDS)
        )
      : undefined;

  const formatMmSs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeCountdownSeconds: number | null =
    board.phase === GamePhase.LOBBY_COUNTDOWN
      ? board.lobbySecondsRemaining
      : board.phase === GamePhase.SIDE_BET_WINDOW && board.activeSideBetRound
      ? board.activeSideBetRound.secondsRemaining
      : (board.phase === GamePhase.IN_PROGRESS_ROLL || board.phase === GamePhase.TIE_BREAKER) &&
        !board.pendingRollReveal
      ? board.turnRollSecondsRemaining
      : null;
  const isCountdownUrgent = activeCountdownSeconds !== null && activeCountdownSeconds > 0 && activeCountdownSeconds <= 5;
  const isCountdownWarning = activeCountdownSeconds !== null && activeCountdownSeconds > 5 && activeCountdownSeconds <= 10;

  const dashboardCountdownText =
    board.phase === GamePhase.LOBBY_COUNTDOWN
      ? `Lobby Starts in ${formatMmSs(board.lobbySecondsRemaining)}`
      : board.phase === GamePhase.SIDE_BET_WINDOW && board.activeSideBetRound
      ? `Side-Bet Countdown: ${formatMmSs(board.activeSideBetRound.secondsRemaining)}`
      : isOtherPlayerActiveTurn && currentTurnSeat
      ? `${currentTurnSeat.username}'s Turn · Auto-Throw ${formatMmSs(board.turnRollSecondsRemaining)}`
      : isUserOwnRollTurn
      ? `Your Turn · Auto-Throw ${formatMmSs(board.turnRollSecondsRemaining)}`
      : isSeated
      ? `Your Seat: ${currentSeat?.initialBet.toLocaleString()} TKN`
      : `Range ${board.tier.minTokens.toLocaleString()}–${board.tier.maxTokens.toLocaleString()} TKN`;

  const stepBase = Math.max(1, board.tier.minTokens);
  const midStake = Math.round(((board.tier.minTokens + board.tier.maxTokens) / 2) / stepBase) * stepBase;
  const quickStakes = Array.from(
    new Set([
      board.tier.minTokens,
      Math.min(board.tier.maxTokens, board.tier.minTokens * 2),
      Math.min(board.tier.maxTokens, Math.max(board.tier.minTokens, midStake)),
    ])
  ).sort((a, b) => a - b);

  // Map empty seats to any joining visitors waiting to place their bet
  const emptySeatIndices = board.seats
    .map((s, idx) => (s === null ? idx : -1))
    .filter((idx) => idx !== -1);
  const visitorBySlot = new Map<number, (typeof board.lobbyVisitors)[number]>();
  board.lobbyVisitors.forEach((v, i) => {
    if (i < emptySeatIndices.length) {
      visitorBySlot.set(emptySeatIndices[i], v);
    }
  });

  const renderSeatSlot = (seatIndex: number) => {
    const seat = board.seats[seatIndex];
    const visitor = !seat ? visitorBySlot.get(seatIndex) : undefined;

    if (seat) {
      const isSelf = seat.userId === activeUser.id;
      const isTurn = board.currentTurnSeatIndex === seat.seatIndex;
      const seatUser = isSelf ? activeUser : engine.userLookup(seat.userId);
      const avatar = isSelf
        ? activeUser.avatarUrl
        : seat.avatarUrl ?? seatUser?.avatarUrl;
      const betVal = isPreMatch ? seat.initialBet : seat.lockedBet;
      const isInTieBreaker = board.tieBreakerUserIds.includes(seat.userId);
      const hasTieRolls = seat.tieBreakerRolls.length > 0;
      const mainRollFace = hasTieRolls ? seat.initialRollValue ?? null : seat.rollValue;

      const renderSeatResultBadge = (sz: 'sm' | 'md') => {
        if (hasTieRolls) {
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {mainRollFace && (
                <div className="flex items-center gap-0.5" title="Main Round Roll">
                  <span className="text-[8px] font-bold uppercase text-amber-200/70">R1</span>
                  <DaduketaDieFace face={mainRollFace} size="sm" />
                </div>
              )}
              {seat.tieBreakerRolls.map((tbFace, tbIdx) => (
                <div key={tbIdx} className="flex items-center gap-0.5" title={`Tie-Breaker #${tbIdx + 1}`}>
                  <span className="text-[8px] font-extrabold uppercase text-emerald-300">
                    TB{seat.tieBreakerRolls.length > 1 ? tbIdx + 1 : ''}
                  </span>
                  <DaduketaDieFace face={tbFace} size="sm" />
                </div>
              ))}
              {isTurn && !seat.hasRolled && (
                <span className="rounded bg-amber-400 px-1 py-0.5 text-[8px] font-extrabold text-[#2A0E07]">
                  TURN
                </span>
              )}
            </div>
          );
        }

        if (isInTieBreaker && !seat.hasRolled && seat.rollValue) {
          return (
            <div className="flex items-center gap-1" title="Tied Main Roll · Waiting for Tie-Breaker">
              <DaduketaDieFace face={seat.rollValue} size="sm" />
              <span className="rounded bg-amber-400 px-1 py-0.5 text-[8px] font-extrabold text-[#2A0E07]">
                {isTurn ? 'TURN' : 'TIE'}
              </span>
            </div>
          );
        }

        if (seat.rollValue) {
          return <DaduketaDieFace face={seat.rollValue} size={sz} />;
        }

        if (isTurn) {
          return (
            <span
              className={`rounded bg-amber-400 font-extrabold text-[#2A0E07] ${
                sz === 'sm' ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
              }`}
            >
              TURN
            </span>
          );
        }

        return (
          <span className="font-mono-tabular text-[10px] text-amber-200/55">
            #{seat.seatIndex + 1}
          </span>
        );
      };

      const hasLeft = Boolean(seat.hasLeftMatch);

      return (
        <div
          key={`seat_${seatIndex}`}
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 rounded-lg sm:rounded-xl border px-1.5 py-1.5 sm:px-2.5 sm:py-2 transition-all ${
            hasLeft
              ? 'border-zinc-700/50 bg-[#0D0605]/85 opacity-45 grayscale'
              : isTurn
              ? 'border-amber-300 bg-gradient-to-b sm:bg-gradient-to-r from-[#5A2414] to-[#3B160D] shadow-[0_0_16px_rgba(245,158,11,0.25)]'
              : isSelf
              ? 'border-emerald-400/60 bg-[#2E160F]'
              : 'border-amber-500/25 bg-[#1B0906]'
          }`}
        >
          {/* Mobile top bar puts Avatar + Badge side-by-side so Name & TKN get full card width */}
          <div className="flex items-center justify-between gap-1 sm:justify-start sm:gap-2 min-w-0 w-full sm:w-auto">
            <div className={hasLeft ? 'opacity-60 grayscale brightness-75 shrink-0' : 'shrink-0'}>
              <AvatarFrame
                src={avatar}
                username={seat.username}
                size="sm"
                highlighted={isTurn && !hasLeft}
                countdownProgress={isTurn && !hasLeft ? turnCountdownProgress : undefined}
                frameId={seatUser?.avatarFrameId}
                country={seatUser?.country || undefined}
              />
            </div>

            <div className="sm:hidden shrink-0">{renderSeatResultBadge('sm')}</div>

            <div className="hidden sm:block min-w-0">
              <div
                className={`flex items-center gap-1 text-[11px] font-bold truncate ${
                  hasLeft ? 'text-zinc-400' : 'text-amber-50'
                }`}
              >
                <span className={`truncate ${hasLeft ? 'line-through' : ''}`}>{seat.username}</span>
                {hasLeft && (
                  <span className="rounded bg-zinc-800 px-1 py-0.2 text-[8px] font-bold uppercase text-zinc-400 border border-zinc-600/50 shrink-0">
                    Left
                  </span>
                )}
                {isSelf && !hasLeft && (
                  <span className="text-[9px] text-emerald-400 shrink-0">(You)</span>
                )}
              </div>
              <div
                className={`font-mono-tabular text-[11px] font-semibold truncate ${
                  hasLeft ? 'text-zinc-500' : 'text-amber-300'
                }`}
              >
                {betVal.toLocaleString()} TKN
              </div>
            </div>
          </div>

          <div className="sm:hidden min-w-0 w-full">
            <div
              className={`flex items-center gap-0.5 text-[10px] font-bold leading-tight truncate ${
                hasLeft ? 'text-zinc-400' : 'text-amber-50'
              }`}
            >
              <span className={`truncate ${hasLeft ? 'line-through' : ''}`}>{seat.username}</span>
              {hasLeft && (
                <span className="rounded bg-zinc-800 px-1 text-[7px] font-bold uppercase text-zinc-400 shrink-0">
                  Left
                </span>
              )}
              {isSelf && !hasLeft && (
                <span className="text-[8px] text-emerald-400 shrink-0">(You)</span>
              )}
            </div>
            <div
              className={`font-mono-tabular text-[9.5px] font-semibold leading-tight truncate ${
                hasLeft ? 'text-zinc-500' : 'text-amber-300'
              }`}
            >
              {betVal.toLocaleString()} TKN
            </div>
          </div>

          <div className="hidden sm:block shrink-0 text-right">{renderSeatResultBadge('md')}</div>
        </div>
      );
    }

    if (visitor) {
      const visitorUser =
        visitor.userId === activeUser.id ? activeUser : engine.userLookup(visitor.userId);
      return (
        <div
          key={`seat_${seatIndex}`}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 rounded-lg sm:rounded-xl border border-dashed border-amber-400/45 bg-[#220C08] px-1.5 py-1.5 sm:px-2.5 sm:py-2"
        >
          <div className="flex items-center justify-between gap-1 sm:justify-start sm:gap-2 min-w-0 w-full sm:w-auto">
            <AvatarFrame
              src={visitor.avatarUrl}
              username={visitor.username}
              size="sm"
              frameId={visitorUser?.avatarFrameId}
              country={visitorUser?.country || undefined}
            />
            <span className="sm:hidden font-mono-tabular text-[10px] text-amber-200/55 shrink-0">
              #{seatIndex + 1}
            </span>
            <div className="hidden sm:block min-w-0">
              <div className="text-[11px] font-bold text-amber-100 truncate">
                {visitor.username}
              </div>
              <div className="text-[10px] text-amber-300/80">Joining...</div>
            </div>
          </div>

          <div className="sm:hidden min-w-0 w-full">
            <div className="text-[10px] font-bold text-amber-100 leading-tight truncate">
              {visitor.username}
            </div>
            <div className="text-[9px] text-amber-300/80 leading-tight">Joining...</div>
          </div>

          <span className="hidden sm:inline font-mono-tabular text-[10px] text-amber-200/50 shrink-0">
            #{seatIndex + 1}
          </span>
        </div>
      );
    }

    return (
      <div
        key={`seat_${seatIndex}`}
        className="flex items-center justify-between gap-1 sm:gap-2 rounded-lg sm:rounded-xl border border-amber-500/15 bg-[#150705]/70 px-1.5 py-1.5 sm:px-2.5 sm:py-2 opacity-65"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="h-6 w-6 sm:h-8 sm:w-8 shrink-0 rounded-full border border-dashed border-amber-500/30 bg-[#1D0A06] flex items-center justify-center font-mono-tabular text-[9px] sm:text-[10px] text-amber-200/55">
            {seatIndex + 1}
          </div>
          <span className="text-[10px] sm:text-[11px] font-medium text-amber-200/50 truncate">
            Open
          </span>
        </div>
        <span className="font-mono-tabular text-[9px] sm:text-[10px] text-amber-200/40 shrink-0">
          #{seatIndex + 1}
        </span>
      </div>
    );
  };

  const halfSeats = Math.ceil(board.maxSeats / 2);
  const leftSeatIndices = Array.from({ length: halfSeats }, (_, i) => i);
  const rightSeatIndices = Array.from(
    { length: Math.max(0, board.maxSeats - halfSeats) },
    (_, i) => halfSeats + i
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Top Navigation & Room Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (isSeated) {
              void engine.leaveMainSeat(board.id).catch(() => {});
            } else {
              void engine.leaveLobbyVisitor(board.id);
            }
            setScreen('lobby');
            setEnteredBoardId(null);
          }}
          className="flex items-center gap-2 rounded-lg border border-amber-400/35 bg-[#2A100B] px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-[#3B170F] cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Room Lobby
        </button>

        <div className="text-left sm:text-right">
          <div className="font-display text-base sm:text-lg font-bold text-amber-100">
            {board.tableLabel} · Play Dice
          </div>
          <div className="text-xs font-mono-tabular text-amber-200/70">
            Bet Range {board.tier.minTokens.toLocaleString()}–{board.tier.maxTokens.toLocaleString()} TKN · Winner Fee{' '}
            {(board.tier.feeRate * 100).toFixed(0)}% · Max {board.maxSeats} Players
          </div>
        </div>
      </div>

      {/* ARENA STAGE: Full-width 3D Ground on top + 2-column seats below on Mobile; 3-column Side-by-Side on Tablet/Desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-[148px_minmax(0,1fr)_148px] md:grid-cols-[176px_minmax(0,1fr)_176px] lg:grid-cols-[204px_minmax(0,1fr)_204px] xl:grid-cols-[232px_minmax(0,1fr)_232px] gap-2 sm:gap-2.5 md:gap-3 items-stretch">
        {/* LEFT FLANK */}
        <aside className="order-2 sm:order-none flex flex-col gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-amber-500/25 bg-[#230C08]/90 p-2 md:p-2.5 shadow-lg h-full min-w-0">
          <div className="flex-shrink-0 flex items-center justify-between gap-1 px-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-200/75">
            <span>{halfSeats === 1 ? 'Seat 1' : `L 1–${halfSeats}`}</span>
            <span className="font-mono-tabular text-amber-300">
              {board.occupiedCount}/{board.maxSeats}
            </span>
          </div>
          <div className="grid auto-rows-fr gap-1.5 flex-1">
            {leftSeatIndices.map((idx) => renderSeatSlot(idx))}
          </div>
        </aside>

        {/* CENTER: MATCH HUD + 3D THROWING GROUND + ACTION CONTROLS + BETTING DASHBOARD BAR BELOW GROUND */}
        <section className="order-1 col-span-2 sm:order-none sm:col-span-1 rounded-xl sm:rounded-2xl border-2 border-amber-500/35 bg-gradient-to-b from-[#3A170E] to-[#260E09] p-2 sm:p-3 md:p-3.5 shadow-xl flex flex-col justify-between gap-2 sm:gap-3 min-w-0">
          {/* Compact Match HUD */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-amber-500/25 bg-[#1B0906]/90 px-2 py-1.5 sm:px-3.5 sm:py-2.5">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {currentTurnSeat ? (
                (() => {
                  const turnUser =
                    currentTurnSeat.userId === activeUser.id
                      ? activeUser
                      : engine.userLookup(currentTurnSeat.userId);
                  return (
                    <AvatarFrame
                      src={currentTurnSeat.avatarUrl}
                      username={currentTurnSeat.username}
                      size="sm"
                      highlighted
                      countdownProgress={turnCountdownProgress}
                      frameId={turnUser?.avatarFrameId}
                      country={turnUser?.country || undefined}
                    />
                  );
                })()
              ) : (
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-amber-400/50 bg-[#4A1C11] text-amber-300 shrink-0">
                  <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs font-bold text-amber-100 truncate">
                  {currentTurnSeat
                    ? currentTurnSeat.username
                    : board.phase === GamePhase.LOBBY_COUNTDOWN
                    ? `Start in ${formatMmSs(board.lobbySecondsRemaining)}`
                    : `Match #${board.matchCounter}`}
                </div>
                <div className="text-[9.5px] sm:text-[11px] font-mono-tabular text-amber-300/80 truncate">
                  Min: {minBetDisplay.toLocaleString()} TKN
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-mono-tabular text-xs sm:text-base md:text-lg font-extrabold text-amber-300">
              <DiceTokenIcon size="md" className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>{activePot.toLocaleString()} TKN</span>
            </div>
          </div>

          {/* 3D WebGL Throwing Ground */}
          <Daduketa3DArena
            tierId={board.tier.id}
            pendingRoll={board.pendingRollReveal}
            lastRoll={board.lastRoll}
            watchOnly={isOtherPlayerActiveTurn}
            canAim={
              isPreMatch ||
              isUserOwnRollTurn ||
              (board.phase === GamePhase.SIDE_BET_WINDOW && currentTurnSeat?.userId === activeUser.id)
            }
            autoAimView={isUserOwnRollTurn}
            currentTurnPlayer={
              currentTurnSeat
                ? (() => {
                    const turnUser =
                      currentTurnSeat.userId === activeUser.id
                        ? activeUser
                        : engine.userLookup(currentTurnSeat.userId);
                    return {
                      username: currentTurnSeat.username,
                      avatarUrl: currentTurnSeat.avatarUrl,
                      frameId: turnUser?.avatarFrameId,
                      country: turnUser?.country || undefined,
                      countdownProgress: turnCountdownProgress,
                    };
                  })()
                : isSeated
                ? {
                    username: activeUser.username,
                    avatarUrl: activeUser.avatarUrl,
                    frameId: activeUser.avatarFrameId,
                    country: activeUser.country || undefined,
                  }
                : null
            }
          />

          {/* Primary Roll Action Strip (Strictly Watch-Only During Other Players' Turns) */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {isPreMatch && (
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                {board.activeSideBetRound && !board.activeSideBetRound.isClosed && (
                  <span className="text-[11px] sm:text-xs font-semibold text-amber-200/90 text-center">
                    1st Roll Side-Bets Open · Roller:{' '}
                    <strong className="text-amber-100">{board.activeSideBetRound.rollerUsername}</strong>
                  </span>
                )}
                {isSeated && board.phase === GamePhase.LOBBY_COUNTDOWN && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleQuickStartMatch()}
                    className="inline-flex items-center gap-1.5 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-3.5 py-2 text-[11px] sm:text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer shadow-md whitespace-nowrap"
                  >
                    <Swords className="h-3.5 w-3.5 shrink-0" />
                    {board.occupiedCount >= 2 ? 'Start Match Now' : 'Quick Match Now'}
                  </button>
                )}
              </div>
            )}

            {(board.phase === GamePhase.IN_PROGRESS_ROLL ||
              board.phase === GamePhase.TIE_BREAKER ||
              board.phase === GamePhase.SIDE_BET_WINDOW) && (
              <>
                {board.pendingRollReveal ? (
                  <span className="text-[11px] sm:text-xs font-semibold text-amber-300 text-center">
                    {board.pendingRollReveal.isAutoRoll
                      ? `${board.pendingRollReveal.rollerUsername} timed out — auto-throwing...`
                      : `${board.pendingRollReveal.rollerUsername} throwing...`}
                  </span>
                ) : board.phase === GamePhase.SIDE_BET_WINDOW ? (
                  <span
                    className={`text-[11px] sm:text-xs font-semibold text-center transition-colors ${
                      isCountdownUrgent
                        ? 'text-rose-300 animate-pulse'
                        : isCountdownWarning
                        ? 'text-amber-300'
                        : 'text-amber-200/90'
                    }`}
                  >
                    {board.rollHistory.length === 0 ? 'First Roll ' : ''}Side-Bet Window (
                    {formatMmSs(board.activeSideBetRound?.secondsRemaining ?? DiceBoard.SIDE_BET_WINDOW_SECONDS)}) · Roller:{' '}
                    <strong className="text-amber-100">{currentTurnSeat?.username}</strong>
                    {isCountdownUrgent ? ' · Hurry!' : ''}
                  </span>
                ) : isUserOwnRollTurn ? (
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleRollDice()}
                      className="w-full sm:w-auto rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 sm:px-8 py-2.5 sm:py-3 text-xs sm:text-sm font-extrabold tracking-wide text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer whitespace-nowrap shadow-lg"
                    >
                      TOSS &amp; THROW DICE
                    </button>
                    <span
                      className={`rounded-lg border px-2.5 py-1 font-mono-tabular text-[11px] sm:text-xs font-bold whitespace-nowrap ${
                        isCountdownUrgent
                          ? 'border-rose-400/70 bg-rose-950/80 text-rose-200 animate-pulse'
                          : isCountdownWarning
                          ? 'border-amber-400/70 bg-amber-950/80 text-amber-200'
                          : 'border-amber-500/35 bg-[#1B0906] text-amber-200/90'
                      }`}
                    >
                      Auto-throw {formatMmSs(board.turnRollSecondsRemaining)}
                      {isCountdownUrgent ? ' · Hurry!' : ''}
                    </span>
                  </div>
                ) : (
                  <span
                    className={`text-[11px] sm:text-xs font-semibold text-center transition-colors ${
                      isCountdownUrgent
                        ? 'text-rose-300 animate-pulse'
                        : isCountdownWarning
                        ? 'text-amber-300'
                        : 'text-amber-200/85'
                    }`}
                  >
                    Waiting for <strong className="text-amber-100">{currentTurnSeat?.username}</strong> to roll · Auto-throw in{' '}
                    <span className="font-mono-tabular font-bold">
                      {formatMmSs(board.turnRollSecondsRemaining)}
                    </span>
                  </span>
                )}
              </>
            )}

            {board.phase === GamePhase.SETTLED && (
              <div className="w-full space-y-2.5">
                {settledWinnerMatch && (
                  <div className="relative overflow-hidden rounded-xl border-2 border-emerald-400/80 bg-gradient-to-r from-emerald-950/90 via-[#123828] to-amber-950/80 px-3.5 py-3 shadow-[0_0_28px_rgba(16,185,129,0.35)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/70 bg-amber-400/20 text-amber-300 animate-bounce shadow-md">
                          <Trophy className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-emerald-200">
                            <Sparkles className="h-4 w-4 text-amber-300 animate-pulse shrink-0" />
                            <span className="truncate">
                              YOU WON MATCH #{settledWinnerMatch.matchNumber}!
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-emerald-200/80">
                            <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span>
                              Tokens added to wallet · Balance:{' '}
                              <strong className="font-mono-tabular text-amber-200">
                                {activeUser.wallet.availableBalance.toLocaleString()} TKN
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-3 py-1.5 font-mono-tabular text-sm sm:text-base font-black text-emerald-300 shadow-inner">
                        <DiceTokenIcon size="sm" className="animate-pulse" />
                        <span>+{animatedWinTokens.toLocaleString()} TKN</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-400">
                    <Trophy className="h-4 w-4 shrink-0" />
                    Match #{board.matchCounter} Complete
                    {board.matchHistory[0] ? ` · Winner: ${board.matchHistory[0].winnerUsername}` : ''}
                  </span>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => {
                    const tierIdx = TokenEconomy.TIERS.findIndex((t) => t.id === board.tier.id);
                    setPreJoinBetInput(String(currentSeat?.initialBet ?? board.tier.minTokens));
                    setPreJoinTier({
                      tierId: board.tier.id,
                      idx: tierIdx >= 0 ? tierIdx : focusedCardIdx,
                      isNextRound: true,
                      fromBoardId: board.id,
                    });
                  }}
                  className="flex items-center gap-1.5 rounded-lg border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-[11px] sm:text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Play Next Round
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => {
                    if (actionBusy) return;
                    setActionBusy(true);
                    void (async () => {
                      try {
                        await engine.leaveMainSeat(board.id);
                        let updatedBoard: DiceBoard | null = null;
                        try {
                          updatedBoard = engine.getBoard(board.id);
                        } catch {
                          updatedBoard = null;
                        }
                        if (!updatedBoard || updatedBoard.occupiedCount === 0) {
                          setRoomNotice('No players in room · Room closed.');
                        }
                        setEnteredBoardId(null);
                        setIsBetPopupOpen(false);
                        setScreen('lobby');
                      } catch (err) {
                        onError(err instanceof Error ? err.message : 'Unable to exit room.');
                      } finally {
                        setActionBusy(false);
                      }
                    })();
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-400/45 bg-rose-500/15 px-4 py-2 text-[11px] sm:text-xs font-bold text-rose-200 hover:bg-rose-500/25 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Exit Room
                </button>
                </div>
              </div>
            )}
          </div>

          {/* BETTING DASHBOARD COUNTDOWN & OPEN BUTTON BAR BELOW THE 3D GROUND */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg sm:rounded-xl border border-amber-400/40 bg-[#250D08] px-2 py-2 sm:px-3.5">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 text-[10px] sm:text-xs">
              <Layers
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
                  isCountdownUrgent ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <span
                className={`font-mono-tabular font-semibold truncate ${
                  isCountdownUrgent
                    ? 'text-rose-300 animate-pulse'
                    : isCountdownWarning
                    ? 'text-amber-300'
                    : 'text-amber-100'
                }`}
              >
                {dashboardCountdownText}
              </span>
            </div>

            <button
              type="button"
              onClick={openBetDashboard}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg border-b-2 px-3 sm:px-3.5 py-1.5 text-[10px] sm:text-xs font-extrabold cursor-pointer shadow-sm whitespace-nowrap ${
                board.phase === GamePhase.SIDE_BET_WINDOW
                  ? 'border-emerald-800 bg-gradient-to-b from-emerald-300 to-emerald-500 text-slate-950 hover:from-emerald-200 hover:to-emerald-400'
                  : 'border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 text-[#2A0E07] hover:from-amber-200 hover:to-amber-400'
              }`}
            >
              <DiceTokenIcon size="xs" tone="dark" />
              <span>
                {board.phase === GamePhase.SIDE_BET_WINDOW
                  ? 'Side-Bet Open · Betting Dashboard'
                  : 'Betting Dashboard'}
              </span>
            </button>
          </div>
        </section>

        {/* RIGHT FLANK */}
        <aside className="order-3 sm:order-none flex flex-col gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-amber-500/25 bg-[#230C08]/90 p-2 md:p-2.5 shadow-lg h-full min-w-0">
          <div className="flex-shrink-0 flex items-center justify-between gap-1 px-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-200/75">
            <span>
              {board.maxSeats === 2
                ? 'Seat 2'
                : `R ${halfSeats + 1}–${board.maxSeats}`}
            </span>
            <span className="font-mono-tabular text-amber-300">{board.sideBettors.length} Watch</span>
          </div>
          <div className="grid auto-rows-fr gap-1.5 flex-1">
            {rightSeatIndices.map((idx) => renderSeatSlot(idx))}
          </div>
        </aside>
      </div>

      {/* FLOATING POPUP ABOVE THE GAME GROUND: BETTING DASHBOARD (Responsive Mobile / Tablet / Desktop, ZERO backdrop-blur) */}
      {isBetPopupOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Betting Dashboard"
          onClick={() => setIsBetPopupOpen(false)}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/75 p-2.5 sm:p-5 pt-8 sm:pt-5 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88dvh] flex flex-col rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-[#34140D] to-[#1A0805] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden"
          >
            {/* Popup Sticky Header */}
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-[#280E08] px-3.5 sm:px-5 py-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <DiceTokenIcon size="sm" />
                <span className="font-display text-sm sm:text-base font-bold text-amber-100">
                  Betting Dashboard
                </span>
                <span className="font-mono-tabular text-[11px] sm:text-xs font-semibold text-amber-300">
                  {isSeated
                    ? `Seat Bet: ${currentSeat?.initialBet.toLocaleString()} TKN`
                    : `Range: ${board.tier.minTokens.toLocaleString()}–${board.tier.maxTokens.toLocaleString()} TKN`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsBetPopupOpen(false)}
                aria-label="Close Betting Dashboard"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/35 bg-[#190805] text-amber-200 hover:bg-[#441A10] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Popup Scrollable Body */}
            <div className="overflow-y-auto px-3 sm:px-5 py-3.5 sm:py-4 space-y-4">
              {/* Main Table Seat Stake Controls */}
              {isPreMatch && (
                <div className="rounded-xl border border-amber-500/25 bg-[#180805] p-3 sm:p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-amber-100">
                      Main Room Bet ({board.tier.minTokens.toLocaleString()}–{board.tier.maxTokens.toLocaleString()} TKN)
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {quickStakes.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setBetInput(String(amt))}
                          className={`rounded-md border px-2 sm:px-2.5 py-1 font-mono-tabular text-[11px] sm:text-xs font-semibold cursor-pointer ${
                            Number(betInput) === amt
                              ? 'border-amber-300 bg-amber-400/25 text-amber-200'
                              : 'border-amber-500/30 bg-[#250E09] text-amber-200/80 hover:text-amber-100'
                          }`}
                        >
                          {amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-xl border border-amber-400/40 bg-[#230C08] px-3 py-2">
                        <input
                          type="number"
                          min={board.tier.minTokens}
                          max={board.tier.maxTokens}
                          step={1}
                          value={betInput}
                          onChange={(e) => setBetInput(e.target.value)}
                          aria-label="Bet Amount Tokens"
                          className="w-24 sm:w-28 bg-transparent font-mono-tabular text-sm font-bold text-amber-100 focus:outline-none"
                        />
                        <span className="text-xs font-bold text-amber-300/80">TKN</span>
                      </div>

                      {!isSeated ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleJoinMainSeat()}
                          className="flex-1 sm:flex-none rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 sm:px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                        >
                          PLACE BET &amp; JOIN
                        </button>
                      ) : (
                        <>
                          {currentSeat && Number(betInput) !== currentSeat.initialBet && (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleUpdateSeatBet()}
                              className="rounded-xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-xs font-extrabold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                            >
                              Update Bet
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleLeaveMainSeat()}
                            className="rounded-xl border border-rose-500/45 bg-rose-500/15 px-3.5 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                          >
                            Leave &amp; Refund
                          </button>
                        </>
                      )}
                    </div>

                    <div className="text-xs font-mono-tabular text-amber-200/80">
                      {board.phase === GamePhase.LOBBY_COUNTDOWN
                        ? `Match starts automatically in ${board.lobbySecondsRemaining}s`
                        : 'Waiting for minimum 2 seated players'}
                    </div>
                  </div>
                </div>
              )}

              {/* Latest Settled Side-Bet Winners inside Betting Dashboard */}
              {board.pastSideBetReports.length > 0 && (
                <div className="rounded-xl border border-emerald-400/35 bg-[#180805] p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-amber-100">
                      Last Side-Bet Settlement · Round #{board.pastSideBetReports[0].roundNumber} (Face{' '}
                      <span className="font-mono-tabular text-amber-300">
                        {board.pastSideBetReports[0].rolledFace}
                      </span>
                      )
                    </span>
                    <span className="font-mono-tabular text-[11px] text-amber-200/70">
                      Matched {board.pastSideBetReports[0].totalMatched.toLocaleString()} TKN
                    </span>
                  </div>
                  {board.pastSideBetReports[0].winners.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {board.pastSideBetReports[0].winners.map((w, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1 font-mono-tabular text-[11px] ${
                            w.userId === activeUser.id
                              ? 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-300 font-bold'
                              : 'bg-[#120604] text-emerald-400'
                          }`}
                        >
                          <span className="font-sans truncate">
                            {w.username} ({w.option})
                          </span>
                          <span>+{w.netPayout.toLocaleString()} TKN</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-200/70">
                      {board.pastSideBetReports[0].notes[0] ??
                        `Returned ${board.pastSideBetReports[0].totalRefunded.toLocaleString()} TKN to bettors.`}
                    </div>
                  )}
                </div>
              )}

              {/* Full-Width 3-Section Side-Betting Options Grid (Zero Empty Gaps) */}
              <SideBettingPanel
                board={board}
                engine={engine}
                canPlaceSideBets={isSeated || board.isUserSideBettor(activeUser.id)}
                onError={onError}
                onInsufficientBalance={(prompt) => {
                  setIsBetPopupOpen(false);
                  onInsufficientBalance(prompt);
                }}
                onConfirmed={() => setIsBetPopupOpen(false)}
                onPayEntryFee={
                  !isSeated && !board.isUserSideBettor(activeUser.id)
                    ? () => {
                        if (actionBusy) return;
                        setActionBusy(true);
                        void engine
                          .enterBoardAsSideBettor(board.id)
                          .catch((err) => {
                            if (err instanceof InsufficientTokensError) {
                              setIsBetPopupOpen(false);
                              onInsufficientBalance({
                                title: 'Top Up Required to Side Bet',
                                message: err.message,
                                requiredTokens: err.requiredTokens,
                                availableTokens: err.availableTokens,
                              });
                            } else {
                              onError(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to pay entry fee to side bet.'
                              );
                            }
                          })
                          .finally(() => setActionBusy(false));
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Transparency Panel */}
      <ArenaRoomLedger
        board={board}
        activeUserId={activeUser.id}
        ledgerTab={ledgerTab}
        onChangeTab={setLedgerTab}
      />
      {renderPreJoinModal()}
    </div>
  );
};
