import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import blueprint from '../../../firebase-blueprint.json';
import { SerializedUser } from '../../domain/User';
import { AdminServerStore, AdminServerUser } from '../../services/AdminAuthClient';
import {
  db,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  handleFirestoreError,
  OperationType,
} from './firebaseClient';

function sanitizeId(raw: string, fallback = 'doc_item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32);
  return cleaned.length >= 3 ? cleaned : `user_${cleaned}`.slice(0, 32);
}

function truncateStr(raw: unknown, maxLen: number, fallback = ''): string {
  const str = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  return (str || fallback).slice(0, maxLen);
}

function nonNegNum(val: unknown): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  return Math.max(0, n);
}

export interface BlueprintCollectionOverview {
  path: string;
  entityName: string;
  description: string;
  requiredFields: string[];
  totalFields: number;
}

export function getBlueprintSchemaOverview(): BlueprintCollectionOverview[] {
  const entities = blueprint.entities as Record<
    string,
    {
      description?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    }
  >;
  const firestoreMap = blueprint.firestore as Record<
    string,
    { schema?: { $ref?: string } | string; description?: string }
  >;

  return Object.entries(firestoreMap).map(([path, def]) => {
    const refStr = typeof def.schema === 'string' ? def.schema : def.schema?.$ref ?? '';
    const entityName = refStr.split('/').pop() || 'Entity';
    const entity = entities[entityName];
    return {
      path,
      entityName,
      description: def.description ?? entity?.description ?? '',
      requiredFields: entity?.required ?? [],
      totalFields: entity?.properties ? Object.keys(entity.properties).length : 0,
    };
  });
}

export interface FirestoreSyncReport {
  syncedAt: number;
  projectId: string;
  databaseId: string;
  counts: {
    admins: number;
    users: number;
    privateProfiles: number;
    transactions: number;
    payments: number;
    tickets: number;
    referrals: number;
    riskAlerts: number;
    auditLogs: number;
    configs: number;
    telemetry: number;
  };
}

export interface FirestoreCollectionSnapshot {
  fetchedAt: number;
  projectId: string;
  databaseId: string;
  collections: {
    admins: Record<string, unknown>[];
    users: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    tickets: Record<string, unknown>[];
    referrals: Record<string, unknown>[];
    riskAlerts: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
    platformConfig: Record<string, unknown>[];
    telemetry: Record<string, unknown>[];
  };
}

