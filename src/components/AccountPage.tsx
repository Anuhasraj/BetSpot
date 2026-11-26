import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  KeyRound,
  Landmark,
  LogOut,
  ShieldCheck,
  Upload,
  User as UserIcon,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import {
  AVATAR_FRAME_STYLES,
  COUNTRY_PHONE_CODES,
  GLOBAL_COUNTRIES,
  SRI_LANKAN_BANKS,
} from '../domain/constants';
import { TokenEconomy } from '../domain/TokenEconomy';
import { ApprovalStatus, KycStatus, TransactionType } from '../domain/types';
import { PRESET_AVATARS } from '../domain/User';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { readAndCompressImageFile } from '../utils/imageUpload';
import { AvatarFrame } from './AvatarFrame';
import { BirthdayCalendarInput } from './BirthdayCalendarInput';
import { CountryFlag } from './CountryFlag';
import { InviteAndEarnCard } from './InviteAndEarnCard';
import { PlayerTransactionLedger } from './PlayerTransactionLedger';

interface AccountPageProps {
  engine: BetSpotEngine;
  onNavigateWallet: () => void;
  onError: (msg: string) => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({
  engine,
  onNavigateWallet,
  onError,
}) => {
  const user = engine.activeUser;

  // Extended Profile fields
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [country, setCountry] = useState(user.country || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth || '');
  const [ageVerified, setAgeVerified] = useState(user.ageVerified);
  const [dailyBetLimit, setDailyBetLimit] = useState(
    user.dailyBetLimitTokens > 0 ? String(user.dailyBetLimitTokens) : ''
  );

  // Saved Payout Details fields
  const [savedCryptoAddress, setSavedCryptoAddress] = useState(user.savedCryptoAddress || '');
  const [savedBankName, setSavedBankName] = useState(
    user.savedBankDetails?.bankName || SRI_LANKAN_BANKS[0]
  );
  const [savedBranch, setSavedBranch] = useState(user.savedBankDetails?.branch || '');
  const [savedHolder, setSavedHolder] = useState(
    user.savedBankDetails?.accountHolder || user.displayName || ''
  );
  const [savedAcctNum, setSavedAcctNum] = useState(user.savedBankDetails?.accountNumber || '');

  // KYC Document upload fields (never initialize/display ID image after verification approval or rejection)
  const isKycRejected =
    user.kycStatus === KycStatus.UNVERIFIED && user.kycLastDecision === 'REJECTED';
  const [kycFileName, setKycFileName] = useState(
    user.kycStatus === KycStatus.VERIFIED || isKycRejected || !user.kycDocumentDataUrl
      ? ''
      : user.kycDocumentName || ''
  );
  const [kycDataUrl, setKycDataUrl] = useState(
    user.kycStatus === KycStatus.VERIFIED || isKycRejected ? '' : user.kycDocumentDataUrl || ''
  );

  // Password fields
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Inline feedback banners & busy flags per card
  const [profileFeedback, setProfileFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [payoutFeedback, setPayoutFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [kycFeedback, setKycFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [avatarFeedback, setAvatarFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    void engine.syncActivePlayerWithServer();
  }, [engine, user.id]);

  useEffect(() => {
    if (user.kycStatus === KycStatus.VERIFIED) {
      setKycDataUrl('');
      setKycFileName('');
      setKycFeedback(null);
    } else if (user.kycStatus === KycStatus.UNVERIFIED && user.kycLastDecision === 'REJECTED') {
      setKycDataUrl('');
      setKycFileName('');
    }
  }, [user.kycStatus, user.kycLastDecision, user.kycReviewedAt]);

  const kycStatusLabel =
    user.kycStatus === KycStatus.VERIFIED
      ? 'APPROVED'
      : user.kycStatus === KycStatus.PENDING
        ? 'PENDING'
        : isKycRejected
          ? 'REJECTED'
          : 'UNVERIFIED';

  const isSriLanka = country === 'Sri Lanka';

  const handleCountryChange = (nextCountry: string) => {
    setCountry(nextCountry);
    const nextCode = COUNTRY_PHONE_CODES[nextCountry];
    if (!nextCode) return;

    // Strip any previously matched known dial code prefix before applying the new one
    const knownCodes = Object.values(COUNTRY_PHONE_CODES)
      .filter((c) => c.length > 1)
      .sort((a, b) => b.length - a.length);

    let localPart = phoneNumber.trim();
    for (const code of knownCodes) {
      if (localPart.startsWith(code)) {
        localPart = localPart.slice(code.length).trimStart();
        break;
      }
    }
    if (localPart === '+') {
      localPart = '';
    } else if (localPart.startsWith('+')) {
      localPart = localPart.replace(/^\+\d*\s*/, '');
    }

    setPhoneNumber(localPart ? `${nextCode === '+' ? '+' : `${nextCode} `}${localPart}` : nextCode === '+' ? '+' : `${nextCode} `);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setProfileFeedback(null);
    setSavingProfile(true);
    try {
      const parsedLimit = dailyBetLimit.trim() === '' ? 0 : Math.max(0, Number(dailyBetLimit) || 0);
      await engine.updateOwnProfile({
        displayName,
        email,
        country,
        phoneNumber,
        dateOfBirth,
        ageVerified,
        dailyBetLimitTokens: parsedLimit,
      });
      setProfileFeedback({ ok: true, msg: 'Profile details saved successfully!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update profile.';
      setProfileFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePayoutSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPayout) return;
    setPayoutFeedback(null);
    setSavingPayout(true);
    try {
      await engine.updateOwnPayoutDetails(
        savedCryptoAddress,
        isSriLanka
          ? {
              bankName: savedBankName,
              branch: savedBranch,
              accountHolder: savedHolder,
              accountNumber: savedAcctNum,
            }
          : undefined
      );
      setPayoutFeedback({ ok: true, msg: 'Saved payout details updated successfully!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update payout details.';
      setPayoutFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setSavingPayout(false);
    }
  };

  const handleKycFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKycFeedback(null);
    setKycFileName(file.name);
    void readAndCompressImageFile(file, { maxDimension: 1280, quality: 0.82 })
      .then((compressed) => {
        setKycDataUrl(compressed);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unable to read KYC image.';
        setKycFeedback({ ok: false, msg });
        onError(msg);
      });
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingKyc) return;
    setKycFeedback(null);
    setSavingKyc(true);
    try {
      await engine.submitOwnKycDocument(kycFileName, kycDataUrl);
      setKycFeedback({ ok: true, msg: 'KYC document submitted for verification review!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit KYC document.';
      setKycFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setSavingKyc(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordFeedback(null);
    setSavingPassword(true);
    try {
      await engine.changeOwnPassword(currentPw, newPw, confirmPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPasswordFeedback({ ok: true, msg: 'Password updated successfully!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not change password.';
      setPasswordFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || savingAvatar) return;
    setSavingAvatar(true);
    try {
      const compressed = await readAndCompressImageFile(file, { maxDimension: 512, quality: 0.82 });
      await engine.updateOwnAvatar(compressed);
      setAvatarFeedback({ ok: true, msg: 'Custom avatar image updated!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to process avatar image.';
      setAvatarFeedback({ ok: false, msg });
      onError(msg);
    } finally {
      setSavingAvatar(false);
    }
  };

  // Activity stats from ledger
  const totalWinsCount = user.wallet.transactions.filter(
    (t) => t.type === TransactionType.BET_WIN
  ).length;
  const totalWonTokens = user.wallet.transactions
    .filter((t) => t.type === TransactionType.BET_WIN)
    .reduce((sum, t) => sum + Math.max(0, t.amount), 0);
  const totalLossesCount = user.wallet.transactions.filter(
    (t) => t.type === TransactionType.BET_LOSS
  ).length;
  const totalLostTokens = user.wallet.transactions
    .filter((t) => t.type === TransactionType.BET_LOSS)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const kycBadgeColor =
    user.kycStatus === KycStatus.VERIFIED
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : user.kycStatus === KycStatus.PENDING
        ? 'border-amber-400/40 bg-amber-500/15 text-amber-300'
        : isKycRejected
          ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
          : 'border-rose-500/40 bg-rose-500/15 text-rose-300';

  const userPaymentRequests = engine.paymentService.requests.filter(
    (req) => req.userId === user.id
  );
  const pendingWithdrawalTokens = userPaymentRequests
    .filter((req) => req.kind === 'WITHDRAWAL' && req.status === ApprovalStatus.PENDING)
    .reduce((sum, req) => sum + req.tokenAmount, 0);
  const activeBetHeldTokens = Math.max(0, user.wallet.heldBalance - pendingWithdrawalTokens);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-amber-100">
            My Account &amp; Player Profile
          </h1>
          <p className="mt-1 text-sm text-amber-200/70">
            Manage your personal identity, country, contact info, KYC verification, saved payout channels, and login security.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void engine.logoutAccount();
          }}
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 cursor-pointer whitespace-nowrap"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      {/* Account Overview Strip with Large Avatar Frame (USD Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3.5 rounded-xl border border-amber-500/25 bg-[#2A100B] p-4">
          <AvatarFrame
            src={user.avatarUrl}
            username={user.username}
            size="lg"
            highlighted
            frameId={user.avatarFrameId}
            country={user.country || undefined}
          />
          <div className="min-w-0">
            <div className="text-xs text-amber-200/65">Signed-In Player</div>
            <div className="mt-0.5 font-display text-base font-bold text-amber-100 truncate">
              @{user.username}
            </div>
            <div className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 border-amber-400/35 bg-[#190907]">
              <span>{user.status}</span>
              <span>·</span>
              <span>{user.role}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-4">
          <div className="text-xs text-amber-200/65">Available Balance</div>
          <div className="mt-1.5 font-mono-tabular text-lg font-bold text-emerald-400">
            {TokenEconomy.formatTokens(user.wallet.availableBalance)}
          </div>
          <div className="mt-0.5 font-mono-tabular text-xs text-amber-200/70">
            {TokenEconomy.formatUsd(user.wallet.availableBalance)} USD
          </div>
          {user.wallet.heldBalance > 0 && (
            <div className="mt-1 font-mono-tabular text-[11px] text-amber-300">
              In Bets / Held: {TokenEconomy.formatTokens(user.wallet.heldBalance)}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-amber-200/65">
            <span>KYC &amp; Activity</span>
            <Activity className="h-3.5 w-3.5 text-amber-300" />
          </div>
          <div>
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold ${kycBadgeColor}`}
            >
              <BadgeCheck className="h-3 w-3" />
              KYC: {kycStatusLabel}
            </span>
          </div>
          <div className="text-[11px] font-mono-tabular text-amber-200/80 leading-relaxed">
            <span className="text-emerald-300">{totalWinsCount} Wins (+{totalWonTokens.toLocaleString()})</span>
            {' · '}
            <span className="text-rose-300">{totalLossesCount} Losses (-{totalLostTokens.toLocaleString()})</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-amber-500/25 bg-[#2A100B] p-4">
          <div>
            <div className="text-xs text-amber-200/65">Deposit or Withdraw</div>
            <div className="mt-1 text-xs text-amber-100/80">
              Top up via USDT (TRC-20) from ${'$'}{TokenEconomy.MIN_DEPOSIT_USD.toFixed(2)} USD or request payouts starting from ${'$'}{TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)} USD.
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateWallet}
            className="mt-3 w-fit rounded-lg border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer"
          >
            Open Wallet
          </button>
        </div>
      </div>

      {/* Win / Loss Audit & Full Wallet Transaction History */}
      <PlayerTransactionLedger
        transactions={user.wallet.transactions}
        username={user.username}
        activeBetHeldTokens={activeBetHeldTokens}
        variant="account"
      />

      {/* Deposit / Withdrawal Review Decisions Synced from Admin */}
      {userPaymentRequests.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-amber-100">
                Deposit &amp; Withdrawal Review Updates ({userPaymentRequests.length})
              </h2>
              <p className="text-xs text-amber-200/65">
                Live approval and rejection decisions synced directly from Admin review.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateWallet}
              className="rounded-lg border border-amber-400/35 bg-[#190907] px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-[#3A170E] cursor-pointer"
            >
              Manage in Wallet
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            {userPaymentRequests.slice(0, 8).map((req) => (
              <div
                key={req.id}
                className="rounded-lg border border-amber-500/20 bg-[#190907] p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-100">
                    {req.kind} · {req.tokenAmount.toLocaleString()} TKN (${req.usdEquivalent.toFixed(2)})
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                      req.status === ApprovalStatus.APPROVED
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : req.status === ApprovalStatus.REJECTED
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                          : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {req.status === ApprovalStatus.APPROVED ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : req.status === ApprovalStatus.REJECTED ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {req.status}
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-amber-200/70 truncate">
                  Ref: {req.referenceId} · {req.destinationOrBankDetails}
                </div>
                {req.adminNote && (
                  <div
                    className={`rounded border px-2 py-1 text-[11px] ${
                      req.status === ApprovalStatus.REJECTED
                        ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                        : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                    }`}
                  >
                    Admin Note: {req.adminNote}
                  </div>
                )}
                <div className="text-[10px] text-amber-200/50">
                  {req.reviewedAt
                    ? `Reviewed ${new Date(req.reviewedAt).toLocaleString()}`
                    : `Submitted ${new Date(req.createdAt).toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified Avatar Selection (10 Presets + Custom Upload) */}
      <div className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-amber-100">
              Player Avatar
            </h2>
            <p className="text-xs text-amber-200/65">
              Choose your player avatar from the list below or upload your own photo.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-[#190907] px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-[#3A170E] cursor-pointer">
            <Upload className="h-3.5 w-3.5 text-amber-400" />
            Upload Custom Image
            <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {PRESET_AVATARS.map((url, idx) => {
            const frame = AVATAR_FRAME_STYLES[idx % AVATAR_FRAME_STYLES.length];
            const selected =
              user.avatarUrl === url &&
              (user.avatarFrameId || AVATAR_FRAME_STYLES[0].id) === frame.id;
            return (
              <button
                key={`preset_${idx}`}
                type="button"
                disabled={savingAvatar}
                onClick={() => {
                  if (savingAvatar) return;
                  setSavingAvatar(true);
                  void engine
                    .updateOwnAvatarPreset(url, frame.id)
                    .then(() => {
                      setAvatarFeedback({ ok: true, msg: `${frame.label} avatar selected!` });
                    })
                    .catch((err) => {
                      const msg = err instanceof Error ? err.message : 'Unable to update avatar.';
                      setAvatarFeedback({ ok: false, msg });
                      onError(msg);
                    })
                    .finally(() => setSavingAvatar(false));
                }}
                className={`flex items-center gap-2.5 rounded-xl border p-2 cursor-pointer transition-colors text-left disabled:opacity-60 ${
                  selected
                    ? 'border-amber-300 bg-[#461B12]'
                    : 'border-amber-500/20 bg-[#190907] hover:border-amber-400/50'
                }`}
              >
                <AvatarFrame
                  src={url}
                  username={user.username}
                  size="md"
                  highlighted={selected}
                  frameId={frame.id}
                  country={user.country || undefined}
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-100 truncate">
                    Avatar #{idx + 1}
                  </div>
                  <div className="text-[10px] text-amber-200/65 truncate">
                    {frame.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {avatarFeedback && (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              avatarFeedback.ok
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
            }`}
          >
            {avatarFeedback.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{avatarFeedback.msg}</span>
          </div>
        )}
      </div>

      {/* Profile Details + Saved Payout Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <form
          onSubmit={handleProfileSave}
          className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-amber-100">
              Personal Profile &amp; Gaming Controls
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-amber-200/70 mb-1.5">Username</label>
              <input
                type="text"
                disabled
                value={user.username}
                className="w-full rounded-lg border border-amber-500/20 bg-[#190907]/70 px-3 py-2 text-xs text-amber-200/60 cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="acct-display-name" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                Full Name
              </label>
              <input
                id="acct-display-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="acct-email" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                Email Address
              </label>
              <input
                id="acct-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="acct-phone" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                Phone / WhatsApp Number
              </label>
              <div className="flex items-center rounded-lg border border-amber-500/30 bg-[#190907] focus-within:border-amber-400">
                {country && (
                  <span className="border-r border-amber-500/20 px-2.5 py-2 flex items-center shrink-0">
                    <CountryFlag country={country} size="sm" />
                  </span>
                )}
                <input
                  id="acct-phone"
                  type="tel"
                  placeholder={
                    country && COUNTRY_PHONE_CODES[country]
                      ? `${COUNTRY_PHONE_CODES[country]} 77 123 4567`
                      : 'e.g. +1 555 019 2834'
                  }
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 font-mono-tabular text-xs text-amber-50 placeholder:text-amber-200/35 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="acct-country" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                Country / Region
              </label>
              <select
                id="acct-country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
              >
                <option value="">Select Country / Region</option>
                {GLOBAL_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="acct-dob" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                Date of Birth (Calendar · 18+ Required)
              </label>
              <BirthdayCalendarInput
                id="acct-dob"
                value={dateOfBirth}
                onChange={(nextDate) => setDateOfBirth(nextDate)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="acct-daily-limit" className="block text-xs font-medium text-amber-100/80 mb-1.5">
              Responsible Gaming · Daily Bet Limit (TKN, leave empty for no limit)
            </label>
            <input
              id="acct-daily-limit"
              type="number"
              min={0}
              step={1}
              placeholder={`e.g. ${TokenEconomy.MIN_WITHDRAW_TOKENS}`}
              value={dailyBetLimit}
              onChange={(e) => setDailyBetLimit(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 font-mono-tabular text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-amber-100/85 cursor-pointer">
            <input
              type="checkbox"
              checked={ageVerified}
              onChange={(e) => setAgeVerified(e.target.checked)}
              className="rounded border-amber-500/40 bg-[#190907]"
            />
            <span>I confirm I am 18 years or older and accept fair play rules.</span>
          </label>

          {profileFeedback && (
            <div
              role={profileFeedback.ok ? 'status' : 'alert'}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                profileFeedback.ok
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
              }`}
            >
              {profileFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{profileFeedback.msg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-lg border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-xs font-bold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer"
          >
            {savingProfile ? 'Saving...' : 'Save Profile Details'}
          </button>
        </form>

        {/* Saved Default Payout Details */}
        <form
          onSubmit={handlePayoutSave}
          className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <WalletIcon className="h-4 w-4 text-amber-300" />
            <h2 className="font-display text-base font-semibold text-amber-100">
              Saved Default Payout Channels
            </h2>
          </div>
          <p className="text-xs text-amber-200/65">
            Save your default USDT (TRC-20) wallet address and bank account here to auto-fill future withdrawal requests.
          </p>

          <div>
            <label htmlFor="acct-crypto-addr" className="block text-xs font-medium text-amber-100/80 mb-1.5">
              Default USDT (TRC-20) Wallet Address
            </label>
            <input
              id="acct-crypto-addr"
              type="text"
              placeholder="e.g. TX7mK9pQ2vR8nL4wZ6cB3yH5..."
              value={savedCryptoAddress}
              onChange={(e) => setSavedCryptoAddress(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 font-mono-tabular text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="border-t border-amber-500/20 pt-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
              <Landmark className="h-3.5 w-3.5 text-amber-400" />
              <span>Default Local Bank Account</span>
            </div>

            {isSriLanka ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="acct-bank-name" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                      Bank Name
                    </label>
                    <select
                      id="acct-bank-name"
                      value={savedBankName}
                      onChange={(e) => setSavedBankName(e.target.value)}
                      className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
                    >
                      {SRI_LANKAN_BANKS.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="acct-bank-branch" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                      Branch
                    </label>
                    <input
                      id="acct-bank-branch"
                      type="text"
                      placeholder="e.g. City Branch"
                      value={savedBranch}
                      onChange={(e) => setSavedBranch(e.target.value)}
                      className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="acct-bank-holder" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                      Account Holder Name
                    </label>
                    <input
                      id="acct-bank-holder"
                      type="text"
                      placeholder="Full name"
                      value={savedHolder}
                      onChange={(e) => setSavedHolder(e.target.value)}
                      className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="acct-bank-num" className="block text-xs font-medium text-amber-100/80 mb-1.5">
                      Account Number
                    </label>
                    <input
                      id="acct-bank-num"
                      type="text"
                      placeholder="Account number"
                      value={savedAcctNum}
                      onChange={(e) => setSavedAcctNum(e.target.value)}
                      className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 font-mono-tabular text-xs text-amber-50 placeholder:text-amber-200/35 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Local bank account withdrawals are not supported for your country{country ? ` (${country})` : ''}.
                </span>
              </div>
            )}
          </div>

          {payoutFeedback && (
            <div
              role={payoutFeedback.ok ? 'status' : 'alert'}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                payoutFeedback.ok
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
              }`}
            >
              {payoutFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{payoutFeedback.msg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={savingPayout}
            className="rounded-lg border-b-2 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-xs font-bold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 disabled:opacity-60 cursor-pointer"
          >
            {savingPayout ? 'Saving...' : 'Save Payout Channels'}
          </button>
        </form>
      </div>

      {/* KYC Identity Verification + Change Password */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <form
          onSubmit={handleKycSubmit}
          className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-base font-semibold text-amber-100">
                KYC Identity Verification
              </h2>
            </div>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${kycBadgeColor}`}>
              {kycStatusLabel}
            </span>
          </div>

          {user.kycStatus === KycStatus.VERIFIED ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Identity Verified · KYC Approved</span>
              </div>
              <p className="text-xs text-emerald-100/80 leading-relaxed">
                Your identity verification has been reviewed and approved by an administrator. For your privacy and security, your submitted ID document image is no longer displayed on your account.
              </p>
              {(user.kycReviewNote || user.kycReviewedAt) && (
                <div className="rounded-lg border border-emerald-500/30 bg-[#13211B]/70 px-3 py-2 text-[11px] text-emerald-200 space-y-0.5">
                  {user.kycReviewNote && <div>Admin Note: {user.kycReviewNote}</div>}
                  {user.kycReviewedAt && (
                    <div className="text-emerald-200/70">
                      Approved {new Date(user.kycReviewedAt).toLocaleString()}
                      {user.kycReviewedBy ? ` · by ${user.kycReviewedBy}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {isKycRejected && (
                <div className="rounded-xl border border-rose-500/45 bg-rose-500/15 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-200">
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>Previous KYC Submission Rejected</span>
                  </div>
                  <p className="text-xs text-rose-100/90 leading-relaxed">
                    {user.kycReviewNote ||
                      'Your previous KYC document was rejected by the administrator. Please upload a clearer ID document and resubmit.'}
                  </p>
                  {user.kycReviewedAt && (
                    <div className="text-[10px] text-rose-200/75">
                      Reviewed {new Date(user.kycReviewedAt).toLocaleString()}
                      {user.kycReviewedBy ? ` · by ${user.kycReviewedBy}` : ''}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-amber-200/70">
                {user.kycStatus === KycStatus.PENDING
                  ? 'Your ID document has been submitted and is currently pending admin approval.'
                  : isKycRejected
                    ? 'Your old ID photo was removed. Upload a fresh, clearly readable Government ID, National ID, or Passport to resubmit.'
                    : 'Upload a clear photo of your Government ID, National ID, or Passport to verify your account for smooth withdrawals.'}
              </p>

              <label className="flex items-center justify-between rounded-lg border border-dashed border-amber-500/35 bg-[#190907] px-3 py-2.5 text-xs text-amber-100 hover:border-amber-400 cursor-pointer">
                <span className="flex items-center gap-2 truncate">
                  <Upload className="h-4 w-4 text-amber-300 shrink-0" />
                  <span className="truncate">
                    {kycFileName || 'Upload National ID / Passport (PNG / JPG)'}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleKycFileSelect}
                  className="hidden"
                />
              </label>

              {kycDataUrl && (
                <img
                  src={kycDataUrl}
                  alt="KYC Document Preview"
                  className="max-h-32 rounded-lg border border-amber-500/30 object-contain"
                />
              )}

              {kycFeedback && (
                <div
                  role={kycFeedback.ok ? 'status' : 'alert'}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                    kycFeedback.ok
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {kycFeedback.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <span>{kycFeedback.msg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingKyc}
                className="rounded-lg border-b-2 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-xs font-bold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-60 cursor-pointer"
              >
                {savingKyc
                  ? 'Submitting...'
                  : user.kycStatus === KycStatus.PENDING || isKycRejected
                    ? 'Resubmit KYC Document'
                    : 'Submit KYC for Verification'}
              </button>
            </>
          )}
        </form>

        <form
          onSubmit={handlePasswordSave}
          className="rounded-xl border border-amber-500/25 bg-[#2A100B] p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-base font-semibold text-amber-100">
              Change Password
            </h2>
          </div>

          <div>
            <label htmlFor="acct-cur-pw" className="block text-xs font-medium text-amber-100/80 mb-1.5">
              Current Password
            </label>
            <input
              id="acct-cur-pw"
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="acct-new-pw" className="block text-xs font-medium text-amber-100/80 mb-1.5">
              New Password (6+ characters)
            </label>
            <input
              id="acct-new-pw"
              type="password"
              required
              minLength={6}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="acct-confirm-pw" className="block text-xs font-medium text-amber-100/80 mb-1.5">
              Confirm New Password
            </label>
            <input
              id="acct-confirm-pw"
              type="password"
              required
              minLength={6}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 text-xs text-amber-50 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {passwordFeedback && (
            <div
              role={passwordFeedback.ok ? 'status' : 'alert'}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                passwordFeedback.ok
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
              }`}
            >
              {passwordFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{passwordFeedback.msg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            className="rounded-lg border border-amber-500/35 bg-[#190907] px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-[#3A170E] disabled:opacity-60 cursor-pointer"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Invite & Earn Referral Program */}
      <InviteAndEarnCard engine={engine} variant="account" />
    </div>
  );
};
