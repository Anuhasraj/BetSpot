import React, { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Eye, EyeOff, Lock, Shield, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../infrastructure/firebase/firebaseClient';
import { ensureAdminOperatorDoc } from '../infrastructure/firebase/FirestoreSyncService';
import { adminAuthClient, AdminAuthStatus } from '../services/AdminAuthClient';
import { BetSpotEngine } from '../services/BetSpotEngine';

interface AdminLoginPortalProps {
  engine: BetSpotEngine;
  onSuccess: () => void;
  onCancel?: () => void;
}

export const AdminLoginPortal: React.FC<AdminLoginPortalProps> = ({
  engine,
  onSuccess,
  onCancel,
}) => {
  const [status, setStatus] = useState<AdminAuthStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [googleSubmitting, setGoogleSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      setStatusLoading(true);
      setError(null);
      try {
        const res = await adminAuthClient.fetchStatus();
        if (!active) return;
        setStatus(res);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Admin authentication service.'
        );
      } finally {
        if (active) setStatusLoading(false);
      }
    };
    void loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const isSetupMode = Boolean(status?.needsSetup);

  const handleGoogleAdminLogin = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const session = await adminAuthClient.loginWithGoogle(idToken);
      await ensureAdminOperatorDoc(cred.user);
      engine.activateAdminSession(session);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Admin sign-in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Google sign-in popup was closed before finishing.');
      } else {
        setError(msg);
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = isSetupMode
        ? await adminAuthClient.setupInitialAdmin({
            username,
            password,
            confirmPassword,
          })
        : await adminAuthClient.login(username, password);
      setPassword('');
      setConfirmPassword('');
      engine.activateAdminSession(session);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isSetupMode
            ? 'Initial admin setup failed.'
            : 'Admin sign in failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-[#190907] p-6 text-center space-y-2">
        <Shield className="mx-auto h-6 w-6 text-amber-400 animate-pulse" />
        <p className="text-xs text-amber-100/75">Checking Admin Portal status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-[#1B0B08] p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>{isSetupMode ? 'First-Run Admin Claim' : 'Restricted Admin Portal'}</span>
          </div>
          <span className="font-mono-tabular text-[11px] text-amber-200/70">
            {status?.configuredViaEnv
              ? 'Env Verified'
              : isSetupMode
                ? 'Unclaimed'
                : 'Server Verified'}
          </span>
        </div>
        <p className="text-xs text-amber-100/75 leading-relaxed">
          {isSetupMode
            ? 'Sign in directly with the owner Google account (also unlocks Cloud Firestore Database sync) OR claim your local Admin username and password below.'
            : 'Sign in with your authorized Google Owner account to manage Firestore & Operations, or use your local Admin credentials.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {/* Primary Google Admin Sign-In (only when ADMIN_EMAIL is configured on server) */}
      {status?.googleAdminEnabled && (
        <>
          <button
            type="button"
            disabled={googleSubmitting || submitting}
            onClick={() => void handleGoogleAdminLogin()}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60 cursor-pointer transition-colors"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-slate-900">
              G
            </span>
            <span>
              {googleSubmitting
                ? 'Verifying Google Admin...'
                : 'Sign in with Google (Owner Admin)'}
            </span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-3 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Or Local Admin Credentials
            </span>
            <div className="flex-grow border-t border-slate-800" />
          </div>
        </>
      )}

      <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="admin-login-user" className="block text-xs font-medium text-slate-300 mb-1.5">
            Admin Username
          </label>
          <input
            id="admin-login-user"
            type="text"
            required
            autoComplete="username"
            placeholder={isSetupMode ? 'Choose admin username (3–32 chars)' : 'Enter admin username'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="admin-login-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
            {isSetupMode ? 'Admin Password (8+ chars)' : 'Admin Password'}
          </label>
          <div className="relative">
            <input
              id="admin-login-pass"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={isSetupMode ? 8 : undefined}
              autoComplete={isSetupMode ? 'new-password' : 'current-password'}
              placeholder={isSetupMode ? 'Create strong admin password' : 'Enter admin password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
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

        {isSetupMode && (
          <div>
            <label htmlFor="admin-login-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
              Confirm Admin Password
            </label>
            <input
              id="admin-login-confirm"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Repeat admin password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-amber-500/30 bg-[#190907] px-4 py-2.5 text-xs font-semibold text-amber-100 hover:border-amber-400/50 cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || googleSubmitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border-b-2 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-sm font-bold text-[#2A0E07] hover:from-amber-200 hover:to-amber-400 disabled:opacity-60 cursor-pointer transition-all"
          >
            <Lock className="h-4 w-4" />
            {submitting
              ? isSetupMode
                ? 'Claiming Portal...'
                : 'Verifying...'
              : isSetupMode
                ? 'Claim Admin Portal & Sign In'
                : 'Sign In with Password'}
          </button>
        </div>
      </form>
    </div>
  );
};
