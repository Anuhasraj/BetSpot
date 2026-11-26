import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, LogOut, Swords, Volume2, VolumeX, X } from 'lucide-react';
import { ALL_INVITE_TIER_IDS, RoomInvite, RoomInvitePreferences } from '../domain/RoomInviteTypes';
import { TokenEconomy } from '../domain/TokenEconomy';
import { TierId } from '../domain/types';
import { User } from '../domain/User';
import { AvatarFrame } from './AvatarFrame';
import { DiceTokenIcon } from './DiceTokenIcon';

interface WorkspaceBarProps {
  currentUser: User | null;
  onOpenAccount: () => void;
  onLogoutPlayer: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  activeInvites: RoomInvite[];
  invitePrefs: RoomInvitePreferences;
  onUpdateInvitePrefs: (updates: Partial<RoomInvitePreferences>) => void;
  onSelectInvite: (invite: RoomInvite) => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  currentUser,
  onOpenAccount,
  onLogoutPlayer,
  isMuted,
  onToggleMute,
  activeInvites,
  invitePrefs,
  onUpdateInvitePrefs,
  onSelectInvite,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [drawerOpen]);

  if (!currentUser) return null;

  const filteredInvites = activeInvites.filter((inv) =>
    invitePrefs.enabledTierIds.includes(inv.tierId)
  );

  const toggleTierFilter = (tierId: TierId) => {
    const exists = invitePrefs.enabledTierIds.includes(tierId);
    const next = exists
      ? invitePrefs.enabledTierIds.filter((id) => id !== tierId)
      : [...invitePrefs.enabledTierIds, tierId];
    onUpdateInvitePrefs({ enabledTierIds: next });
  };

  return (
    <div className="border-b border-amber-500/15 bg-[#200B08]">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2.5 px-3 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex items-center gap-2 group cursor-pointer whitespace-nowrap"
          >
            <AvatarFrame
              src={currentUser.avatarUrl}
              username={currentUser.username}
              size="sm"
              highlighted
              frameId={currentUser.avatarFrameId}
              country={currentUser.country || undefined}
            />
            <span className="font-bold text-amber-200 group-hover:text-amber-300 transition-colors">
              @{currentUser.username}
            </span>
          </button>

          <span aria-hidden="true" className="text-amber-500/40">·</span>
          <span className="text-amber-100/60">Available:</span>
          <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-emerald-400">
            <DiceTokenIcon size="xs" />
            {TokenEconomy.formatTokens(currentUser.wallet.availableBalance)}
          </span>
          {currentUser.wallet.heldBalance > 0 && (
            <>
              <span aria-hidden="true" className="text-amber-500/40">·</span>
              <span className="text-amber-200/75 font-mono-tabular">
                In Bets:{' '}
                <strong className="text-amber-300">
                  {TokenEconomy.formatTokens(currentUser.wallet.heldBalance)}
                </strong>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-amber-500/40">·</span>
          <span className="font-mono-tabular text-amber-100/80">
            {TokenEconomy.formatUsd(currentUser.wallet.availableBalance)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Live Waiting Tables Bell & Filter Controls */}
          <div className="relative" ref={drawerRef}>
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label="Live room notifications and filters"
              className={`relative inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                filteredInvites.length > 0 && !invitePrefs.muted
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  : 'border-amber-500/25 bg-[#160705] text-amber-200/80 hover:text-amber-100'
              }`}
            >
              {invitePrefs.muted ? (
                <BellOff className="h-3.5 w-3.5 text-amber-300/70" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Live Tables</span>
              {activeInvites.length > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-md bg-emerald-400 px-1 py-0.5 font-mono-tabular text-[10px] font-extrabold text-slate-950">
                  {activeInvites.length}
                </span>
              )}
            </button>

            {drawerOpen && (
              <div className="absolute right-0 mt-2 z-50 w-80 sm:w-96 rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-[#33130C] to-[#190805] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-amber-500/25 pb-2.5">
                  <div>
                    <div className="text-xs font-bold text-amber-100">
                      Live Open Tables ({activeInvites.length})
                    </div>
                    <div className="text-[10px] text-amber-200/65">
                      Accept any waiting match with 1 click
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateInvitePrefs({ muted: !invitePrefs.muted })}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer ${
                        invitePrefs.muted
                          ? 'border-rose-400/45 bg-rose-500/15 text-rose-200'
                          : 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200'
                      }`}
                    >
                      {invitePrefs.muted ? 'Alerts Muted' : 'Alerts ON'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(false)}
                      aria-label="Close notifications"
                      className="rounded-lg p-1 text-amber-200/70 hover:bg-amber-500/15 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tier Alert Preferences */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
                    Notify Me For Tiers
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_INVITE_TIER_IDS.map((tierId, idx) => {
                      const active = invitePrefs.enabledTierIds.includes(tierId);
                      return (
                        <button
                          key={tierId}
                          type="button"
                          onClick={() => toggleTierFilter(tierId)}
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors ${
                            active
                              ? 'border-amber-300 bg-amber-400/25 text-amber-100'
                              : 'border-amber-500/20 bg-[#140604] text-amber-200/45 hover:text-amber-200'
                          }`}
                        >
                          T{idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Waiting Rooms List */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {activeInvites.length === 0 ? (
                    <div className="rounded-xl border border-amber-500/15 bg-[#140604] p-3 text-center text-[11px] text-amber-200/60">
                      No players waiting in open rooms right now. Join any Tier to broadcast!
                    </div>
                  ) : (
                    activeInvites.map((inv) => {
                      const tierShort = inv.tierLabel.split('·')[1]?.trim() ?? inv.tierLabel;
                      const secsLeft = Math.max(
                        0,
                        Math.ceil((inv.lobbyEndsAt - Date.now()) / 1000)
                      );
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-[#220B07] p-2.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <AvatarFrame
                              src={inv.hostAvatarUrl}
                              username={inv.hostUsername}
                              size="sm"
                              frameId={inv.hostAvatarFrameId}
                              country={inv.hostCountry || undefined}
                            />
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-amber-50 truncate">
                                {inv.hostUsername} · {tierShort}
                              </div>
                              <div className="font-mono-tabular text-[10px] text-amber-300/85">
                                {inv.betAmountTokens.toLocaleString()} TKN · {inv.occupiedCount}/
                                {inv.maxSeats} · {secsLeft}s
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerOpen(false);
                              onSelectInvite(inv);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-950 hover:bg-emerald-400 cursor-pointer shrink-0"
                          >
                            <Swords className="h-3 w-3" />
                            Join
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute audio cues' : 'Mute audio cues'}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/25 bg-[#160705] text-amber-200/75 hover:text-amber-100 cursor-pointer transition-colors"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onLogoutPlayer}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-[#160705] px-2.5 py-1.5 text-[11px] font-medium text-amber-100/80 hover:border-amber-400/50 hover:text-amber-100 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
