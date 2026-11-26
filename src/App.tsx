import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, Shield } from 'lucide-react';
import { AuthPage } from './components/AuthPage';
import { BetSpotBrand } from './components/BetSpotBrand';
import { LiveRoomInviteOverlay } from './components/LiveRoomInviteOverlay';
import { AppSection, TopNav } from './components/TopNav';
import { TopUpPromptData, TopUpRequiredModal } from './components/TopUpRequiredModal';
import { WorkspaceBar } from './components/WorkspaceBar';

const AccountPage = lazy(() => import('./components/AccountPage').then((m) => ({ default: m.AccountPage })));
const AdminLoginPortal = lazy(() => import('./components/AdminLoginPortal').then((m) => ({ default: m.AdminLoginPortal })));
const AdminPanelPage = lazy(() => import('./components/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })));
const DiceArenaPage = lazy(() => import('./components/DiceArenaPage').then((m) => ({ default: m.DiceArenaPage })));
const RulesGuidePage = lazy(() => import('./components/RulesGuidePage').then((m) => ({ default: m.RulesGuidePage })));
const SportsPage = lazy(() => import('./components/SportsPage').then((m) => ({ default: m.SportsPage })));
const WalletPage = lazy(() => import('./components/WalletPage').then((m) => ({ default: m.WalletPage })));
import { RoomInvite } from './domain/RoomInviteTypes';
import { useBetSpotEngine } from './hooks/useBetSpotEngine';
import { soundFx } from './services/SoundFxService';

function isDedicatedAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.toLowerCase();
  const h = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    p === '/admin' ||
    p.startsWith('/admin/') ||
    h === '#/admin' ||
    h.startsWith('#/admin/') ||
    params.get('portal') === 'ops'
  );
}

