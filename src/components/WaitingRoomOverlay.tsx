import React from 'react';
import { Dices, Search } from 'lucide-react';
import { TierId } from '../domain/types';
import { ROOM_ARENA_THEMES } from '../three/daduketaTextures';

export interface WaitingRoomOverlayProps {
  tierId: TierId;
  roomName: string;
  maxSeats: number;
  betAmount: number;
  occupiedCount: number;
  busy: boolean;
  onCancelAndRefund: () => void;
}

/**
 * Animated matchmaking screen shown after a player locks their bet
 * while waiting for at least one opponent to join the room.
 */
export const WaitingRoomOverlay: React.FC<WaitingRoomOverlayProps> = ({
  tierId,
  roomName,
  maxSeats,
  betAmount,
  occupiedCount,
  busy,
  onCancelAndRefund,
}) => {
  const searchTheme =
    ROOM_ARENA_THEMES[tierId] ?? ROOM_ARENA_THEMES[TierId.TIER_1];

  return (
    <div className="flex min-h-[420px] items-center justify-center py-8">
      <div
        className={`w-full max-w-md rounded-2xl border-2 p-8 text-center shadow-2xl space-y-6 ${searchTheme.uiWrapperClass}`}
      >
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-amber-400/40 animate-ping" />
          <span
            className="absolute inset-2 rounded-full border border-amber-300/35 animate-spin"
            style={{ animationDuration: '2.4s' }}
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/60 bg-[#2A100B] text-amber-300 shadow-lg">
            <Dices className="h-8 w-8 animate-bounce" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Search className="h-3.5 w-3.5 animate-pulse" />
            <span>Waiting for Other Players</span>
          </div>
          <h2 className="font-display text-2xl font-extrabold text-amber-50">
            {roomName}
          </h2>
          <p className="text-xs text-amber-200/75 leading-relaxed">
            Your bet of{' '}
            <strong className="font-mono-tabular text-amber-100">
              {betAmount.toLocaleString()} TKN
            </strong>{' '}
            is locked. You will enter the 3D dice ground as soon as another player joins!
          </p>
        </div>

        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/40 border border-amber-500/20">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-emerald-400 animate-pulse" />
          </div>
          <div className="font-mono-tabular text-[11px] text-amber-200/75">
            Players in Room: {occupiedCount} / {maxSeats}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onCancelAndRefund}
          className="rounded-lg border border-rose-400/45 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-60 cursor-pointer"
        >
          Cancel &amp; Refund
        </button>
      </div>
    </div>
  );
};
