import React, { useEffect, useRef, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { CheckCircle2, Eye, EyeOff, Gift, Lock, UserCheck, UserPlus } from 'lucide-react';
import { TokenEconomy } from '../domain/TokenEconomy';
import { auth, googleProvider } from '../infrastructure/firebase/firebaseClient';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { BetSpotBrand } from './BetSpotBrand';
import { DiceTokenIcon } from './DiceTokenIcon';

interface AuthPageProps {
  engine: BetSpotEngine;
  initialMode?: 'login' | 'register';
  loginFocusNonce?: number;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  engine,
  initialMode = 'login',
  loginFocusNonce = 0,
}) => {
  const promo = engine.promoConfig;
  const capturedRef = engine.pendingReferralCode || '';

  const [mode, setMode] = useState<'login' | 'register'>(
    capturedRef ? 'register' : initialMode
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [registerLoading, setRegisterLoading] = useState<boolean>(false);
  const authCardRef = useRef<HTMLDivElement | null>(null);
  const loginInputRef = useRef<HTMLInputElement | null>(null);

  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  // Register fields
  const [displayName, setDisplayName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>(capturedRef);

  useEffect(() => {
    void engine.refreshPromoConfigFromServer();
  }, [engine]);

  useEffect(() => {
    if (capturedRef && !referralCode) {
      setReferralCode(capturedRef);
    }
  }, [capturedRef, referralCode]);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError(null);
    if (next !== 'login') {
      setSuccessMessage(null);
    }
  };

  useEffect(() => {
    if (loginFocusNonce <= 0) return;
    setMode('login');
    setError(null);
    authCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      loginInputRef.current?.focus();
    }, 120);
  }, [loginFocusNonce]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoginLoading(true);
    try {
      await engine.loginAccount(loginIdentifier, loginPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setRegisterLoading(true);
    try {
      const result = await engine.registerAccount({
        displayName,
        username,
        email,
        password,
        confirmPassword,
        referralCode: referralCode.trim() || undefined,
      });
      setLoginIdentifier(result.user.username);
      setLoginPassword('');
      setDisplayName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setReferralCode('');
      setShowPassword(false);
      setMode('login');

      const bonusNote = result.welcomeBonusGranted
        ? ` +${result.welcomeBonusTokens.toLocaleString()} Welcome Bonus Tokens credited to your wallet!`
        : '';
      const referralNote = result.referredByUsername
        ? ` Referral linked to @${result.referredByUsername} (deposit $1+ / ${promo.referralMinDepositTokens.toLocaleString()} TKN to unlock +${promo.referralBonusTokens.toLocaleString()} Bonus TKN each).`
        : '';

      setSuccessMessage(
        `Account created successfully for @${result.user.username}.${bonusNote}${referralNote} Please sign in with your password to enter BetSpot.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await engine.loginOrRegisterGoogleUser(cred.user, referralCode.trim() || undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Google sign-in popup was closed before finishing.');
      } else {
        setError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[1120px] items-center px-4 py-10 sm:px-6">
      <div className="grid w-full grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Overview */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-amber-500/25 bg-[#2A100B] p-7 sm:p-8 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <BetSpotBrand size="lg" />
              <span className="text-xs font-semibold text-amber-300/90">
                Player Access
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-amber-50 sm:text-4xl [text-wrap:balance]">
              Sign in or create your BetSpot account in seconds
            </h1>
            <p className="text-sm text-amber-100/75 leading-relaxed max-w-lg">
              Access 6-tier Dice Arena rooms, real-time P2P side-betting pools, and live P2P sports markets from one unified token wallet.
            </p>

            {/* Live Welcome Bonus Highlight (controlled by Admin Panel) */}
            {promo.welcomeBonusEnabled && promo.welcomeBonusTokens > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                  <DiceTokenIcon size="sm" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-emerald-300">
                    New Player Welcome Gift: +{promo.welcomeBonusTokens.toLocaleString()} Free Tokens!
                  </div>
                  <div className="mt-0.5 text-emerald-100/80 leading-relaxed">
                    Every newly registered account receives {promo.welcomeBonusTokens.toLocaleString()} TKN free in the wallet to start rolling immediately.
                  </div>
                </div>
              </div>
            )}

            {/* Live Referral Program Highlight */}
            {promo.referralProgramEnabled && promo.referralBonusTokens > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/35 bg-[#190907] p-3.5">
                <Gift className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-amber-300">
                    Invite &amp; Earn: +{promo.referralBonusTokens.toLocaleString()} Bonus Tokens Each
                  </div>
                  <div className="mt-0.5 text-amber-100/75 leading-relaxed">
                    Join via a friend&apos;s referral link &amp; deposit at least ${(promo.referralMinDepositTokens / Math.max(1, TokenEconomy.TOKENS_PER_USD)).toFixed(2)} ({promo.referralMinDepositTokens.toLocaleString()} TKN) — both of you earn +{promo.referralBonusTokens.toLocaleString()} Bonus TKN!
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-amber-500/20 pt-6">
            <div>
              <div className="text-xs text-amber-200/65">Fixed Token Peg</div>
              <div className="mt-1 font-mono-tabular text-sm font-semibold text-amber-100">
                1 USD = {TokenEconomy.TOKENS_PER_USD.toLocaleString()} TKN
              </div>
            </div>
            <div>
              <div className="text-xs text-amber-200/65">Minimum Bet</div>
              <div className="mt-1 font-mono-tabular text-sm font-semibold text-emerald-400">
                {TokenEconomy.MIN_BET_TOKENS.toLocaleString()} Tokens
              </div>
            </div>
            <div>
              <div className="text-xs text-amber-200/65">Fairness Engine</div>
              <div className="mt-1 font-mono-tabular text-sm font-semibold text-amber-300">
                Crypto RNG
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Form */}
        <div
          ref={authCardRef}
          className="lg:col-span-6 rounded-2xl border border-amber-500/25 bg-[#2A100B] p-7 sm:p-8 space-y-6"
        >
          {/* Segmented Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-amber-500/25 bg-[#190907] p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                mode === 'login'
                  ? 'bg-[#461B12] text-amber-300'
                  : 'text-amber-100/60 hover:text-amber-100'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                mode === 'register'
                  ? 'bg-[#461B12] text-amber-300'
                  : 'text-amber-100/60 hover:text-amber-100'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span>
                Register
                {promo.welcomeBonusEnabled && promo.welcomeBonusTokens > 0
                  ? ` (+${promo.welcomeBonusTokens} Free)`
                  : ''}
              </span>
            </button>
          </div>

          {successMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
            >
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-id" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Username or Email
                </label>
                <input
                  ref={loginInputRef}
                  id="login-id"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter username or email"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {loginLoading ? 'Signing In...' : 'Sign In to BetSpot'}
              </button>

              <button
                type="button"
                disabled={googleLoading}
                onClick={() => void handleGoogleSignIn()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-[#190907] px-4 py-2.5 text-xs font-semibold text-amber-100 hover:border-amber-400 hover:bg-[#230E0A] disabled:opacity-60 cursor-pointer transition-colors"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-slate-900">
                  G
                </span>
                {googleLoading ? 'Connecting Google Account...' : 'Continue with Google'}
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 pt-4 text-xs">
                <span className="text-slate-400">
                  New to BetSpot?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                  >
                    Create a free account
                  </button>
                </span>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => void handleRegisterSubmit(e)} className="space-y-3.5">
              {capturedRef && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <span className="flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                    Referral Invite Applied: <strong className="font-mono-tabular text-amber-300">{capturedRef}</strong>
                  </span>
                  <span className="text-[10px] text-emerald-300 font-semibold">
                    +{promo.referralBonusTokens} TKN on $1+ deposit
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    placeholder="e.g. Kasun Perera"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Username
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    required
                    placeholder="e.g. Kasun_99"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password (6+ chars)
                  </label>
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Create password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    id="reg-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-referral" className="block text-xs font-medium text-amber-200/80 mb-1.5">
                  Referral Invite Code (Optional)
                </label>
                <input
                  id="reg-referral"
                  type="text"
                  placeholder={
                    promo.referralProgramEnabled
                      ? `Friend's code (earn +${promo.referralBonusTokens} TKN each on $1+ deposit)`
                      : 'Optional referral code'
                  }
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-amber-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="rounded border-slate-700 bg-[#0B0F17]"
                  />
                  <span>Show password</span>
                </label>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Lock className="h-3 w-3 text-emerald-400" />
                  Player account
                </span>
              </div>

              <button
                type="submit"
                disabled={registerLoading}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {registerLoading
                  ? 'Creating Account...'
                  : promo.welcomeBonusEnabled && promo.welcomeBonusTokens > 0
                    ? `Create Account (+${promo.welcomeBonusTokens} Free TKN)`
                    : 'Create Account'}
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Sign in here
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
