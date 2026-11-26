import React, { useEffect, useState } from 'react';
import { Bell, Clock, Dices, Swords, Users, X } from 'lucide-react';
import { RoomInvite } from '../domain/RoomInviteTypes';
import { BetSpotEngine, InsufficientTokensError } from '../services/BetSpotEngine';
import { AvatarFrame } from './AvatarFrame';
import { DiceTokenIcon } from './DiceTokenIcon';
import { TopUpPromptData } from './TopUpRequiredModal';

interface LiveRoomInviteOverlayProps {
  engine: BetSpotEngine;
  selectedInvite: RoomInvite | null;
  onSelectInvite: (invite: RoomInvite | null) => void;
  onEnterRoom: (boardId: string) => void;
  onError: (msg: string) => void;
  onInsufficientBalance: (prompt: TopUpPromptData) => void;
}

function formatSec(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export const LiveRoomInviteOverlay: React.FC<LiveRoomInviteOverlayProps> = ({
  engine,
  selectedInvite,
  onSelectInvite,
  onEnterRoom,
  onError,
  onInsufficientBalance,
}) => {
  const alerts = engine.liveInviteAlerts.slice(0, 2);
  const [stakeInput, setStakeInput] = useState<string>('30');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [joining, setJoining] = useState<boolean>(false);

  // Sync fresh invite state if an update arrives while the confirmation modal is open
  const liveSelectedInvite = selectedInvite
    ? engine.activeRoomInvites.find((inv) => inv.boardId === selectedInvite.boardId) ?? selectedInvite
    : null;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedInvite) return;
    const minNeeded = Math.max(selectedInvite.minBetTokens, selectedInvite.currentMinBet);
    setStakeInput(String(minNeeded));
  }, [selectedInvite?.id, selectedInvite?.boardId]);

  useEffect(() => {
    if (!selectedInvite) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectInvite(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedInvite, onSelectInvite]);

  const handleConfirmJoin = async () => {
    if (!liveSelectedInvite || joining) return;
    const parsed = Number(stakeInput);
    const amount = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    setJoining(true);
    try {
      const board = await engine.acceptRoomInviteAndJoin(liveSelectedInvite, amount);
      onSelectInvite(null);
      onEnterRoom(board.id);
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        onSelectInvite(null);
        onInsufficientBalance({
          title: 'Insufficient Tokens to Join Room',
          message: err.message,
          requiredTokens: err.requiredTokens,
          availableTokens: err.availableTokens,
        });
      } else {
        onError(err instanceof Error ? err.message : 'Unable to join room.');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      {/* Live Waiting-Room Alert Cards (Bottom-Left, non-blocking & auto-dismissing when match starts) */}
      {alerts.length > 0 && !liveSelectedInvite && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-3 sm:left-5 z-40 flex flex-col gap-2.5 max-w-sm w-[calc(100%-1.5rem)]"
        >
          {alerts.map((inv) => {
            const tierShort = inv.tierLabel.split('·')[1]?.trim() ?? inv.tierLabel;
            const secsLeft = Math.max(0, Math.ceil((inv.lobbyEndsAt - nowMs) / 1000));
            return (
              <div
                key={inv.id}
                className="rounded-2xl border-2 border-amber-400/65 bg-gradient-to-br from-[#35140C] via-[#260E08] to-[#170705] p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.85)] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AvatarFrame
                      src={inv.hostAvatarUrl}
                      username={inv.hostUsername}
                      size="sm"
                      highlighted
                      frameId={inv.hostAvatarFrameId}
                      country={inv.hostCountry || undefined}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live Opponent Waiting</span>
                      </div>
                      <p className="text-xs font-bold text-amber-50 leading-snug">
                        <span className="text-amber-300">{inv.hostUsername}</span> joined{' '}
                        <span className="text-white">{tierShort}</span> (
                        {inv.betAmountTokens.toLocaleString()} TKN)
                      </p>
                      <p className="text-[11px] text-amber-200/75">
                        Waiting for players to roll dice · {inv.occupiedCount}/{inv.maxSeats} seats ·{' '}
                        <span className="font-mono-tabular text-amber-300">{formatSec(secsLeft)}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => engine.dismissInviteAlert(inv.id)}
                    className="rounded-lg p-1 text-amber-200/60 hover:bg-amber-500/15 hover:text-amber-100 cursor-pointer shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectInvite(inv)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-2 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer shadow-md"
                  >
                    <Swords className="h-3.5 w-3.5 shrink-0" />
                    Join &amp; Play
                  </button>
                  <button
                    type="button"
                    onClick={() => engine.dismissInviteAlert(inv.id)}
                    className="rounded-xl border border-amber-500/30 bg-[#1B0906] px-3 py-2 text-[11px] font-semibold text-amber-200/80 hover:text-amber-100 cursor-pointer"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* One-Click Seat & Bet Confirmation Modal */}
      {liveSelectedInvite && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Seat and Bet"
          onClick={() => onSelectInvite(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border-2 border-amber-400/65 bg-gradient-to-b from-[#34140D] to-[#1A0805] shadow-[0_24px_64px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-[#280E08] px-4 py-3.5">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-amber-100 truncate">
                    Join Room &amp; Confirm Bet
                  </h3>
                  <p className="text-[11px] text-amber-200/75 truncate">
                    {liveSelectedInvite.roomLabel}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close confirmation"
                onClick={() => onSelectInvite(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/35 bg-[#190805] text-amber-200 hover:bg-[#441A10] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Live Room Status Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-[#160705] px-3 py-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                  <Users className="h-3.5 w-3.5" />
                  {liveSelectedInvite.occupiedCount}/{liveSelectedInvite.maxSeats} Seated
                </span>
                <span className="inline-flex items-center gap-1 font-mono-tabular text-amber-300">
                  <Clock className="h-3.5 w-3.5" />
                  Starts in{' '}
                  {formatSec(Math.max(0, Math.ceil((liveSelectedInvite.lobbyEndsAt - nowMs) / 1000)))}
                </span>
              </div>

              {/* Currently Seated Opponents */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200/70">
                  Players Waiting in Room
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {liveSelectedInvite.seats.map((s) => (
                    <div
                      key={`${s.userId}_${s.seatIndex}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-[#220B07] px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarFrame
                          src={s.avatarUrl}
                          username={s.username}
                          size="sm"
                          frameId={s.avatarFrameId}
                          country={s.country || undefined}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-50 truncate">
                            {s.username}
                          </div>
                          <div className="text-[10px] text-amber-200/65">
                            Seat #{s.seatIndex + 1}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-bold text-amber-300 shrink-0">
                        <DiceTokenIcon size="xs" />
                        {s.betAmountTokens.toLocaleString()} TKN
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stake Selection */}
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-[#180805] p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-amber-100">Your Seat Stake (TKN)</span>
                  <span className="font-mono-tabular text-[11px] text-amber-200/75">
                    Min {Math.max(liveSelectedInvite.minBetTokens, liveSelectedInvite.currentMinBet).toLocaleString()} – Max {liveSelectedInvite.maxBetTokens.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center rounded-xl border border-amber-400/45 bg-[#230C08] px-3 py-2">
                  <DiceTokenIcon size="sm" className="mr-2 shrink-0" />
                  <input
                    type="number"
                    min={Math.max(liveSelectedInvite.minBetTokens, liveSelectedInvite.currentMinBet)}
                    max={liveSelectedInvite.maxBetTokens}
                    step={30}
                    value={stakeInput}
                    onChange={(e) => setStakeInput(e.target.value)}
                    aria-label="Seat Bet Stake Tokens"
                    className="w-full bg-transparent font-mono-tabular text-sm font-bold text-amber-100 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-amber-300/80">TKN</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-200/75">
                  <span>
                    Available:{' '}
                    <strong className="font-mono-tabular text-emerald-300">
                      {(engine.currentUser?.wallet.availableBalance ?? 0).toLocaleString()} TKN
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[
                      Math.max(liveSelectedInvite.minBetTokens, liveSelectedInvite.currentMinBet),
                      liveSelectedInvite.maxBetTokens,
                    ]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setStakeInput(String(preset))}
                          className={`rounded-md border px-2 py-0.5 font-mono-tabular font-semibold cursor-pointer ${
                            Number(stakeInput) === preset
                              ? 'border-amber-300 bg-amber-400/25 text-amber-200'
                              : 'border-amber-500/30 bg-[#250E09] text-amber-200/80'
                          }`}
                        >
                          {preset.toLocaleString()}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => void handleConfirmJoin()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer shadow-lg"
                >
                  <Dices className="h-4 w-4 shrink-0" />
                  {joining ? 'Joining Room...' : 'Confirm Bet & Enter Room'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectInvite(null)}
                  className="rounded-xl border border-amber-500/35 bg-[#1B0906] px-3.5 py-2.5 text-xs font-semibold text-amber-200 hover:bg-[#2C100B] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
