import React, { useState } from 'react';
import {
  ArrowLeft,
  Crown,
  Eye,
  ShieldCheck,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { DiceBoard } from '../domain/DiceBoard';
import { GamePhase } from '../domain/types';
import { BetSpotEngine, InsufficientTokensError } from '../services/BetSpotEngine';
import { useDiceCountdownAudio } from '../hooks/useDiceCountdownAudio';
import { AvatarFrame } from './AvatarFrame';
import { Daduketa3DArena } from './Daduketa3DArena';
import { DiceTokenIcon } from './DiceTokenIcon';
import { SideBettingPanel } from './SideBettingPanel';
import { TopUpPromptData } from './TopUpRequiredModal';

interface SideBetArenaViewProps {
  board: DiceBoard;
  engine: BetSpotEngine;
  onBackToActiveBoards: () => void;
  onError: (msg: string) => void;
  onInsufficientBalance: (prompt: TopUpPromptData) => void;
}

export const SideBetArenaView: React.FC<SideBetArenaViewProps> = ({
  board,
  engine,
  onBackToActiveBoards,
  onError,
  onInsufficientBalance,
}) => {
  const [ledgerTab, setLedgerTab] = useState<'rolls' | 'sidebets' | 'spectators' | 'winners'>('sidebets');
  const [joiningSideBet, setJoiningSideBet] = useState<boolean>(false);

  useDiceCountdownAudio(board, true);

  const activeUser = engine.activeUser;
  const isSideBettor = board.isUserSideBettor(activeUser.id);
  const isSeated = board.isUserSeated(activeUser.id);

  const round = board.activeSideBetRound;
  const isPreMatch =
    board.phase === GamePhase.WAITING_FOR_PLAYERS || board.phase === GamePhase.LOBBY_COUNTDOWN;

  const currentTurnSeat =
    board.currentTurnSeatIndex !== null ? board.seats[board.currentTurnSeatIndex] : null;
  const currentTurnUser = currentTurnSeat
    ? currentTurnSeat.userId === activeUser.id
      ? activeUser
      : engine.userLookup(currentTurnSeat.userId)
    : undefined;

  const minBetDisplay = board.currentMinBet ?? board.tier.minTokens;
  const activePot =
    board.phase === GamePhase.IN_PROGRESS_ROLL ||
    board.phase === GamePhase.SIDE_BET_WINDOW ||
    board.phase === GamePhase.TIE_BREAKER
      ? board.lockedPot
      : board.projectedPot;

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

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeCountdownSeconds: number | null =
    board.phase === GamePhase.LOBBY_COUNTDOWN
      ? board.lobbySecondsRemaining
      : board.phase === GamePhase.SIDE_BET_WINDOW && round
      ? round.secondsRemaining
      : (board.phase === GamePhase.IN_PROGRESS_ROLL || board.phase === GamePhase.TIE_BREAKER) &&
        !board.pendingRollReveal
      ? board.turnRollSecondsRemaining
      : null;
  const isCountdownUrgent =
    activeCountdownSeconds !== null && activeCountdownSeconds > 0 && activeCountdownSeconds <= 5;
  const isCountdownWarning =
    activeCountdownSeconds !== null && activeCountdownSeconds > 5 && activeCountdownSeconds <= 10;

  const handleJoinAsSideBettor = async () => {
    if (joiningSideBet) return;
    setJoiningSideBet(true);
    try {
      await engine.enterBoardAsSideBettor(board.id);
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        onInsufficientBalance({
          title: 'Top Up Required to Side Bet',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to pay entry fee and join.');
      }
    } finally {
      setJoiningSideBet(false);
    }
  };

  // Map empty seats to any joining visitors
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
      const avatar = isSelf ? activeUser.avatarUrl : seat.avatarUrl ?? seatUser?.avatarUrl;
      const betVal = isPreMatch ? seat.initialBet : seat.lockedBet;

      return (
        <div
          key={`seat_${seatIndex}`}
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 rounded-lg sm:rounded-xl border px-1.5 py-1.5 sm:px-2.5 sm:py-2 transition-all ${
            isTurn
              ? 'border-amber-300 bg-gradient-to-b sm:bg-gradient-to-r from-[#5A2414] to-[#3B160D] shadow-[0_0_16px_rgba(245,158,11,0.25)]'
              : isSelf
              ? 'border-emerald-400/60 bg-[#2E160F]'
              : 'border-amber-500/25 bg-[#1B0906]'
          }`}
        >
          <div className="flex items-center justify-between gap-1 sm:justify-start sm:gap-2 min-w-0 w-full sm:w-auto">
            <AvatarFrame
              src={avatar}
              username={seat.username}
              size="sm"
              highlighted={isTurn}
              countdownProgress={isTurn ? turnCountdownProgress : undefined}
              frameId={seatUser?.avatarFrameId}
              country={seatUser?.country || undefined}
            />

            <div className="sm:hidden shrink-0">
              {seat.rollValue ? (
                <span className="rounded border border-amber-400/50 bg-[#140705] px-1.5 py-0.5 font-mono-tabular text-[10px] font-extrabold text-amber-300">
                  {seat.rollValue}
                </span>
              ) : isTurn ? (
                <span className="rounded bg-amber-400 px-1 py-0.5 text-[9px] font-extrabold text-[#2A0E07]">
                  TURN
                </span>
              ) : (
                <span className="font-mono-tabular text-[10px] text-amber-200/55">
                  #{seat.seatIndex + 1}
                </span>
              )}
            </div>

            <div className="hidden sm:block min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-50 truncate">
                <span className="truncate">{seat.username}</span>
                {isSelf && <span className="text-[9px] text-emerald-400 shrink-0">(You)</span>}
              </div>
              <div className="font-mono-tabular text-[11px] font-semibold text-amber-300 truncate">
                {betVal.toLocaleString()} TKN
              </div>
            </div>
          </div>

          <div className="sm:hidden min-w-0 w-full">
            <div className="flex items-center gap-0.5 text-[10px] font-bold text-amber-50 leading-tight truncate">
              <span className="truncate">{seat.username}</span>
              {isSelf && <span className="text-[8px] text-emerald-400 shrink-0">(You)</span>}
            </div>
            <div className="font-mono-tabular text-[9.5px] font-semibold text-amber-300 leading-tight truncate">
              {betVal.toLocaleString()} TKN
            </div>
          </div>

          <div className="hidden sm:block shrink-0 text-right">
            {seat.rollValue ? (
              <span className="rounded border border-amber-400/50 bg-[#140705] px-1.5 py-0.5 font-mono-tabular text-xs font-extrabold text-amber-300">
                {seat.rollValue}
              </span>
            ) : isTurn ? (
              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-[#2A0E07]">
                TURN
              </span>
            ) : (
              <span className="font-mono-tabular text-[10px] text-amber-200/50">
                #{seat.seatIndex + 1}
              </span>
            )}
          </div>
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
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToActiveBoards}
            className="flex items-center gap-2 rounded-lg border border-amber-400/35 bg-[#2A100B] px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-[#3B170F] cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Active Rooms
          </button>

          <div className="flex items-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
            <Eye className="h-3.5 w-3.5 text-sky-300 shrink-0" />
            <span>
              {isSeated
                ? 'Seated Main Player · Free Side-Betting Enabled'
                : 'Watch & Side-Bet Only · Main Seats Locked'}
            </span>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="font-display text-base sm:text-lg font-bold text-amber-100">
            {board.tableLabel} · {isSeated ? 'Live Side-Bet View' : 'Side-Bet Spectator Room'}
          </div>
          <div className="text-xs font-mono-tabular text-amber-200/70">
            Bet Range {board.tier.minTokens.toLocaleString()}–{board.tier.maxTokens.toLocaleString()} TKN · Entry Fee{' '}
            {isSeated ? 'FREE (Main Player)' : `${board.tier.spectatorEntryFee.toLocaleString()} TKN`} · Max {board.maxSeats} Players
          </div>
        </div>
      </div>

      {/* Entry Fee Gate if not yet paid (skipped for seated main players) */}
      {!isSideBettor && !isSeated && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-sky-400/45 bg-gradient-to-r from-[#17366E] to-[#230E0A] p-5 shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/40 bg-black/30 text-sky-300 shrink-0">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                System Entry Fee Required — {board.tableLabel}
              </h2>
              <p className="text-xs text-sky-100/80">
                Pay {board.tier.spectatorEntryFee.toLocaleString()} TKN to enter this live room as a Side-Bettor. Watch live rolls and place side bets below (main seats locked).
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={joiningSideBet}
            onClick={() => void handleJoinAsSideBettor()}
            className="rounded-xl border-b-4 border-sky-900 bg-gradient-to-b from-sky-300 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white hover:from-sky-200 hover:to-blue-500 disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            {joiningSideBet
              ? 'Entering Room...'
              : `PAY ${board.tier.spectatorEntryFee.toLocaleString()} TKN & ENTER`}
          </button>
        </div>
      )}

      {/* ARENA STAGE: Left Flank | 3D Ground Center | Right Flank (Identical to Play Dice Arena) */}
      <div className="grid grid-cols-[84px_minmax(0,1fr)_84px] sm:grid-cols-[148px_minmax(0,1fr)_148px] md:grid-cols-[176px_minmax(0,1fr)_176px] lg:grid-cols-[204px_minmax(0,1fr)_204px] xl:grid-cols-[232px_minmax(0,1fr)_232px] gap-1.5 sm:gap-2.5 md:gap-3 items-stretch">
        {/* LEFT FLANK SEATS */}
        <aside className="flex flex-col gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-amber-500/25 bg-[#230C08]/90 p-1 sm:p-2 md:p-2.5 shadow-lg h-full">
          <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 px-0.5 sm:px-1 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-200/75 text-center sm:text-left">
            <span>{halfSeats === 1 ? 'Seat 1' : `L 1–${halfSeats}`}</span>
            <span className="font-mono-tabular text-amber-300">
              {board.occupiedCount}/{board.maxSeats}
            </span>
          </div>
          <div className="grid auto-rows-fr gap-1 sm:gap-1.5 flex-1">
            {leftSeatIndices.map((idx) => renderSeatSlot(idx))}
          </div>
        </aside>

        {/* CENTER: MATCH HUD + 3D THROWING GROUND + READ-ONLY STATUS STRIP */}
        <section className="rounded-xl sm:rounded-2xl border-2 border-amber-500/35 bg-gradient-to-b from-[#3A170E] to-[#260E09] p-1.5 sm:p-3 md:p-3.5 shadow-xl flex flex-col justify-between gap-1.5 sm:gap-3 min-w-0">
          {/* Compact Match HUD */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-amber-500/25 bg-[#1B0906]/90 px-2 py-1.5 sm:px-3.5 sm:py-2.5">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {currentTurnSeat ? (
                <AvatarFrame
                  src={currentTurnSeat.avatarUrl}
                  username={currentTurnSeat.username}
                  size="sm"
                  highlighted
                  countdownProgress={turnCountdownProgress}
                  frameId={currentTurnUser?.avatarFrameId}
                  country={currentTurnUser?.country || undefined}
                />
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
                    ? `Start in ${board.lobbySecondsRemaining}s`
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

          {/* 3D WebGL Throwing Ground (Watch-Only for Side-Bettors) */}
          <Daduketa3DArena
            tierId={board.tier.id}
            pendingRoll={board.pendingRollReveal}
            lastRoll={board.lastRoll}
            watchOnly
            currentTurnPlayer={
              currentTurnSeat
                ? {
                    username: currentTurnSeat.username,
                    avatarUrl: currentTurnSeat.avatarUrl,
                    frameId: currentTurnUser?.avatarFrameId,
                    country: currentTurnUser?.country || undefined,
                    countdownProgress: turnCountdownProgress,
                  }
                : null
            }
          />

          {/* Live Match Watch Status Strip */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-[#1B0906] px-3 py-2 text-[11px] sm:text-xs text-amber-200/85">
            {board.phase === GamePhase.LOBBY_COUNTDOWN ? (
              <span
                className={
                  isCountdownUrgent
                    ? 'font-semibold text-rose-300 animate-pulse'
                    : isCountdownWarning
                    ? 'font-semibold text-amber-300'
                    : undefined
                }
              >
                {round && !round.isClosed
                  ? `1st Roll Side-Bets Open (1st Roller: ${round.rollerUsername}) · Starts in ${board.lobbySecondsRemaining}s`
                  : `Lobby countdown: ${board.lobbySecondsRemaining}s remaining · Waiting for match start`}
                {isCountdownUrgent ? ' · Hurry!' : ''}
              </span>
            ) : board.pendingRollReveal ? (
              <span className="font-semibold text-amber-300">
                {board.pendingRollReveal.isAutoRoll
                  ? `${board.pendingRollReveal.rollerUsername} timed out — auto-throwing...`
                  : `${board.pendingRollReveal.rollerUsername} throwing... (Watch Only)`}
              </span>
            ) : board.phase === GamePhase.SIDE_BET_WINDOW ? (
              <span
                className={
                  isCountdownUrgent
                    ? 'font-semibold text-rose-300 animate-pulse'
                    : isCountdownWarning
                    ? 'font-semibold text-amber-300'
                    : undefined
                }
              >
                {board.rollHistory.length === 0 ? 'First Roll ' : ''}Side-Bet Window (
                {formatCountdown(round?.secondsRemaining ?? DiceBoard.SIDE_BET_WINDOW_SECONDS)}) · Roller:{' '}
                <strong className="text-amber-100">{currentTurnSeat?.username}</strong>
                {isCountdownUrgent ? ' · Hurry!' : ''}
              </span>
            ) : (board.phase === GamePhase.IN_PROGRESS_ROLL ||
                board.phase === GamePhase.TIE_BREAKER) &&
              currentTurnSeat ? (
              <span
                className={
                  isCountdownUrgent
                    ? 'font-semibold text-rose-300 animate-pulse'
                    : isCountdownWarning
                    ? 'font-semibold text-amber-300'
                    : undefined
                }
              >
                Waiting for <strong className="text-amber-100">{currentTurnSeat.username}</strong> to roll · Auto-throw in{' '}
                <span className="font-mono-tabular font-bold">
                  {formatCountdown(board.turnRollSecondsRemaining)}
                </span>{' '}
                · Watch Only
              </span>
            ) : board.phase === GamePhase.SETTLED ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <Trophy className="h-3.5 w-3.5 shrink-0" />
                Match #{board.matchCounter} Complete · Preparing Next Round...
              </span>
            ) : (
              <span>Match #{board.matchCounter} · Watch &amp; Side-Bet Mode</span>
            )}
          </div>
        </section>

        {/* RIGHT FLANK SEATS */}
        <aside className="flex flex-col gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-amber-500/25 bg-[#230C08]/90 p-1 sm:p-2 md:p-2.5 shadow-lg h-full">
          <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 px-0.5 sm:px-1 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-200/75 text-center sm:text-left">
            <span>{board.maxSeats === 2 ? 'Seat 2' : `R ${halfSeats + 1}–${board.maxSeats}`}</span>
            <span className="font-mono-tabular text-amber-300">{board.sideBettors.length} Watch</span>
          </div>
          <div className="grid auto-rows-fr gap-1 sm:gap-1.5 flex-1">
            {rightSeatIndices.map((idx) => renderSeatSlot(idx))}
          </div>
        </aside>
      </div>

      {/* BETTING DASHBOARD DIRECTLY BENEATH THE GROUND */}
      <section className="rounded-2xl border-2 border-amber-400/45 bg-gradient-to-b from-[#32130C] to-[#1D0906] p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/25 pb-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
              Betting Dashboard · Side-Bet Pool (3 Sections · 11 Options)
            </h2>
            <p className="text-xs text-amber-200/70">
              {isSeated
                ? 'Place side bets on your active room for free before each roll (including Turn #1).'
                : 'Place side bets directly beneath the live arena before each roll (including Turn #1). Main seats are watch-only.'}
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono-tabular text-xs font-bold text-amber-300">
            <DiceTokenIcon size="sm" />
            <span>
              {round ? `Round #${round.roundNumber}` : 'Waiting for Next Window'}
            </span>
          </div>
        </div>

        <SideBettingPanel
          board={board}
          engine={engine}
          canPlaceSideBets={isSeated || isSideBettor}
          onError={onError}
          onInsufficientBalance={onInsufficientBalance}
          onPayEntryFee={
            !isSeated && !isSideBettor
              ? () => {
                  void handleJoinAsSideBettor();
                }
              : undefined
          }
        />
      </section>

      {/* BOTTOM ROOM TRANSPARENCY & MATCH HISTORY DASHBOARD */}
      <section className="rounded-xl border border-amber-500/20 bg-[#260E09] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-sm font-bold text-amber-100">
              Room Transparency &amp; Match History
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-amber-500/20 bg-[#190907] p-1">
            {[
              { id: 'rolls', label: `Roll Log (${board.rollHistory.length})` },
              { id: 'sidebets', label: `Side-Bet Winners (${board.pastSideBetReports.length})` },
              { id: 'spectators', label: `Side-Bettors (${board.sideBettors.length})` },
              { id: 'winners', label: `Match Winners (${board.matchHistory.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setLedgerTab(tab.id as 'rolls' | 'sidebets' | 'spectators' | 'winners')
                }
                className={`rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  ledgerTab === tab.id
                    ? 'bg-[#461B12] text-amber-300'
                    : 'text-amber-100/60 hover:text-amber-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {ledgerTab === 'sidebets' && (
          <div className="space-y-2.5 text-xs">
            {board.pastSideBetReports.length === 0 ? (
              <p className="text-amber-200/50 py-2">
                Side-bet winners and credited tokens appear here immediately after each roll lands.
              </p>
            ) : (
              board.pastSideBetReports.map((rep) => (
                <div
                  key={rep.roundId}
                  className="rounded-lg border border-amber-500/20 bg-[#190907] p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-amber-100">
                      Round #{rep.roundNumber} · {rep.rollerUsername} rolled Face{' '}
                      <span className="font-mono-tabular text-amber-300">{rep.rolledFace}</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] text-amber-200/70">
                      Pool {rep.totalPoolPlaced.toLocaleString()} · Matched{' '}
                      {rep.totalMatched.toLocaleString()} · Refunded{' '}
                      {rep.totalRefunded.toLocaleString()} TKN
                    </span>
                  </div>
                  {rep.winners.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {rep.winners.map((w, idx) => (
                        <span
                          key={idx}
                          className={`rounded-md px-2 py-0.5 font-mono-tabular text-[11px] ${
                            w.userId === activeUser.id
                              ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200 font-bold'
                              : 'bg-[#120604] text-emerald-400'
                          }`}
                        >
                          {w.username} ({w.option}) +{w.netPayout.toLocaleString()} TKN
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-200/65">
                      {rep.notes[0] ?? 'No matched winning bets; stakes auto-returned.'}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {ledgerTab === 'rolls' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {board.rollHistory.length === 0 ? (
              <p className="text-amber-200/50 col-span-full py-2">
                No dice rolled yet in this room. Place your Turn #1 side bets in the Betting Dashboard above.
              </p>
            ) : (
              board.rollHistory.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-[#190907] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-100 truncate">{r.rollerUsername}</div>
                    <div className="text-[11px] text-amber-200/55">
                      {r.isTieBreaker ? 'Tie-Breaker Roll' : 'Main Roll'}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular shrink-0">
                    <div className="text-sm font-bold text-amber-300">{r.face}</div>
                    <div className="text-[10px] text-amber-200/50">Opp {r.oppositeFace}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {ledgerTab === 'spectators' && (
          <div className="text-xs">
            {board.sideBettors.length === 0 ? (
              <p className="text-amber-200/50 py-2">
                No side-bettors watching this room yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {board.sideBettors.map((sb) => (
                  <div
                    key={sb.userId}
                    className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-[#190907] px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-amber-100">
                      <Users className="h-3.5 w-3.5 text-amber-400" />
                      {sb.username}
                    </span>
                    <span className="font-mono-tabular text-amber-200/70">
                      Fee {sb.entryFeePaid} TKN
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {ledgerTab === 'winners' && (
          <div className="text-xs">
            {board.matchHistory.length === 0 ? (
              <p className="text-amber-200/50 py-2">Completed match payouts appear here.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {board.matchHistory.map((m) => (
                  <div
                    key={m.matchNumber}
                    className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-[#190907] px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-amber-100">
                        Match #{m.matchNumber} · {m.winnerUsername}
                      </div>
                      <div className="text-[11px] text-amber-200/60">
                        Winning Roll {m.winningFace} · Fee {(m.feeRate * 100).toFixed(0)}%
                      </div>
                    </div>
                    <span className="font-mono-tabular font-bold text-emerald-400">
                      +{m.netPayout.toLocaleString()} TKN
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
