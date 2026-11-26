import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import {
  CheckCircle2,
  CloudUpload,
  Database,
  FileCode2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import {
  auth,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  FirestoreConnectionResult,
  googleProvider,
  testConnection,
} from '../infrastructure/firebase/firebaseClient';
import {
  ensureAdminOperatorDoc,
  fetchFirestoreCollectionsOverview,
  FirestoreCollectionSnapshot,
  FirestoreSyncReport,
  getBlueprintSchemaOverview,
  syncAdminStoreToFirestore,
} from '../infrastructure/firebase/FirestoreSyncService';
import type { AdminServerStore } from '../services/AdminAuthClient';

interface AdminDatabaseTabProps {
  serverStore: AdminServerStore | null;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type ManagedCollectionKey = keyof FirestoreCollectionSnapshot['collections'];

const COLLECTION_TABS: ManagedCollectionKey[] = [
  'users',
  'payments',
  'tickets',
  'referrals',
  'riskAlerts',
  'auditLogs',
  'platformConfig',
  'telemetry',
  'admins',
];

function formatFirestoreValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (val as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      return String(val);
    }
  }
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return str.length > 140 ? `${str.slice(0, 140)}…` : str;
  }
  const str = String(val);
  return str.length > 140 ? `${str.slice(0, 140)}…` : str;
}

