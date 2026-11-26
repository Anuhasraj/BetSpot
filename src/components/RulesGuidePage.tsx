import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Dices,
  ExternalLink,
  Headphones,
  Layers,
  Mail,
  MessageSquareWarning,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { DiceBoard } from '../domain/DiceBoard';
import { TokenEconomy } from '../domain/TokenEconomy';
import { BetSpotEngine, ContactConfig, DEFAULT_CONTACT_CONFIG } from '../services/BetSpotEngine';
import { DiceTokenIcon } from './DiceTokenIcon';

const TelegramIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
  </svg>
);

interface SupportTicket {
  id: string;
  name: string;
  email: string;
  category: string;
  referenceId: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
}

const COMPLAINT_CATEGORIES = [
  'Wallet, Deposit & Withdrawal',
  'Dice Room / Match Dispute',
  'P2P Side-Bet Settlement',
  'Account & KYC Verification',
  'Technical / 3D Arena Issue',
  'Other Inquiry',
];

interface RulesGuidePageProps {
  engine?: BetSpotEngine;
  currentUser?: {
    username: string;
    displayName: string;
    email: string;
  } | null;
  onPlayDice: () => void;
  onOpenWallet: () => void;
}

const OPPOSITE_PAIRS = [
  { a: 3, b: 18, note: 'Lowest vs Highest face' },
  { a: 6, b: 15, note: 'Low-Mid vs High-Mid face' },
  { a: 9, b: 12, note: 'Center pair' },
];

