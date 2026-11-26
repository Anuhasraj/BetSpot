import React from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { DiceBoard } from '../domain/DiceBoard';
import { DaduketaDieFace } from './DaduketaDieFace';

export type RoomLedgerTab = 'rolls' | 'sidebets' | 'spectators' | 'winners';

export interface ArenaRoomLedgerProps {
  board: DiceBoard;
  activeUserId: string;
  ledgerTab: RoomLedgerTab;
  onChangeTab: (tab: RoomLedgerTab) => void;
}

/**
 * Bottom room transparency panel showing roll log (with Daduketa dot faces),
 * side-bet settlements, spectators, and match winners for the current match.
 */
export const ArenaRoomLedger: React.FC<ArenaRoomLedgerProps> = ({
  board,
  activeUserId,
  ledgerTab,
  onChangeTab,
}) => {
  return (
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
              onClick={() => onChangeTab(tab.id as RoomLedgerTab)}
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
                          w.userId === activeUserId
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
              No dice rolled yet in this room. Open the Betting Dashboard below to place your bet.
            </p>
          ) : (
            board.rollHistory.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-[#190907] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-amber-100 truncate">{r.rollerUsername}</div>
                  <div
                    className={`text-[11px] ${
                      r.isTieBreaker ? 'font-bold text-emerald-300' : 'text-amber-200/55'
                    }`}
                  >
                    {r.isTieBreaker ? 'Tie-Breaker Roll' : 'Main Roll'}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-right font-mono-tabular shrink-0">
                  <div className="text-[10px] text-amber-200/55">Opp {r.oppositeFace}</div>
                  <DaduketaDieFace face={r.face} size="sm" />
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
  );
};