export const AdminDatabaseTab: React.FC<AdminDatabaseTabProps> = ({
  serverStore,
  onError,
  onSuccess,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [connStatus, setConnStatus] = useState<FirestoreConnectionResult | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncReport, setSyncReport] = useState<FirestoreSyncReport | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState<boolean>(false);

  const [selectedCollection, setSelectedCollection] = useState<ManagedCollectionKey>('users');
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<FirestoreCollectionSnapshot | null>(null);

  const schemaOverview = getBlueprintSchemaOverview();
  const [isAdminGoogleUser, setIsAdminGoogleUser] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (!u || !u.emailVerified) {
        setIsAdminGoogleUser(false);
      }
    });
    void testConnection().then(setConnStatus);
    return () => unsub();
  }, []);

  const loadSnapshot = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || !current.emailVerified) {
      setSnapshot(null);
      setIsAdminGoogleUser(false);
      return;
    }
    setLoadingDocs(true);
    try {
      const next = await fetchFirestoreCollectionsOverview();
      setSnapshot(next);
      setIsAdminGoogleUser(true);
    } catch (err) {
      setIsAdminGoogleUser(false);
      onError(
        err instanceof Error
          ? err.message
          : 'Unable to inspect Cloud Firestore collections.'
      );
    } finally {
      setLoadingDocs(false);
    }
  }, [onError]);

  useEffect(() => {
    if (firebaseUser?.emailVerified) {
      void loadSnapshot();
    } else {
      setSnapshot(null);
      setIsAdminGoogleUser(false);
    }
  }, [firebaseUser, loadSnapshot]);

  const handleConnectAdminGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user.emailVerified) {
        onError('Google account email must be verified for Firestore admin access.');
        return;
      }
      await ensureAdminOperatorDoc(cred.user);
      const conn = await testConnection();
      setConnStatus(conn);
      setIsAdminGoogleUser(true);
      onSuccess(`Connected Google Admin (${cred.user.email}) to Cloud Firestore.`);
      await loadSnapshot();
    } catch (err) {
      setIsAdminGoogleUser(false);
      onError(err instanceof Error ? err.message : 'Google Admin sign-in failed.');
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleSyncAllToFirestore = async () => {
    const current = auth.currentUser;
    if (!current || !current.emailVerified || !isAdminGoogleUser) {
      onError('Sign in with an authorized Google Admin account first to write to Firestore.');
      return;
    }
    if (!serverStore) {
      onError('Backend platform snapshot is still loading.');
      return;
    }
    setSyncing(true);
    try {
      const report = await syncAdminStoreToFirestore(serverStore, current);
      setSyncReport(report);
      const conn = await testConnection();
      setConnStatus(conn);
      onSuccess(
        `Synced ${report.counts.users} users, ${report.counts.payments} payments, ${report.counts.tickets} tickets, and ${report.counts.configs} config docs to Cloud Firestore.`
      );
      await loadSnapshot();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Firestore sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const activeRows = snapshot ? snapshot.collections[selectedCollection] : [];
  const columnKeys = activeRows.length > 0 ? Object.keys(activeRows[0]).slice(0, 7) : [];

  return (
    <div className="space-y-6">
      {/* Connection & Provisioning Card */}
      <div className="rounded-2xl border border-amber-500/25 bg-[#1B0B08]/95 p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-amber-50">
                Cloud Firestore Database & Schema Manager
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Normalized PII-isolated schema synced with hardened Firestore security rules.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-mono text-slate-300">
              <span className="rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                Project: <strong className="text-amber-300">{FIREBASE_PROJECT_ID}</strong>
              </span>
              <span className="rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                Database ID: <strong className="text-emerald-300">{FIRESTORE_DATABASE_ID}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                {connStatus?.ok ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Firestore Reachable</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-amber-200">
                      {connStatus?.offline ? 'Offline / Check Config' : 'Awaiting Admin Auth'}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isAdminGoogleUser ? (
              <button
                type="button"
                disabled={connectingGoogle}
                onClick={handleConnectAdminGoogle}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-xs font-bold text-[#1A0906] shadow-md hover:brightness-105 disabled:opacity-60 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                {connectingGoogle
                  ? 'Connecting...'
                  : 'Unlock with Google (Owner Admin)'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={loadingDocs}
                  onClick={() => void loadSnapshot()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingDocs ? 'animate-spin' : ''}`} />
                  Refresh Collections
                </button>
                <button
                  type="button"
                  disabled={syncing || !serverStore}
                  onClick={handleSyncAllToFirestore}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  <CloudUpload className="h-4 w-4" />
                  {syncing ? 'Syncing to Firestore...' : 'Sync All Platform Data to Firestore'}
                </button>
              </>
            )}
          </div>
        </div>

        {firebaseUser && !isAdminGoogleUser && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
            Currently authenticated in Firebase as <strong>{firebaseUser.email || firebaseUser.uid}</strong>.
            Sign in with an authorized Google Admin account to inspect and manage Cloud Firestore collections.
          </div>
        )}

        {syncReport && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs sm:grid-cols-5">
            <div>
              <span className="text-slate-400">Users Synced:</span>{' '}
              <strong className="text-emerald-300">{syncReport.counts.users}</strong>
            </div>
            <div>
              <span className="text-slate-400">Private PII Docs:</span>{' '}
              <strong className="text-emerald-300">{syncReport.counts.privateProfiles}</strong>
            </div>
            <div>
              <span className="text-slate-400">Transactions:</span>{' '}
              <strong className="text-emerald-300">{syncReport.counts.transactions}</strong>
            </div>
            <div>
              <span className="text-slate-400">Payments / Tickets:</span>{' '}
              <strong className="text-emerald-300">
                {syncReport.counts.payments} / {syncReport.counts.tickets}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Configs & Logs:</span>{' '}
              <strong className="text-emerald-300">
                {syncReport.counts.configs + syncReport.counts.auditLogs}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Live Collection Explorer */}
      <div className="rounded-2xl border border-slate-800 bg-[#120705] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-bold text-slate-100">Live Firestore Collections Explorer</h4>
          </div>
          {snapshot && (
            <span className="text-[11px] text-slate-400">
              Last fetched: {new Date(snapshot.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {COLLECTION_TABS.map((colKey) => {
            const count = snapshot ? snapshot.collections[colKey].length : 0;
            const active = selectedCollection === colKey;
            return (
              <button
                key={colKey}
                type="button"
                onClick={() => setSelectedCollection(colKey)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {colKey} {snapshot ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {!isAdminGoogleUser ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
            Click <strong>Unlock with Google (Owner Admin)</strong> above to browse live Cloud Firestore documents.
          </div>
        ) : loadingDocs && !snapshot ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Loading Firestore collection documents...
          </div>
        ) : activeRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
            No documents found in <code>{selectedCollection}</code> yet. Click{' '}
            <strong>Sync All Platform Data to Firestore</strong> to populate this collection.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  {columnKeys.map((key) => (
                    <th key={key} className="px-3 py-2.5 font-semibold">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-950/60 text-slate-300">
                {activeRows.map((row, idx) => (
                  <tr key={String(row._docId ?? idx)} className="hover:bg-slate-900/50">
                    {columnKeys.map((key) => (
                      <td key={key} className="max-w-[260px] truncate px-3 py-2 font-mono text-[11px]">
                        {formatFirestoreValue(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schema Blueprint Directory */}
      <div className="rounded-2xl border border-slate-800 bg-[#120705] p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-slate-100">
            Organized Firestore Schema Blueprint ({schemaOverview.length} Collection Paths)
          </h4>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
            <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Path Pattern</th>
                <th className="px-3 py-2.5 font-semibold">Entity</th>
                <th className="px-3 py-2.5 font-semibold">Required Fields</th>
                <th className="px-3 py-2.5 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 bg-slate-950/60 text-slate-300">
              {schemaOverview.map((item) => (
                <tr key={item.path} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-mono text-[11px] text-amber-300">{item.path}</td>
                  <td className="px-3 py-2 font-semibold text-emerald-300">{item.entityName}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                    {item.requiredFields.slice(0, 6).join(', ')}
                    {item.requiredFields.length > 6 ? ` (+${item.requiredFields.length - 6})` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
