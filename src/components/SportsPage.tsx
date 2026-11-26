import React from 'react';
import { ArrowLeft, Clock, Trophy } from 'lucide-react';

interface SportsPageProps {
  onBackToDice?: () => void;
}

export const SportsPage: React.FC<SportsPageProps> = ({ onBackToDice }) => {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-[#1B0A07]">
        <img
          src="/src/assets/images/sports_arena_banner_1795377815173.jpg"
          alt="BetSpot Sports Arena"
          referrerPolicy="no-referrer"
          className="h-64 w-full object-cover opacity-35 sm:h-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#130604] via-[#130604]/80 to-transparent" />

        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-[#2A100B]/90 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>Coming Soon</span>
          </div>

          <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-amber-50 sm:text-4xl">
            BetSpot Sports · Coming Soon
          </h1>

          <p className="mt-3 max-w-xl text-sm text-amber-100/80 leading-relaxed">
            Our live P2P Sports Arena covering all global sports is currently under final preparation and will be launching soon, giving you the chance to bet across every major sport worldwide.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {onBackToDice && (
              <button
                type="button"
                onClick={onBackToDice}
                className="flex items-center gap-2 rounded-xl border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-bold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Play Dice Arena</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-[#2A100B]/85 px-4 py-2.5 text-xs font-medium text-amber-200/85">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Unified Token Wallet Ready</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
