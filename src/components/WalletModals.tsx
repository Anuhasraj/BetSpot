import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Landmark,
  Lock,
  ShieldCheck,
  Upload,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { SRI_LANKAN_BANKS } from '../domain/constants';
import { PLATFORM_CRYPTO_DEPOSIT_ADDRESSES } from '../domain/EconomyTypes';
import { TokenEconomy } from '../domain/TokenEconomy';
import { PaymentMethod, PaymentRequest } from '../domain/types';
import { BetSpotEngine } from '../services/BetSpotEngine';
import { DiceTokenIcon } from './DiceTokenIcon';
import { readAndCompressImageFile } from '../utils/imageUpload';

interface DepositModalProps {
  isOpen: boolean;
  engine: BetSpotEngine;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, engine, onClose }) => {
  const [selectedMethod, setSelectedMethod] = useState<'CRYPTO' | 'LOCAL_BANK' | null>(null);
  const [usdInput, setUsdInput] = useState<string>(() =>
    String(Math.max(10, TokenEconomy.MIN_DEPOSIT_USD))
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<PaymentRequest | null>(null);
  const [copiedField, setCopiedField] = useState<'ref' | 'address' | null>(null);

  // Payment slip upload state
  const [slipFileName, setSlipFileName] = useState<string>('');
  const [slipDataUrl, setSlipDataUrl] = useState<string>('');
  const [slipUploadError, setSlipUploadError] = useState<string | null>(null);
  const [slipUploaded, setSlipUploaded] = useState<boolean>(false);
  const [submittingDeposit, setSubmittingDeposit] = useState<boolean>(false);
  const [submittingSlip, setSubmittingSlip] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedMethod(null);
    setUsdInput(String(Math.max(10, TokenEconomy.MIN_DEPOSIT_USD)));
    setFormError(null);
    setSubmittedRequest(null);
    setCopiedField(null);
    setSlipFileName('');
    setSlipDataUrl('');
    setSlipUploadError(null);
    setSlipUploaded(false);
    setSubmittingDeposit(false);
    setSubmittingSlip(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const numericUsd = Math.max(0, Number(usdInput) || 0);
  const previewTokens = TokenEconomy.usdToTokens(numericUsd);
  const usdtWalletInfo = PLATFORM_CRYPTO_DEPOSIT_ADDRESSES[PaymentMethod.CRYPTO_USDT];
  const usdtDepositAddress = engine.contactConfig.usdtDepositAddress?.trim() || usdtWalletInfo.address;

  const handleCopy = async (text: string, field: 'ref' | 'address') => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore clipboard failures in restricted frames
    }
  };

  const handleRequestCryptoDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDeposit) return;
    setFormError(null);
    setSubmittingDeposit(true);
    try {
      const rec = await engine.requestCryptoDeposit(numericUsd, PaymentMethod.CRYPTO_USDT);
      setSubmittedRequest(rec);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit deposit request.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const handleSlipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSlipUploadError(null);
    setSlipUploaded(false);
    setSlipFileName(file.name);
    void readAndCompressImageFile(file, { maxDimension: 1280, quality: 0.82 })
      .then((compressed) => {
        setSlipDataUrl(compressed);
      })
      .catch((err) => {
        setSlipUploadError(err instanceof Error ? err.message : 'Unable to process payment slip.');
      });
  };

  const handleUploadSlipToAdmin = async () => {
    if (!submittedRequest || submittingSlip) return;
    setSlipUploadError(null);
    if (!slipDataUrl) {
      setSlipUploadError('Please choose your payment slip / screenshot first.');
      return;
    }
    setSubmittingSlip(true);
    try {
      const updated = await engine.attachDepositReceipt(submittedRequest.id, slipFileName, slipDataUrl);
      setSubmittedRequest({ ...updated });
      setSlipUploaded(true);
    } catch (err) {
      setSlipUploadError(err instanceof Error ? err.message : 'Could not upload payment slip.');
    } finally {
      setSubmittingSlip(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#131A26] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden my-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0B0F17] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
            <h2
              id="deposit-modal-title"
              className="font-display text-sm sm:text-base font-bold text-slate-50 truncate"
            >
              {submittedRequest ? 'USDT (TRC-20) Deposit & Slip Upload' : 'Deposit Tokens · Select Method'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close deposit popup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-[#131A26] text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {submittedRequest ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">
                    Deposit Request Submitted
                  </div>
                  <p className="mt-0.5 text-emerald-100/80">
                    Send ${submittedRequest.usdEquivalent.toFixed(2)} USD in USDT (TRC-20) to the wallet address below, then upload your payment slip for verification.
                  </p>
                </div>
              </div>

              {/* Unique Reference Number */}
              <div className="rounded-xl border border-amber-400/40 bg-[#0B0F17] p-3.5 space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-amber-300/85">
                  Unique Reference Number
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-sm sm:text-base font-extrabold text-amber-300 break-all">
                    {submittedRequest.referenceId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(submittedRequest.referenceId, 'ref')}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-[#131A26] px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    {copiedField === 'ref' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Locked USDT TRC-20 Deposit Wallet Address */}
              <div className="rounded-xl border border-emerald-500/35 bg-[#0B0F17] p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium uppercase tracking-wider text-emerald-400">
                    Deposit Wallet Address
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-300">
                    <Lock className="h-3 w-3 text-emerald-400" />
                    {usdtWalletInfo.networkLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs sm:text-sm font-bold text-slate-100 break-all">
                    {usdtDepositAddress}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(usdtDepositAddress, 'address')}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer shrink-0"
                  >
                    {copiedField === 'address' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Amount Summary (USD & Tokens Only) */}
              <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5 space-y-2 text-xs font-mono-tabular">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Deposit Amount</span>
                  <span className="font-bold text-slate-100">
                    ${submittedRequest.usdEquivalent.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Tokens to Credit</span>
                  <span className="font-bold text-emerald-400">
                    +{submittedRequest.tokenAmount.toLocaleString()} TKN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Status</span>
                  <span className="font-bold text-amber-400">{submittedRequest.status}</span>
                </div>
              </div>

              {/* Payment Slip Upload Section */}
              <div className="rounded-xl border border-slate-700 bg-[#0B0F17] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      Upload Payment Slip
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Attach a screenshot/photo of your USDT (TRC-20) payment receipt so our team can verify &amp; credit your tokens.
                    </p>
                  </div>
                </div>

                {slipUploadError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200"
                  >
                    {slipUploadError}
                  </div>
                )}

                {slipUploaded ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2.5 text-xs text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Payment slip <strong>{submittedRequest.receiptPreviewName}</strong> submitted for review!
                    </span>
                  </div>
                ) : (
                  <>
                    <label className="flex items-center justify-between rounded-lg border border-dashed border-slate-600 bg-[#131A26] px-3 py-2.5 text-xs text-slate-300 hover:border-emerald-400 cursor-pointer">
                      <span className="flex items-center gap-2 truncate">
                        <Upload className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {slipFileName || 'Choose payment slip image (PNG / JPG)'}
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSlipFileChange}
                        className="hidden"
                      />
                    </label>

                    {slipDataUrl && (
                      <img
                        src={slipDataUrl}
                        alt="Uploaded payment slip preview"
                        className="max-h-32 rounded-lg border border-slate-700 object-contain"
                      />
                    )}

                    <button
                      type="button"
                      disabled={submittingSlip}
                      onClick={() => void handleUploadSlipToAdmin()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300 disabled:opacity-60 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{submittingSlip ? 'Uploading...' : 'Submit Payment Slip'}</span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  Done &amp; Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Method Selector */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-300">
                  Choose Deposit Method
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('CRYPTO');
                      setFormError(null);
                    }}
                    className={`rounded-xl border p-3.5 text-left cursor-pointer transition-colors ${
                      selectedMethod === 'CRYPTO'
                        ? 'border-emerald-500 bg-emerald-500/15'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      <DiceTokenIcon size="sm" />
                      <span>Crypto</span>
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400">
                      USDT (TRC-20 Only)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('LOCAL_BANK');
                      setFormError(null);
                    }}
                    className={`rounded-xl border p-3.5 text-left cursor-pointer transition-colors ${
                      selectedMethod === 'LOCAL_BANK'
                        ? 'border-rose-500 bg-rose-500/15'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      <Landmark className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>Local Bank Account</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Bank Transfer
                    </div>
                  </button>
                </div>
              </div>

              {selectedMethod === null && (
                <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400 text-center">
                  Select <strong className="text-slate-200">Crypto</strong> or{' '}
                  <strong className="text-slate-200">Local Bank Account</strong> above to continue.
                </div>
              )}

              {selectedMethod === 'LOCAL_BANK' && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-4 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-rose-200">
                        Your country has not valid that method
                      </div>
                      <p className="text-xs text-rose-200/80 leading-relaxed">
                        Local bank deposits are not available for your region right now. Please use Crypto (USDT TRC-20) to deposit tokens.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('CRYPTO')}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                    >
                      Use Crypto Instead
                    </button>
                  </div>
                </div>
              )}

              {selectedMethod === 'CRYPTO' && (
                <form onSubmit={handleRequestCryptoDeposit} className="space-y-4">
                  {formError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
                    >
                      {formError}
                    </div>
                  )}

                  {/* Locked USDT (TRC-20) Network Display */}
                  <div>
                    <div className="block text-xs font-medium text-slate-300 mb-1.5">
                      Crypto Network (Fixed)
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/35 bg-[#0B0F17] px-3 py-2.5 text-xs">
                      <span className="font-bold text-emerald-300">USDT · TRC-20 Network</span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Lock className="h-3 w-3 text-emerald-400" />
                        Locked
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="modal-deposit-usd"
                        className="block text-xs font-medium text-slate-300 mb-1.5"
                      >
                        Deposit Amount (USD · Min ${TokenEconomy.MIN_DEPOSIT_USD.toFixed(2)})
                      </label>
                      <input
                        id="modal-deposit-usd"
                        type="number"
                        min={TokenEconomy.MIN_DEPOSIT_USD}
                        step="any"
                        required
                        value={usdInput}
                        onChange={(e) => setUsdInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col justify-center">
                      <div className="text-[11px] text-slate-400">Token Credit Preview</div>
                      <div className="font-mono-tabular text-sm font-bold text-emerald-400">
                        {previewTokens.toLocaleString()} TKN
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        ${numericUsd.toFixed(2)} USD
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from(
                      new Set([
                        TokenEconomy.MIN_DEPOSIT_USD,
                        Math.max(TokenEconomy.MIN_DEPOSIT_USD, 5),
                        Math.max(TokenEconomy.MIN_DEPOSIT_USD, 10),
                        Math.max(TokenEconomy.MIN_DEPOSIT_USD, 50),
                        Math.max(TokenEconomy.MIN_DEPOSIT_USD, 100),
                      ])
                    )
                      .sort((a, b) => a - b)
                      .map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setUsdInput(String(amt))}
                          className={`rounded-md border px-2.5 py-1 font-mono-tabular text-xs font-semibold cursor-pointer ${
                            Number(usdInput) === amt
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                              : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-700 bg-[#0B0F17] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingDeposit}
                      className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>{submittingDeposit ? 'Submitting...' : 'Submit Deposit Request'}</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface WithdrawModalProps {
  isOpen: boolean;
  engine: BetSpotEngine;
  availableBalance: number;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  engine,
  availableBalance,
  onClose,
}) => {
  const user = engine.activeUser;

  const [selectedMethod, setSelectedMethod] = useState<'CRYPTO' | 'LOCAL_BANK' | null>(null);
  const [withdrawTokensInput, setWithdrawTokensInput] = useState<string>(() =>
    String(TokenEconomy.MIN_WITHDRAW_TOKENS)
  );

  // Crypto address field (pre-filled from saved profile payout details if available)
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState<string>('');

  // Bank account fields (pre-filled from saved profile payout details if available)
  const [bankName, setBankName] = useState<string>(SRI_LANKAN_BANKS[0]);
  const [bankBranch, setBankBranch] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<PaymentRequest | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedMethod(null);
    setWithdrawTokensInput(
      String(
        Math.max(
          TokenEconomy.MIN_WITHDRAW_TOKENS,
          Math.min(availableBalance, TokenEconomy.MIN_WITHDRAW_TOKENS)
        )
      )
    );
    setCryptoWalletAddress(user.savedCryptoAddress || '');
    setBankName(user.savedBankDetails?.bankName || SRI_LANKAN_BANKS[0]);
    setBankBranch(user.savedBankDetails?.branch || '');
    setAccountHolder(user.savedBankDetails?.accountHolder || user.displayName || '');
    setAccountNumber(user.savedBankDetails?.accountNumber || '');
    setFormError(null);
    setSubmittedRequest(null);
    setSubmittingWithdraw(false);
  }, [isOpen, availableBalance, user]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSriLanka = user.country === 'Sri Lanka';
  const numericTokens = Math.max(0, Number(withdrawTokensInput) || 0);
  const previewUsd = TokenEconomy.tokensToUsd(numericTokens);

  const handleSubmitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingWithdraw) return;
    setFormError(null);

    if (!selectedMethod) {
      setFormError('Please select a withdrawal method first.');
      return;
    }

    setSubmittingWithdraw(true);
    try {
      if (selectedMethod === 'CRYPTO') {
        const addr = cryptoWalletAddress.trim();
        if (addr.length < 8) {
          throw new Error('Please enter a valid USDT (TRC-20) wallet address.');
        }
        const rec = await engine.requestWithdrawal(numericTokens, PaymentMethod.CRYPTO_USDT, addr);
        setSubmittedRequest(rec);
      } else {
        if (!bankName.trim() || !accountHolder.trim() || !accountNumber.trim()) {
          throw new Error('Please select a Bank and enter Account Holder Name and Account Number.');
        }
        const formattedBank = [
          bankName.trim(),
          bankBranch.trim() ? `Branch: ${bankBranch.trim()}` : null,
          `Holder: ${accountHolder.trim()}`,
          `Acct: ${accountNumber.trim()}`,
        ]
          .filter(Boolean)
          .join(' · ');

        const rec = await engine.requestWithdrawal(
          numericTokens,
          PaymentMethod.SRI_LANKA_BANK,
          formattedBank
        );
        setSubmittedRequest(rec);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit withdrawal request.');
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdraw-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#131A26] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden my-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0B0F17] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/40 bg-amber-500/15 text-amber-300">
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <h2
              id="withdraw-modal-title"
              className="font-display text-sm sm:text-base font-bold text-slate-50 truncate"
            >
              {submittedRequest ? 'Withdrawal Request Submitted' : 'Request Withdrawal'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close withdrawal popup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-[#131A26] text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {submittedRequest ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">
                    Withdrawal Request Submitted
                  </div>
                  <p className="mt-0.5 text-emerald-100/80">
                    Your withdrawal of {submittedRequest.tokenAmount.toLocaleString()} TKN (${submittedRequest.usdEquivalent.toFixed(2)} USD) is queued for verification and payout.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5 space-y-2 text-xs font-mono-tabular">
                <div className="flex justify-between gap-2">
                  <span className="font-sans text-slate-400">Reference ID</span>
                  <span className="font-bold text-amber-300">{submittedRequest.referenceId}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="font-sans text-slate-400">Amount</span>
                  <span className="font-bold text-slate-100">
                    {submittedRequest.tokenAmount.toLocaleString()} TKN (${submittedRequest.usdEquivalent.toFixed(2)} USD)
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="font-sans text-slate-400">Method</span>
                  <span className="text-slate-200">
                    {submittedRequest.method === PaymentMethod.SRI_LANKA_BANK
                      ? 'Local Bank Account'
                      : 'USDT (TRC-20)'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-t border-slate-800 pt-2">
                  <span className="font-sans text-slate-400">Payout Destination</span>
                  <span className="text-slate-200 break-all">
                    {submittedRequest.destinationOrBankDetails}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="font-sans text-slate-400">Status</span>
                  <span className="font-bold text-amber-400">{submittedRequest.status}</span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  Done &amp; Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Method Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Select Withdrawal Method</span>
                  <span className="font-mono-tabular text-slate-400">
                    Available: <strong className="text-emerald-400">{availableBalance.toLocaleString()} TKN</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('CRYPTO');
                      setFormError(null);
                    }}
                    className={`rounded-xl border p-3.5 text-left cursor-pointer transition-colors ${
                      selectedMethod === 'CRYPTO'
                        ? 'border-emerald-500 bg-emerald-500/15'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      <WalletIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>Crypto Wallet</span>
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400">
                      USDT (TRC-20 Only)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('LOCAL_BANK');
                      setFormError(null);
                    }}
                    className={`rounded-xl border p-3.5 text-left cursor-pointer transition-colors ${
                      selectedMethod === 'LOCAL_BANK'
                        ? 'border-emerald-500 bg-emerald-500/15'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      <Landmark className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>Local Bank Account</span>
                    </div>
                    <div className="mt-1 text-[11px] text-amber-300">
                      Bank Transfer · Manual Verification
                    </div>
                  </button>
                </div>
              </div>

              {selectedMethod === null && (
                <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400 text-center">
                  Select <strong className="text-slate-200">Crypto Wallet</strong> or{' '}
                  <strong className="text-slate-200">Local Bank Account</strong> above to open the payout form.
                </div>
              )}

              {selectedMethod === 'LOCAL_BANK' && !isSriLanka && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-4 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-rose-200">
                        Local bank withdrawal is not available for your country
                      </div>
                      <p className="text-xs text-rose-200/80 leading-relaxed">
                        Local bank payouts are currently unavailable for your region. Please use Crypto Wallet (USDT TRC-20) to withdraw your funds.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('CRYPTO')}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                    >
                      Use Crypto Wallet Instead
                    </button>
                  </div>
                </div>
              )}

              {(selectedMethod === 'CRYPTO' || (selectedMethod === 'LOCAL_BANK' && isSriLanka)) && (
                <form onSubmit={handleSubmitWithdraw} className="space-y-3.5">
                  {formError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="modal-withdraw-tokens"
                        className="block text-xs font-medium text-slate-300 mb-1.5"
                      >
                        Withdraw Tokens (Min {TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN · ${TokenEconomy.MIN_WITHDRAW_USD.toFixed(2)})
                      </label>
                      <input
                        id="modal-withdraw-tokens"
                        type="number"
                        min={TokenEconomy.MIN_WITHDRAW_TOKENS}
                        step={1}
                        required
                        value={withdrawTokensInput}
                        onChange={(e) => setWithdrawTokensInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col justify-center">
                      <div className="text-[11px] text-slate-400">USD Payout Value</div>
                      <div className="font-mono-tabular text-sm font-bold text-emerald-400">
                        ${previewUsd.toFixed(2)} USD
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        {numericTokens.toLocaleString()} TKN
                      </div>
                    </div>
                  </div>

                  {selectedMethod === 'CRYPTO' ? (
                    <>
                      <div>
                        <div className="block text-xs font-medium text-slate-300 mb-1.5">
                          Crypto Network (Fixed)
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-emerald-500/35 bg-[#0B0F17] px-3 py-2.5 text-xs">
                          <span className="font-bold text-emerald-300">USDT · TRC-20 Network</span>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                            <Lock className="h-3 w-3 text-emerald-400" />
                            Locked
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="modal-withdraw-address"
                          className="block text-xs font-medium text-slate-300 mb-1.5"
                        >
                          Your USDT (TRC-20) Wallet Address
                        </label>
                        <input
                          id="modal-withdraw-address"
                          type="text"
                          required
                          placeholder="e.g. TX7mK9pQ2vR8nL4wZ6cB3yH5..."
                          value={cryptoWalletAddress}
                          onChange={(e) => setCryptoWalletAddress(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="modal-bank-name"
                            className="block text-xs font-medium text-slate-300 mb-1.5"
                          >
                            Select Local Bank
                          </label>
                          <select
                            id="modal-bank-name"
                            required
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                          >
                            {SRI_LANKAN_BANKS.map((bank) => (
                              <option key={bank} value={bank}>
                                {bank}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="modal-bank-branch"
                            className="block text-xs font-medium text-slate-300 mb-1.5"
                          >
                            Branch
                          </label>
                          <input
                            id="modal-bank-branch"
                            type="text"
                            placeholder="e.g. Main / City Branch"
                            value={bankBranch}
                            onChange={(e) => setBankBranch(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="modal-bank-holder"
                            className="block text-xs font-medium text-slate-300 mb-1.5"
                          >
                            Account Holder Name
                          </label>
                          <input
                            id="modal-bank-holder"
                            type="text"
                            required
                            placeholder="Full name on account"
                            value={accountHolder}
                            onChange={(e) => setAccountHolder(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="modal-bank-acct"
                            className="block text-xs font-medium text-slate-300 mb-1.5"
                          >
                            Account Number
                          </label>
                          <input
                            id="modal-bank-acct"
                            type="text"
                            required
                            placeholder="e.g. 1029 5510 2201"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono-tabular text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-700 bg-[#0B0F17] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingWithdraw}
                      className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      <span>{submittingWithdraw ? 'Submitting...' : 'Submit Withdrawal Request'}</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
