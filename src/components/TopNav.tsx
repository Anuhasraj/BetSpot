import React from 'react';
import { LogIn } from 'lucide-react';
import { TokenEconomy } from '../domain/TokenEconomy';
import { BetSpotBrand } from './BetSpotBrand';
import { DiceTokenIcon } from './DiceTokenIcon';

export type AppSection = 'dice' | 'sports' | 'rules' | 'wallet' | 'account';

interface TopNavProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  onLoginClick?: () => void;
  isAuthenticated: boolean;
  availableBalance: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeSection,
  onNavigate,
  onLoginClick,
  isAuthenticated,
  availableBalance,
}) => {
  const navItems: { id: AppSection; label: string }[] = isAuthenticated
    ? [
        { id: 'dice', label: 'Dice Arena' },
        { id: 'sports', label: 'BetSpot Sports' },
        { id: 'rules', label: 'Rules & Guide' },
        { id: 'wallet', label: 'Wallet' },
        { id: 'account', label: 'My Account' },
      ]
    : [];

  return (
    <header className="sticky top-0 z-40 border-b border-amber-500/25 bg-[#260D09]/95 backdrop-blur-md shadow-md">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 sm:gap-6 px-3 py-3 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark with Dice Emblem */}
        <button
          type="button"
          onClick={() => (isAuthenticated ? onNavigate('dice') : onLoginClick?.())}
          className="shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg"
          aria-label="BetSpot Home"
        >
          <BetSpotBrand size="md" />
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        {isAuthenticated ? (
          <nav className="hidden md:flex items-center gap-5 lg:gap-7" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-1 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded ${
                    isActive ? 'text-amber-300' : 'text-amber-100/70 hover:text-amber-100'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[13px] h-[3px] rounded-t bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="hidden md:block text-xs font-medium text-amber-200/75 whitespace-nowrap">
            Dice Arena &amp; P2P Sports Betting
          </div>
        )}

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => onNavigate('wallet')}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg border-b-2 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer font-mono-tabular shadow-sm"
            >
              <DiceTokenIcon size="sm" tone="dark" />
              {TokenEconomy.formatTokens(availableBalance)}
            </button>
          ) : (
            <button
              type="button"
              onClick={onLoginClick}
              className="flex items-center gap-1.5 rounded-lg border-b-2 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-extrabold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>Login</span>
            </button>
          )}
        </div>
      </div>

      {/* Responsive Wrapped Mobile/Small-Tablet Navigation Row (Every tab visible without clipping) */}
      {isAuthenticated && (
        <nav
          className="flex md:hidden flex-wrap items-center justify-center gap-1.5 border-t border-amber-500/15 px-3 py-2"
          aria-label="Mobile Navigation"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive ? 'bg-[#461A11] text-amber-300 border border-amber-400/35' : 'text-amber-100/75 hover:text-amber-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
};