export const RulesGuidePage: React.FC<RulesGuidePageProps> = ({
  engine,
  currentUser,
  onPlayDice,
  onOpenWallet,
}) => {
  const [contact, setContact] = useState<ContactConfig>(
    () => engine?.contactConfig ?? DEFAULT_CONTACT_CONFIG
  );
  const [name, setName] = useState(
    currentUser ? `${currentUser.displayName} (@${currentUser.username})` : ''
  );
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0]);
  const [referenceId, setReferenceId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [emailCopied, setEmailCopied] = useState(false);
  const [tgCopied, setTgCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const loadContact = async () => {
      try {
        if (engine) {
          const c = await engine.fetchContactConfig();
          if (active) setContact(c);
        } else {
          const res = await fetch('/api/contact/config');
          const data = (await res.json()) as { config?: ContactConfig };
          if (active && data.config) setContact(data.config);
        }
      } catch {
        // use fallback
      }
    };
    void loadContact();
    return () => {
      active = false;
    };
  }, [engine]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(contact.supportEmail);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const cleanTgHandle = contact.telegramUsername.startsWith('@')
    ? contact.telegramUsername
    : `@${contact.telegramUsername}`;

  const cleanTgLink =
    contact.telegramLink || `https://t.me/${contact.telegramUsername.replace(/^@/, '')}`;

  const handleCopyTelegram = async () => {
    try {
      await navigator.clipboard.writeText(cleanTgHandle);
      setTgCopied(true);
      window.setTimeout(() => setTgCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmittedTicket(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (!cleanName) {
      setFormError('Please enter your full name or username.');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Please provide a valid email address so Customer Care can reply.');
      return;
    }
    if (cleanSubject.length < 4) {
      setFormError('Please enter a short subject for your complaint or inquiry.');
      return;
    }
    if (cleanMessage.length < 15) {
      setFormError('Please describe the issue in at least 15 characters.');
      return;
    }

    if (submittingTicket) return;
    setSubmittingTicket(true);

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          category,
          referenceId: referenceId.trim() || 'N/A',
          subject: cleanSubject,
          message: cleanMessage,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ticket?: SupportTicket;
        error?: string;
      };
      if (!res.ok || !data.ticket) {
        throw new Error(data.error || 'Unable to submit support ticket to server.');
      }

      const next = [data.ticket, ...tickets].slice(0, 10);
      setTickets(next);
      setSubmittedTicket(data.ticket);
      setReferenceId('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Unable to submit complaint ticket. Please check your connection or email support directly.'
      );
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header Banner */}
      <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#2F120B] via-[#220B07] to-[#160604] p-5 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>Player Handbook &amp; Platform Guide</span>
            </div>
            <h1 className="font-display text-xl sm:text-3xl font-extrabold tracking-tight text-amber-50">
              BetSpot Dice Arena — Rules &amp; How It Works
            </h1>
            <p className="text-xs sm:text-sm text-amber-100/80 leading-relaxed">
              Everything you need to know about playing in our 6 themed Dice Arena rooms, Peer-to-Peer (P2P) Side-Betting, equalized minimum-bet matching, token deposits &amp; withdrawals, and customer care support.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onPlayDice}
              className="flex items-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer whitespace-nowrap shadow-md"
            >
              <Dices className="h-4 w-4" />
              <span>Enter Dice Arena</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenWallet}
              className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-[#2A100B] px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-[#3A170E] cursor-pointer whitespace-nowrap"
            >
              <Wallet className="h-4 w-4 text-amber-300" />
              <span>Open Wallet</span>
            </button>
          </div>
        </div>
      </section>

      {/* Section 1: Quick 4-Step Flow of How the App Works */}
      <section className="rounded-2xl border border-amber-500/20 bg-[#230C08]/95 p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
          <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
            01. How BetSpot Works Step by Step
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 text-xs">
          <div className="rounded-xl border border-amber-500/20 bg-[#180805] p-4 space-y-2">
            <div className="font-mono-tabular text-[11px] font-bold text-emerald-400">STEP 1</div>
            <div className="font-display text-sm font-bold text-amber-100">Top Up Your Token Wallet</div>
            <p className="text-amber-100/75 leading-relaxed">
              1.00 USD equals <strong className="text-amber-200">{TokenEconomy.TOKENS_PER_USD.toLocaleString()} TKN</strong>. Deposit via USDT (TRC-20) in your Wallet, upload your payment slip, and receive tokens once verified.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-[#180805] p-4 space-y-2">
            <div className="font-mono-tabular text-[11px] font-bold text-emerald-400">STEP 2</div>
            <div className="font-display text-sm font-bold text-amber-100">Choose a Room Tier</div>
            <p className="text-amber-100/75 leading-relaxed">
              Browse the 6 themed rooms (Bronze to VIP). Click <strong className="text-emerald-300">Play Dice</strong> to join a seat, or <strong className="text-amber-300">Side Bet</strong> to watch active rooms and bet on rolls.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-[#180805] p-4 space-y-2">
            <div className="font-mono-tabular text-[11px] font-bold text-emerald-400">STEP 3</div>
            <div className="font-display text-sm font-bold text-amber-100">Place Bet &amp; Throw the Die</div>
            <p className="text-amber-100/75 leading-relaxed">
              Once 2+ players join and countdown ends, stakes equalize to the lowest player bet (excess auto-refunded). Take turns throwing the 6-sided Dice in 3D.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-[#180805] p-4 space-y-2">
            <div className="font-mono-tabular text-[11px] font-bold text-emerald-400">STEP 4</div>
            <div className="font-display text-sm font-bold text-amber-100">Win Payouts &amp; Withdraw</div>
            <p className="text-amber-100/75 leading-relaxed">
              Highest roll wins the room pot (tie-breaker if tied). Side-bets settle right after each roll. Withdraw anytime from ${TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)} USD ({TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN) via USDT (TRC-20) or local banks.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: 6 Room Tiers Comparison (Responsive Cards on Mobile + Table on Tablet/Desktop) */}
      <section className="rounded-2xl border border-amber-500/20 bg-[#230C08]/95 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
              02. Room Tiers, Capacities &amp; Fees
            </h2>
          </div>
          <span className="text-xs text-amber-200/70">
            Each room features its own 3D arena ground &amp; seat capacity
          </span>
        </div>

        {/* Mobile & Small-Tablet Responsive Room Tier Cards (Zero hidden columns or awkward horizontal cramping) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden text-xs">
          {TokenEconomy.TIERS.map((tier, idx) => (
            <div
              key={tier.id}
              className="rounded-xl border border-amber-500/20 bg-[#180805] p-3.5 space-y-2 font-mono-tabular"
            >
              <div className="flex items-center justify-between border-b border-amber-500/15 pb-2">
                <span className="font-sans font-bold text-amber-100">
                  Tier {idx + 1} · {tier.label.split('·')[1]?.trim() ?? tier.label}
                </span>
                <span className="font-bold text-amber-300">{(tier.feeRate * 100).toFixed(0)}% Fee</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-sans text-amber-200/65">Bet Range (TKN)</span>
                <span className="text-amber-200 text-right">
                  {tier.minTokens.toLocaleString()} – {tier.maxTokens.toLocaleString()} TKN
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-sans text-amber-200/65">Bet Range (USD)</span>
                <span className="text-emerald-300 text-right">
                  {TokenEconomy.formatUsd(tier.minTokens)} – {TokenEconomy.formatUsd(tier.maxTokens)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-sans text-amber-200/65">Players / Room</span>
                <span className="font-bold text-white">{tier.maxSeats} Players</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-sans text-amber-200/65">Side-Bet Entry Fee</span>
                <span className="text-sky-300">{tier.spectatorEntryFee.toLocaleString()} TKN</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet Landscape & Desktop Full Table */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-amber-500/20 bg-[#180805]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-amber-500/20 text-amber-200/75">
                <th className="px-4 py-3 font-semibold">Room Name</th>
                <th className="px-4 py-3 font-semibold text-right">Bet Range (TKN)</th>
                <th className="px-4 py-3 font-semibold text-right">Bet Range (USD)</th>
                <th className="px-4 py-3 font-semibold text-right">Players / Room</th>
                <th className="px-4 py-3 font-semibold text-right">Side-Bet Entry Fee</th>
                <th className="px-4 py-3 font-semibold text-right">Winner Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/10 font-mono-tabular">
              {TokenEconomy.TIERS.map((tier, idx) => (
                <tr key={tier.id} className="hover:bg-[#240D08]/60">
                  <td className="px-4 py-3 font-sans font-bold text-amber-100">
                    Tier {idx + 1} · {tier.label.split('·')[1]?.trim() ?? tier.label}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-200">
                    {tier.minTokens.toLocaleString()} – {tier.maxTokens.toLocaleString()} TKN
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-300">
                    {TokenEconomy.formatUsd(tier.minTokens)} – {TokenEconomy.formatUsd(tier.maxTokens)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white">
                    {tier.maxSeats} Players
                  </td>
                  <td className="px-4 py-3 text-right text-sky-300">
                    {tier.spectatorEntryFee.toLocaleString()} TKN
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-amber-300">
                    {(tier.feeRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 & 4: Main Dice Rules & Side-Betting Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-amber-500/20 bg-[#230C08]/95 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
              03. Main Dice Room Rules
            </h2>
          </div>

          <ul className="space-y-3 text-xs text-amber-100/80 leading-relaxed">
            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">1. Daduketa 6-Sided Die Faces</strong>
              Faces are numbered <span className="font-mono-tabular text-amber-300 font-bold">3, 6, 9, 12, 15, 18</span>. Opposite faces always sum to 21:
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono-tabular text-[11px]">
                {OPPOSITE_PAIRS.map((p) => (
                  <div
                    key={p.a}
                    className="rounded-lg border border-amber-500/20 bg-[#230C08] px-2.5 py-1.5 text-center"
                  >
                    <span className="font-bold text-amber-200">
                      {p.a} ↔ {p.b}
                    </span>
                  </div>
                ))}
              </div>
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">2. Minimum-Bet Lock &amp; Excess Auto-Refund</strong>
              Every player can enter their chosen stake within the room range before start. When the lobby countdown finishes (with at least 2 players), all seated bets lock to the <strong className="text-emerald-300">lowest stake in the room</strong> — any higher stake difference is automatically refunded to your available wallet immediately.
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">
                3. Turn Order &amp; {DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window
              </strong>
              Each seated player throws once per match against the strike plank into the landing pit. Between turns, a <strong className="text-amber-300">{DiceBoard.SIDE_BET_WINDOW_SECONDS}-second Side-Bet Window</strong> opens for spectators and seated players to predict the next roll.
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">4. Highest Score Wins &amp; Tie-Breakers</strong>
              The player with the highest rolled face wins the entire locked room pot minus the room&apos;s Winner Fee. If two or more players tie for the top face, a sudden-death <strong className="text-amber-300">Tie-Breaker</strong> runs exclusively among the tied contenders until one winner emerges.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-amber-500/20 bg-[#230C08]/95 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
              04. P2P Side-Betting Rules (3 Sections · 11 Options)
            </h2>
          </div>

          <ul className="space-y-3 text-xs text-amber-100/80 leading-relaxed">
            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">1. Zero-House-Bank P2P Matching</strong>
              Side-bets are matched Peer-to-Peer directly against opposing player bets in the same {DiceBoard.SIDE_BET_WINDOW_SECONDS}-second round. Any unmatched stake that lacks a counter-bet is <strong className="text-emerald-300">100% refunded automatically</strong> when the roll lands.
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5 space-y-2">
              <strong className="text-amber-200 block">2. Three Side-Bet Categories &amp; Payout Odds</strong>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/10 pb-1.5">
                <span><strong className="text-white">Low / High</strong> (LOW 3·6·9 vs HIGH 12·15·18)</span>
                <span className="font-mono-tabular font-bold text-emerald-300">1:1 Payout</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/10 pb-1.5">
                <span><strong className="text-white">Single Number</strong> (Exact 3, 6, 9, 12, 15, or 18)</span>
                <span className="font-mono-tabular font-bold text-amber-300">5× Payout</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong className="text-white">Couple Pair</strong> (3,6 · 9,12 · or 15,18)</span>
                <span className="font-mono-tabular font-bold text-sky-300">2× Payout</span>
              </div>
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">3. Spectator Entry &amp; Side-Bet Stakes</strong>
              Seated main players can place side-bets for free inside their room. Non-playing spectators pay the room&apos;s one-time <strong className="text-sky-300">Side-Bet Entry Fee</strong> to watch the 3D arena and bet on any roll (minimum {TokenEconomy.MIN_BET_TOKENS.toLocaleString()} TKN per side-bet).
            </li>

            <li className="rounded-xl border border-amber-500/15 bg-[#180805] p-3.5">
              <strong className="text-amber-200 block mb-1">4. Dynamic Tier Fee on Side-Bet Winnings</strong>
              Winning side-bet payouts apply the tier fee corresponding to your side-bet stake amount (1% up to 30% depending on stake tier).
            </li>
          </ul>
        </section>
      </div>

      {/* Section 5: Wallet, Fair Play & Responsible Gaming Regulations */}
      <section className="rounded-2xl border border-amber-500/20 bg-[#230C08]/95 p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
          <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
            05. Wallet Rules, Fair Play &amp; Platform Regulations
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-amber-500/15 bg-[#180805] p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <DiceTokenIcon size="sm" />
              <span>Deposits &amp; Withdrawals</span>
            </div>
            <p className="text-amber-100/75 leading-relaxed">
              Deposits use <strong className="text-white">USDT (TRC-20)</strong> with a unique reference number and payment slip upload for verification (min ${TokenEconomy.MIN_DEPOSIT_USD.toFixed(2)} USD / {TokenEconomy.MIN_DEPOSIT_TOKENS.toLocaleString()} TKN). Withdrawals start at <strong className="text-white">${TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)} USD ({TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN)</strong> via USDT (TRC-20) globally, or Local Bank Transfer where supported.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/15 bg-[#180805] p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <Scale className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Cryptographic Fair RNG</span>
            </div>
            <p className="text-amber-100/75 leading-relaxed">
              Every Daduketa roll is generated exclusively on the BetSpot backend using Node.js <strong className="text-white">Cryptographic CSPRNG</strong> (<code className="text-amber-300">crypto.randomInt</code>) to guarantee uniform 1/6 probability per face with zero client-side RNG or predictable patterns.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/15 bg-[#180805] p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <ShieldCheck className="h-4 w-4 text-sky-400 shrink-0" />
              <span>18+ Compliance &amp; Safety Limits</span>
            </div>
            <p className="text-amber-100/75 leading-relaxed">
              Participants must be <strong className="text-white">18 years or older</strong>. You can upload KYC verification and set an optional <strong className="text-white">Daily Bet Limit</strong> inside <strong className="text-amber-200">My Account</strong> at any time to manage responsible play.
            </p>
          </div>
        </div>
      </section>

      {/* Section 6: About Us, Customer Care & Complaint Application Form */}
      <section className="rounded-2xl border border-amber-500/25 bg-[#230C08]/95 p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-amber-400 shrink-0" />
          <h2 className="font-display text-base sm:text-lg font-bold text-amber-100">
            06. About Us, Customer Care &amp; Submit a Complaint
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* About Us & Customer Care Contact Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-[#180805] p-4 sm:p-5 space-y-3 text-xs leading-relaxed">
              <h3 className="font-display text-sm font-bold text-amber-100">
                About BetSpot
              </h3>
              <p className="text-amber-100/80">
                BetSpot is a Peer-to-Peer (P2P) gaming and prediction platform built around transparent 3D Dice Arena rooms and fair player-to-player matching — with zero hidden house edge and an upcoming global P2P Sports Arena.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono-tabular">
                <div className="rounded-lg border border-amber-500/15 bg-[#220C08] p-2.5">
                  <div className="font-sans text-[11px] text-amber-200/65">Token Standard</div>
                  <div className="mt-0.5 font-bold text-emerald-300">
                    1 USD = {TokenEconomy.TOKENS_PER_USD.toLocaleString()} TKN
                  </div>
                </div>
                <div className="rounded-lg border border-amber-500/15 bg-[#220C08] p-2.5">
                  <div className="font-sans text-[11px] text-amber-200/65">Support Intake</div>
                  <div className="mt-0.5 font-bold text-amber-200">24/7 Desk</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/30 bg-[#180805] p-4 sm:p-5 space-y-3.5 text-xs">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-amber-100">
                <Headphones className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Customer Care Channels</span>
              </div>
              <p className="text-amber-100/75 leading-relaxed">
                Need assistance with a deposit slip, withdrawal payout, KYC verification, or match dispute? Reach our dedicated Customer Care team directly via Email or Telegram, or file a complaint ticket using the form.
              </p>

              {/* Direct Support Email */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200/80">
                  <Mail className="h-3.5 w-3.5 text-amber-400" />
                  <span>Email Support Desk</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-[#230C08] px-3 py-2">
                  <a
                    href={`mailto:${contact.supportEmail}`}
                    className="font-mono-tabular text-xs sm:text-sm font-bold text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline break-all"
                  >
                    {contact.supportEmail}
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-[#32130C] px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-[#461B11] cursor-pointer shrink-0"
                  >
                    {emailCopied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Email</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Official Telegram Support Channel */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                  <TelegramIcon className="h-3.5 w-3.5 text-sky-400" />
                  <span>Official Telegram Care</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-[#0d2235]/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-sky-500/20 text-sky-300 shrink-0">
                      <TelegramIcon className="h-3.5 w-3.5" />
                    </span>
                    <a
                      href={cleanTgLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-tabular text-xs sm:text-sm font-bold text-sky-300 hover:text-sky-200 underline-offset-2 hover:underline truncate"
                    >
                      {cleanTgHandle}
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={cleanTgLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-950/60 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900/60 cursor-pointer"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Chat</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyTelegram}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-[#162738] px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-[#1e344a] cursor-pointer"
                    >
                      {tgCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Handle</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-amber-200/65 pt-0.5">
                Typical response time: Under 2 hours via Telegram · Under 12 hours via Email desk.
              </div>
            </div>
          </div>

          {/* Complaint / Support Application Form */}
          <div className="lg:col-span-7 rounded-xl border border-amber-500/25 bg-[#180805] p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-amber-400 shrink-0" />
              <h3 className="font-display text-sm sm:text-base font-bold text-amber-100">
                Customer Complaint &amp; Support Application Form
              </h3>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/50 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-200"
              >
                {formError}
              </div>
            )}

            {submittedTicket && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-emerald-400/50 bg-emerald-950/60 px-3.5 py-3 text-xs text-emerald-100"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">
                    Complaint Ticket Submitted ({submittedTicket.id})
                  </div>
                  <p className="mt-0.5 text-emerald-100/80">
                    Thank you, {submittedTicket.name}. Our Customer Care desk will review &ldquo;{submittedTicket.subject}&rdquo; and respond to {submittedTicket.email}.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="font-semibold text-amber-200/85">Full Name / Username</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name or @username"
                    className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="font-semibold text-amber-200/85">Contact Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="font-semibold text-amber-200/85">Complaint Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
                  >
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 block">
                  <span className="font-semibold text-amber-200/85">
                    Room / Payment Ref ID <span className="text-amber-200/45">(Optional)</span>
                  </span>
                  <input
                    type="text"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    placeholder="e.g. DEP-1024 or Gold Room #1"
                    className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>

              <label className="space-y-1.5 block">
                <span className="font-semibold text-amber-200/85">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your issue or complaint"
                  className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                />
              </label>

              <label className="space-y-1.5 block">
                <span className="font-semibold text-amber-200/85">Complaint Details</span>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what happened, including date/time, token amount, or match details..."
                  className="w-full rounded-lg border border-amber-500/30 bg-[#230C08] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none resize-y"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-amber-200/60">
                  Direct email copy also accepted at {contact.supportEmail} or via Telegram {cleanTgHandle}
                </span>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer whitespace-nowrap shadow-md"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{submittingTicket ? 'Submitting...' : 'Submit Complaint'}</span>
                </button>
              </div>
            </form>

            {tickets.length > 0 && (
              <div className="border-t border-amber-500/20 pt-4 space-y-2.5">
                <div className="text-xs font-bold text-amber-200">
                  Your Submitted Tickets ({tickets.length})
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-amber-500/15 bg-[#220C08] p-3 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-amber-100">
                          {t.id} · {t.subject}
                        </span>
                        <span className="font-mono-tabular text-[11px] font-semibold text-emerald-300">
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-200/65">
                        {t.category} {t.referenceId !== 'N/A' ? `· Ref: ${t.referenceId}` : ''} · {t.createdAt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