export default function App() {
  const engine = useBetSpotEngine();
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => isDedicatedAdminPath());
  const [activeSection, setActiveSection] = useState<AppSection>('dice');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [topUpPrompt, setTopUpPrompt] = useState<TopUpPromptData | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(soundFx.isMuted());
  const [loginFocusNonce, setLoginFocusNonce] = useState<number>(0);
  const [selectedInvite, setSelectedInvite] = useState<RoomInvite | null>(null);
  const [directEntryBoardRequest, setDirectEntryBoardRequest] = useState<{
    boardId: string;
    nonce: number;
  } | null>(null);
  const footerTapTimestampsRef = useRef<number[]>([]);

  const navigateAdminMode = useCallback(
    (open: boolean) => {
      if (typeof window !== 'undefined') {
        const targetPath = open ? '/admin' : '/';
        if (window.location.pathname !== targetPath || window.location.hash || window.location.search) {
          window.history.pushState(null, '', targetPath);
        }
      }
      if (open && engine.hasPlayerSession) {
        void engine.syncActivePlayerWithServer();
      }
      setIsAdminRoute(open);
    },
    [engine]
  );

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminRoute(isDedicatedAdminPath());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Invisible keyboard shortcut for operator access inside preview frames: Ctrl/Cmd+Shift+A or Alt+Shift+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        navigateAdminMode(!isAdminRoute);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdminRoute, navigateAdminMode]);

  useEffect(() => {
    if (!engine.lastToast) return;
    const timer = window.setTimeout(() => {
      engine.clearToast();
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [engine.lastToast?.id]);

  useEffect(() => {
    if (!errorBanner) return;
    const timer = window.setTimeout(() => {
      setErrorBanner(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [errorBanner]);

  // Periodically sync active player account with server so Admin approvals & top-ups reflect automatically
  useEffect(() => {
    if (isAdminRoute || !engine.hasPlayerSession) return;
    void engine.syncActivePlayerWithServer();
    const timer = window.setInterval(() => {
      void engine.syncActivePlayerWithServer();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [isAdminRoute, engine, engine.hasPlayerSession, engine.activeUserId]);

  const handleToggleMute = () => {
    setIsMuted(soundFx.toggleMute());
  };

  const handleFooterBrandActivation = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.shiftKey || e.altKey) {
      footerTapTimestampsRef.current = [];
      navigateAdminMode(true);
      return;
    }
    const now = Date.now();
    const recent = footerTapTimestampsRef.current.filter((t) => now - t < 2500);
    recent.push(now);
    footerTapTimestampsRef.current = recent;
    if (recent.length >= 5) {
      footerTapTimestampsRef.current = [];
      navigateAdminMode(true);
    }
  };

  // Dedicated, completely isolated Admin Operations Console at /admin
  if (isAdminRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
        <header className="sticky top-0 z-40 border-b border-amber-500/25 bg-[#0E1420]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <BetSpotBrand size="md" />
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Shield className="h-3.5 w-3.5" />
                Operations Console
              </span>
            </div>

            <div className="flex items-center gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => navigateAdminMode(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#131A26] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Player App
              </button>

              {engine.isAdmin && (
                <>
                  <span className="hidden sm:inline font-mono-tabular text-slate-300">
                    @{engine.adminSession?.username}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void engine.logoutAdminSession();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Lock
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {(errorBanner || engine.lastToast) && (
          <div className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)]">
            {errorBanner ? (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/60 bg-[#240A0D] px-4 py-3 text-xs text-rose-100 shadow-[0_14px_36px_rgba(0,0,0,0.85)]"
              >
                <span className="leading-relaxed font-medium">{errorBanner}</span>
                <button
                  type="button"
                  onClick={() => setErrorBanner(null)}
                  className="text-rose-300 hover:text-rose-100 cursor-pointer font-bold shrink-0"
                >
                  Dismiss
                </button>
              </div>
            ) : engine.lastToast ? (
              <div
                role="status"
                className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs shadow-[0_14px_36px_rgba(0,0,0,0.85)] ${
                  engine.lastToast.kind === 'success'
                    ? 'border-emerald-400/60 bg-[#0B2318] text-emerald-100'
                    : 'border-amber-400/50 bg-[#2A110B] text-amber-100'
                }`}
              >
                <span className="leading-relaxed font-medium">{engine.lastToast.message}</span>
                <button
                  type="button"
                  onClick={() => engine.clearToast()}
                  className="text-amber-300 hover:text-amber-100 cursor-pointer font-bold shrink-0"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        )}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Suspense
            fallback={
              <div className="flex min-h-[260px] items-center justify-center text-xs font-semibold text-slate-400">
                Loading Operations Console...
              </div>
            }
          >
            {!engine.isAdmin ? (
              <div className="mx-auto max-w-md pt-6">
                <div className="rounded-2xl border border-amber-500/30 bg-[#131A26] p-6 sm:p-7 shadow-2xl space-y-4">
                  <div>
                    <h1 className="font-display text-xl font-bold text-slate-50">
                      BetSpot Operations Sign In
                    </h1>
                    <p className="mt-1 text-xs text-slate-400">
                      Isolated administrative access. Player accounts cannot sign in here.
                    </p>
                  </div>
                  <AdminLoginPortal engine={engine} onSuccess={() => {}} />
                </div>
              </div>
            ) : (
              <AdminPanelPage engine={engine} onError={(msg) => setErrorBanner(msg)} />
            )}
          </Suspense>
        </main>

        <footer className="border-t border-slate-800/80 bg-[#0B0F17] py-4 text-center text-xs text-slate-500">
          BetSpot Operations Console · Isolated Administrative Environment
        </footer>
      </div>
    );
  }

  // Strictly Player-Facing Application (Zero Admin UI, Links, or Mentions)
  const currentUser = engine.currentUser;

  return (
    <div className="min-h-screen flex flex-col text-amber-50">
      <TopNav
        activeSection={activeSection}
        onNavigate={(section) => {
          if (!engine.hasPlayerSession) return;
          setActiveSection(section);
        }}
        onLoginClick={() => setLoginFocusNonce((n) => n + 1)}
        isAuthenticated={engine.hasPlayerSession}
        availableBalance={currentUser?.wallet.availableBalance ?? 0}
      />

      {engine.hasPlayerSession && (
        <WorkspaceBar
          currentUser={currentUser}
          onOpenAccount={() => setActiveSection('account')}
          onLogoutPlayer={() => {
            void engine.logoutAccount();
            setActiveSection('dice');
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          activeInvites={engine.activeRoomInvites}
          invitePrefs={engine.invitePreferences}
          onUpdateInvitePrefs={(updates) => engine.updateInvitePreferences(updates)}
          onSelectInvite={(inv) => setSelectedInvite(inv)}
        />
      )}

      {/* Floating Toast & Error Notification */}
      {(errorBanner || engine.lastToast) && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)]">
          {errorBanner ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/60 bg-[#240A0D] px-4 py-3 text-xs text-rose-100 shadow-[0_14px_36px_rgba(0,0,0,0.85)]"
            >
              <span className="leading-relaxed font-medium">{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-rose-300 hover:text-rose-100 cursor-pointer font-bold shrink-0"
              >
                Dismiss
              </button>
            </div>
          ) : engine.lastToast ? (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs shadow-[0_14px_36px_rgba(0,0,0,0.85)] ${
                engine.lastToast.kind === 'success'
                  ? 'border-emerald-400/60 bg-[#0B2318] text-emerald-100'
                  : 'border-amber-400/50 bg-[#2A110B] text-amber-100'
              }`}
            >
              <span className="leading-relaxed font-medium">{engine.lastToast.message}</span>
              <button
                type="button"
                onClick={() => engine.clearToast()}
                className="text-amber-300 hover:text-amber-100 cursor-pointer font-bold shrink-0"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      )}

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-2 py-3 sm:px-6 sm:py-6">
        {!engine.hasPlayerSession ? (
          <AuthPage engine={engine} loginFocusNonce={loginFocusNonce} />
        ) : (
          <Suspense
            fallback={
              <div className="flex min-h-[280px] items-center justify-center text-xs font-semibold text-amber-200/75">
                Loading BetSpot Arena...
              </div>
            }
          >
            {currentUser && activeSection === 'dice' && (
              <DiceArenaPage
                engine={engine}
                onError={(msg) => setErrorBanner(msg)}
                onInsufficientBalance={(prompt) => setTopUpPrompt(prompt)}
                directEntryBoardRequest={directEntryBoardRequest}
              />
            )}
            {currentUser && activeSection === 'sports' && (
              <SportsPage onBackToDice={() => setActiveSection('dice')} />
            )}
            {activeSection === 'rules' && (
              <RulesGuidePage
                engine={engine}
                currentUser={
                  currentUser
                    ? {
                        username: currentUser.username,
                        displayName: currentUser.displayName,
                        email: currentUser.email,
                      }
                    : undefined
                }
                onPlayDice={() => setActiveSection('dice')}
                onOpenWallet={() => setActiveSection('wallet')}
              />
            )}
            {currentUser && activeSection === 'wallet' && (
              <WalletPage engine={engine} onError={(msg) => setErrorBanner(msg)} />
            )}
            {currentUser && activeSection === 'account' && (
              <AccountPage
                engine={engine}
                onNavigateWallet={() => setActiveSection('wallet')}
                onError={(msg) => setErrorBanner(msg)}
              />
            )}
          </Suspense>
        )}
      </main>

      {engine.hasPlayerSession && (
        <LiveRoomInviteOverlay
          engine={engine}
          selectedInvite={selectedInvite}
          onSelectInvite={(inv) => setSelectedInvite(inv)}
          onEnterRoom={(boardId) => {
            setActiveSection('dice');
            setDirectEntryBoardRequest({ boardId, nonce: Date.now() });
          }}
          onError={(msg) => setErrorBanner(msg)}
          onInsufficientBalance={(prompt) => setTopUpPrompt(prompt)}
        />
      )}

      <TopUpRequiredModal
        prompt={topUpPrompt}
        onClose={() => setTopUpPrompt(null)}
        onGoToWallet={() => {
          setTopUpPrompt(null);
          setActiveSection('wallet');
        }}
      />

      <footer className="border-t border-amber-500/15 bg-[#160705] py-5">
        <div className="mx-auto flex max-w-[1360px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-amber-200/60 sm:px-6">
          <span onClick={handleFooterBrandActivation} className="select-none">
            <BetSpotBrand size="sm" />
          </span>
          <span className="select-none">
            &copy; 2026 BetSpot. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