export async function ensureAdminOperatorDoc(firebaseUser: FirebaseUser): Promise<void> {
  const uid = sanitizeId(firebaseUser.uid);
  const path = `admins/${uid}`;
  const email = truncateStr(firebaseUser.email, 160);
  const username = sanitizeUsername(email.split('@')[0] || 'admin');
  const adminRef = doc(db, 'admins', uid);

  try {
    const existing = await getDoc(adminRef);
    if (!existing.exists()) {
      await setDoc(adminRef, {
        uid,
        email,
        username,
        role: 'ADMIN',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(adminRef, {
        email,
        username,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  try {
    await setDoc(doc(db, 'test', 'connection'), {
      status: 'online',
      checkedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'test/connection');
  }
}

export async function syncActivePlayerToFirestore(
  user: SerializedUser,
  firebaseUser: FirebaseUser
): Promise<void> {
  if (!firebaseUser.emailVerified) return;
  const uid = sanitizeId(firebaseUser.uid);
  const userRef = doc(db, 'users', uid);
  const privRef = doc(db, 'users', uid, 'private', 'info');

  try {
    const existingSnap = await getDoc(userRef);
    const batch = writeBatch(db);

    if (!existingSnap.exists()) {
      const createPayload: Record<string, unknown> = {
        id: uid,
        uid,
        username: sanitizeUsername(user.username || uid),
        displayName: truncateStr(user.displayName, 80, user.username || 'Player'),
        role: 'PLAYER',
        status: 'ACTIVE',
        availableBalance: nonNegNum(user.availableBalance),
        heldBalance: nonNegNum(user.heldBalance),
        kycStatus: 'UNVERIFIED',
        dailyBetLimitTokens: nonNegNum(user.dailyBetLimitTokens),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (user.avatarUrl && !user.avatarUrl.startsWith('data:')) {
        createPayload.avatarUrl = truncateStr(user.avatarUrl, 8192);
      }
      if (user.avatarFrameId) {
        createPayload.avatarFrameId = truncateStr(user.avatarFrameId, 64);
      }
      if (user.referralCode) {
        createPayload.referralCode = truncateStr(user.referralCode, 32);
      }
      batch.set(userRef, createPayload);
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName: truncateStr(user.displayName, 80, user.username || 'Player'),
        dailyBetLimitTokens: nonNegNum(user.dailyBetLimitTokens),
        updatedAt: serverTimestamp(),
      };
      if (user.avatarUrl && !user.avatarUrl.startsWith('data:')) {
        updatePayload.avatarUrl = truncateStr(user.avatarUrl, 8192);
      }
      if (user.avatarFrameId) {
        updatePayload.avatarFrameId = truncateStr(user.avatarFrameId, 64);
      }
      batch.update(userRef, updatePayload);
    }

    const privatePayload: Record<string, unknown> = {
      uid,
      email: truncateStr(user.email || firebaseUser.email, 160, `${uid}@betspot.local`),
      updatedAt: serverTimestamp(),
    };
    if (user.country) privatePayload.country = truncateStr(user.country, 80);
    if (user.phoneNumber) privatePayload.phoneNumber = truncateStr(user.phoneNumber, 40);
    if (user.dateOfBirth) privatePayload.dateOfBirth = truncateStr(user.dateOfBirth, 24);
    if (typeof user.ageVerified === 'boolean') privatePayload.ageVerified = user.ageVerified;
    if (user.kycDocumentName) privatePayload.kycDocumentName = truncateStr(user.kycDocumentName, 160);
    if (user.savedCryptoAddress) privatePayload.savedCryptoAddress = truncateStr(user.savedCryptoAddress, 128);
    if (user.savedBankDetails?.bankName) privatePayload.savedBankName = truncateStr(user.savedBankDetails.bankName, 120);
    if (user.savedBankDetails?.branch) privatePayload.savedBankBranch = truncateStr(user.savedBankDetails.branch, 120);
    if (user.savedBankDetails?.accountHolder) privatePayload.savedBankHolder = truncateStr(user.savedBankDetails.accountHolder, 120);
    if (user.savedBankDetails?.accountNumber) privatePayload.savedBankAccount = truncateStr(user.savedBankDetails.accountNumber, 64);

    batch.set(privRef, privatePayload, { merge: true });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function syncAdminStoreToFirestore(
  store: AdminServerStore,
  firebaseUser: FirebaseUser
): Promise<FirestoreSyncReport> {
  const adminUid = sanitizeId(firebaseUser.uid);
  await ensureAdminOperatorDoc(firebaseUser);

  const loadExistingMap = async (colName: string): Promise<Map<string, Record<string, unknown>>> => {
    try {
      const snap = await getDocs(query(collection(db, colName), limit(250)));
      const map = new Map<string, Record<string, unknown>>();
      for (const d of snap.docs) {
        map.set(d.id, d.data());
      }
      return map;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  };

  const [
    existingUsers,
    existingPayments,
    existingTickets,
    existingReferrals,
    existingRiskAlerts,
    existingAuditLogs,
  ] = await Promise.all([
    loadExistingMap('users'),
    loadExistingMap('payments'),
    loadExistingMap('tickets'),
    loadExistingMap('referrals'),
    loadExistingMap('riskAlerts'),
    loadExistingMap('auditLogs'),
  ]);

  const counts = {
    admins: 1,
    users: 0,
    privateProfiles: 0,
    transactions: 0,
    payments: 0,
    tickets: 0,
    referrals: 0,
    riskAlerts: 0,
    auditLogs: 0,
    configs: 0,
    telemetry: 0,
  };

  type BatchWriteOp = {
    path: string;
    ref: ReturnType<typeof doc>;
    data: Record<string, unknown>;
  };

  const operations: BatchWriteOp[] = [];
  const humanUsers = (store.users ?? []).filter((u) => !u.isBot);

  for (const u of humanUsers) {
    const userId = sanitizeId(u.id);
    const uid = sanitizeId(u.id);
    const existingUser = existingUsers.get(userId);
    const role = u.role === 'HIGH_ROLLER' ? 'HIGH_ROLLER' : 'PLAYER';
    const status = u.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const kycStatus =
      u.kycStatus === 'PENDING' || u.kycStatus === 'VERIFIED' ? u.kycStatus : 'UNVERIFIED';

    const uExtra = u as AdminServerUser & { avatarUrl?: string; avatarFrameId?: string };
    const userPayload: Record<string, unknown> = {
      id: userId,
      uid,
      username: sanitizeUsername(u.username || userId),
      displayName: truncateStr(u.displayName, 80, u.username || 'Player'),
      role,
      status,
      availableBalance: nonNegNum(u.availableBalance),
      heldBalance: nonNegNum(u.heldBalance),
      kycStatus,
      dailyBetLimitTokens: nonNegNum(u.dailyBetLimitTokens),
      promoTokensRemaining: nonNegNum(u.promoTokensRemaining),
      realDepositedTokens: nonNegNum(u.realDepositedTokens),
      createdAt: existingUser?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (uExtra.avatarUrl && !uExtra.avatarUrl.startsWith('data:')) {
      userPayload.avatarUrl = truncateStr(uExtra.avatarUrl, 8192);
    }
    if (uExtra.avatarFrameId) {
      userPayload.avatarFrameId = truncateStr(uExtra.avatarFrameId, 64);
    }
    if (u.referralCode) {
      userPayload.referralCode = truncateStr(u.referralCode, 32);
    }

    operations.push({
      path: `users/${userId}`,
      ref: doc(db, 'users', userId),
      data: userPayload,
    });
    counts.users += 1;

    // Strictly isolated PII sub-document
    const privatePayload: Record<string, unknown> = {
      uid: userId,
      email: truncateStr(u.email, 160, `${userId}@betspot.local`),
      updatedAt: serverTimestamp(),
    };
    if (u.country) privatePayload.country = truncateStr(u.country, 80);
    if (u.phoneNumber) privatePayload.phoneNumber = truncateStr(u.phoneNumber, 40);
    if (u.dateOfBirth) privatePayload.dateOfBirth = truncateStr(u.dateOfBirth, 24);
    if (typeof u.ageVerified === 'boolean') privatePayload.ageVerified = u.ageVerified;
    if (u.kycDocumentName) privatePayload.kycDocumentName = truncateStr(u.kycDocumentName, 160);
    if (u.savedCryptoAddress) privatePayload.savedCryptoAddress = truncateStr(u.savedCryptoAddress, 128);
    if (u.savedBankDetails?.bankName) privatePayload.savedBankName = truncateStr(u.savedBankDetails.bankName, 120);
    if (u.savedBankDetails?.branch) privatePayload.savedBankBranch = truncateStr(u.savedBankDetails.branch, 120);
    if (u.savedBankDetails?.accountHolder) privatePayload.savedBankHolder = truncateStr(u.savedBankDetails.accountHolder, 120);
    if (u.savedBankDetails?.accountNumber) privatePayload.savedBankAccount = truncateStr(u.savedBankDetails.accountNumber, 64);

    operations.push({
      path: `users/${userId}/private/info`,
      ref: doc(db, 'users', userId, 'private', 'info'),
      data: privatePayload,
    });
    counts.privateProfiles += 1;

    let existingTxIds = new Set<string>();
    try {
      const txSnap = await getDocs(query(collection(db, 'users', userId, 'transactions'), limit(100)));
      existingTxIds = new Set(txSnap.docs.map((d) => d.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/transactions`);
    }

    for (const tx of (u.transactions ?? []).slice(0, 15)) {
      const txId = sanitizeId(tx.id);
      if (existingTxIds.has(txId)) {
        counts.transactions += 1;
        continue;
      }
      const txPayload: Record<string, unknown> = {
        id: txId,
        userId,
        type: truncateStr(tx.type, 48, 'LEDGER'),
        amount: typeof tx.amount === 'number' && Number.isFinite(tx.amount) ? tx.amount : 0,
        balanceAfter: nonNegNum(tx.balanceAfter),
        heldAfter: nonNegNum(tx.heldAfter),
        description: truncateStr(tx.description, 240, 'Wallet transaction'),
        createdAt: serverTimestamp(),
      };
      if (tx.referenceId) {
        txPayload.referenceId = truncateStr(tx.referenceId, 128);
      }
      operations.push({
        path: `users/${userId}/transactions/${txId}`,
        ref: doc(db, 'users', userId, 'transactions', txId),
        data: txPayload,
      });
      counts.transactions += 1;
    }
  }

  for (const p of (store.payments ?? []).slice(0, 100)) {
    const paymentId = sanitizeId(p.id);
    const userId = sanitizeId(p.userId);
    const existingPayment = existingPayments.get(paymentId);
    const paymentPayload: Record<string, unknown> = {
      id: paymentId,
      userId,
      username: sanitizeUsername(p.username || userId),
      kind: p.kind === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'DEPOSIT',
      method: truncateStr(p.method, 48, 'CRYPTO'),
      tokenAmount: Math.max(1, nonNegNum(p.tokenAmount)),
      usdEquivalent: nonNegNum(p.usdEquivalent),
      localCurrencyEquivalent: nonNegNum(p.localCurrencyEquivalent),
      referenceId: truncateStr(p.referenceId, 128, paymentId),
      status:
        p.status === 'APPROVED' || p.status === 'REJECTED' ? p.status : 'PENDING',
      createdAt: existingPayment?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (p.destinationOrBankDetails) {
      paymentPayload.destinationOrBankDetails = truncateStr(p.destinationOrBankDetails, 300);
    }
    if (p.receiptPreviewName) {
      paymentPayload.receiptPreviewName = truncateStr(p.receiptPreviewName, 160);
    }
    if (p.adminNote) {
      paymentPayload.adminNote = truncateStr(p.adminNote, 300);
    }

    operations.push({
      path: `payments/${paymentId}`,
      ref: doc(db, 'payments', paymentId),
      data: paymentPayload,
    });
    counts.payments += 1;
  }

  for (const t of (store.tickets ?? []).slice(0, 80)) {
    const ticketId = sanitizeId(t.id);
    const existingTicket = existingTickets.get(ticketId);
    const matchedUser = humanUsers.find(
      (u) => u.email.toLowerCase() === (t.email || '').toLowerCase()
    );
    const ticketPayload: Record<string, unknown> = {
      id: ticketId,
      userId:
        typeof existingTicket?.userId === 'string'
          ? existingTicket.userId
          : sanitizeId(matchedUser?.id || adminUid),
      name: truncateStr(t.name, 80, 'Player').padEnd(2, '_'),
      email: truncateStr(t.email, 160, 'support@betspot.local'),
      category: truncateStr(t.category, 64, 'General'),
      subject: truncateStr(t.subject, 160, 'Support Request').padEnd(3, '_'),
      message: truncateStr(t.message, 2000, 'Support details').padEnd(5, '.'),
      status:
        t.status === 'In Progress' || t.status === 'Resolved'
          ? t.status
          : 'Open · Under Review',
      createdAt: existingTicket?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (t.referenceId) ticketPayload.referenceId = truncateStr(t.referenceId, 128);
    if (t.adminReply) ticketPayload.adminReply = truncateStr(t.adminReply, 1000);

    operations.push({
      path: `tickets/${ticketId}`,
      ref: doc(db, 'tickets', ticketId),
      data: ticketPayload,
    });
    counts.tickets += 1;
  }

  for (const r of (store.referrals ?? []).slice(0, 100)) {
    const referralId = sanitizeId(r.id);
    const existingRef = existingReferrals.get(referralId);
    if (existingRef && existingRef.status === 'REWARDED') {
      counts.referrals += 1;
      continue;
    }
    operations.push({
      path: `referrals/${referralId}`,
      ref: doc(db, 'referrals', referralId),
      data: {
        id: referralId,
        referrerUserId:
          typeof existingRef?.referrerUserId === 'string'
            ? existingRef.referrerUserId
            : sanitizeId(r.referrerUserId),
        referrerUsername:
          typeof existingRef?.referrerUsername === 'string'
            ? existingRef.referrerUsername
            : sanitizeUsername(r.referrerUsername),
        referrerCode:
          typeof existingRef?.referrerCode === 'string'
            ? existingRef.referrerCode
            : truncateStr(r.referrerCode, 32, 'REF'),
        refereeUserId:
          typeof existingRef?.refereeUserId === 'string'
            ? existingRef.refereeUserId
            : sanitizeId(r.refereeUserId),
        refereeUsername:
          typeof existingRef?.refereeUsername === 'string'
            ? existingRef.refereeUsername
            : sanitizeUsername(r.refereeUsername),
        status: r.status === 'REWARDED' ? 'REWARDED' : 'PENDING_DEPOSIT',
        qualifyingDepositTokens: nonNegNum(r.qualifyingDepositTokens),
        referrerRewardTokens: nonNegNum(r.referrerRewardTokens),
        refereeRewardTokens: nonNegNum(r.refereeRewardTokens),
        createdAt: existingRef?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
    counts.referrals += 1;
  }

  for (const a of (store.riskAlerts ?? []).slice(0, 60)) {
    const alertId = sanitizeId(a.id);
    const existingAlert = existingRiskAlerts.get(alertId);
    const alertPayload: Record<string, unknown> = {
      id: alertId,
      type: truncateStr(a.type, 64, 'RISK_EVENT'),
      severity:
        a.severity === 'CRITICAL' || a.severity === 'WARNING' ? a.severity : 'INFO',
      title: truncateStr(a.title, 160, 'Risk Alert'),
      details: truncateStr(a.details, 1000, 'Alert recorded'),
      acknowledged: Boolean(a.acknowledged),
      createdAt: existingAlert?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (a.userId) alertPayload.userId = truncateStr(a.userId, 128);
    if (a.username) alertPayload.username = truncateStr(a.username, 64);
    if (a.acknowledgedBy) alertPayload.acknowledgedBy = truncateStr(a.acknowledgedBy, 160);

    operations.push({
      path: `riskAlerts/${alertId}`,
      ref: doc(db, 'riskAlerts', alertId),
      data: alertPayload,
    });
    counts.riskAlerts += 1;
  }

  for (const log of (store.auditLogs ?? []).slice(0, 60)) {
    const logId = sanitizeId(log.id);
    if (existingAuditLogs.has(logId)) {
      counts.auditLogs += 1;
      continue;
    }
    operations.push({
      path: `auditLogs/${logId}`,
      ref: doc(db, 'auditLogs', logId),
      data: {
        id: logId,
        adminUid,
        adminEmail: truncateStr(firebaseUser.email || log.adminUsername, 160, 'admin'),
        action: truncateStr(log.action, 64, 'ACTION'),
        target: truncateStr(log.target, 160, 'platform'),
        details: truncateStr(log.details, 500, 'Audit log'),
        createdAt: serverTimestamp(),
      },
    });
    counts.auditLogs += 1;
  }

  const configDocs: Array<{ id: 'economy' | 'bot' | 'promo' | 'summary'; payload: unknown }> = [
    { id: 'economy', payload: store.economyConfig ?? {} },
    { id: 'bot', payload: store.botConfig ?? {} },
    { id: 'promo', payload: store.promoConfig ?? {} },
    {
      id: 'summary',
      payload: {
        incomeSummary: store.incomeSummary ?? {},
        botSummary: store.botSummary ?? {},
        promoSummary: store.promoSummary ?? {},
        syncedUsersCount: humanUsers.length,
      },
    },
  ];
  for (const cfg of configDocs) {
    operations.push({
      path: `platformConfig/${cfg.id}`,
      ref: doc(db, 'platformConfig', cfg.id),
      data: {
        id: cfg.id,
        updatedByUid: adminUid,
        configJson: truncateStr(JSON.stringify(cfg.payload), 65536, '{}'),
        updatedAt: serverTimestamp(),
      },
    });
    counts.configs += 1;
  }

  const telemetryJson = truncateStr(
    JSON.stringify({
      boardCount: store.telemetry?.diceBoards?.length ?? 0,
      sportsCount: store.telemetry?.sportsEvents?.length ?? 0,
      updatedAt: store.telemetry?.updatedAt ?? Date.now(),
      boards: (store.telemetry?.diceBoards ?? []).map((b) => ({
        id: (b as { id?: string }).id,
        tableLabel: (b as { tableLabel?: string }).tableLabel,
        phase: (b as { phase?: string }).phase,
        occupiedCount: (b as { occupiedCount?: number }).occupiedCount,
        lockedPot: (b as { lockedPot?: number }).lockedPot,
      })),
    }),
    100000,
    '{}'
  );

  operations.push({
    path: 'telemetry/live',
    ref: doc(db, 'telemetry', 'live'),
    data: {
      id: 'live',
      updatedByUid: adminUid,
      summaryJson: telemetryJson,
      updatedAt: serverTimestamp(),
    },
  });
  counts.telemetry = 1;

  for (let i = 0; i < operations.length; i += 400) {
    const chunk = operations.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, chunk[0]?.path ?? 'batch');
    }
  }

  return {
    syncedAt: Date.now(),
    projectId: FIREBASE_PROJECT_ID,
    databaseId: FIRESTORE_DATABASE_ID,
    counts,
  };
}

export async function fetchFirestoreCollectionsOverview(): Promise<FirestoreCollectionSnapshot> {
  const safeGetList = async (colName: string, maxItems = 25): Promise<Record<string, unknown>[]> => {
    try {
      const snap = await getDocs(query(collection(db, colName), limit(maxItems)));
      return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  };

  const [
    admins,
    users,
    payments,
    tickets,
    referrals,
    riskAlerts,
    auditLogs,
    platformConfig,
    telemetry,
  ] = await Promise.all([
    safeGetList('admins', 10),
    safeGetList('users', 25),
    safeGetList('payments', 25),
    safeGetList('tickets', 25),
    safeGetList('referrals', 25),
    safeGetList('riskAlerts', 25),
    safeGetList('auditLogs', 25),
    safeGetList('platformConfig', 10),
    safeGetList('telemetry', 10),
  ]);

  return {
    fetchedAt: Date.now(),
    projectId: FIREBASE_PROJECT_ID,
    databaseId: FIRESTORE_DATABASE_ID,
    collections: {
      admins,
      users,
      payments,
      tickets,
      referrals,
      riskAlerts,
      auditLogs,
      platformConfig,
      telemetry,
    },
  };
}

export async function fetchPlayerOwnFirestoreWallet(uid: string): Promise<Record<string, unknown>[]> {
  const cleanUid = sanitizeId(uid);
  try {
    const snap = await getDocs(
      query(collection(db, 'payments'), where('userId', '==', cleanUid), limit(20))
    );
    return snap.docs.map((d) => d.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'payments');
  }
}

export const firestoreSyncService = {
  ensureBootstrappedAdminOperator: ensureAdminOperatorDoc,
  syncActivePlayerToFirestore,
  syncAdminStoreToFirestore,
  fetchFirestoreCollectionsOverview,
  fetchPlayerOwnFirestoreWallet,
};
