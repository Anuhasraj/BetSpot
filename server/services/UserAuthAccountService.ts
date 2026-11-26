import crypto from 'crypto';
import { KycStatus, TransactionType, UserRole, UserStatus } from '../../src/domain/types';
import { PRESET_AVATARS, User } from '../../src/domain/User';
import { BotSimulationService } from '../../src/services/BotSimulationService';
import { PasswordHasher, sanitizeImageDataUrl, VerifiedGoogleIdentity } from '../security/SecurityServices';
import { CommitChangesFn, PlatformStoreData, ServerSavedBankDetails, ServerStoredUser } from '../ServerTypes';
import { AuditAndAlertLedger } from './AuditAndAlertLedger';
import { PromoRiskService } from './PromoRiskService';

export class UserAuthAccountService {
  constructor(
    private readonly store: PlatformStoreData,
    private readonly users: Map<string, User>,
    private readonly promoService: PromoRiskService,
    private readonly hasher: PasswordHasher,
    private readonly ledger: AuditAndAlertLedger,
    private readonly commitChanges: CommitChangesFn,
    private readonly persistOnly: () => void
  ) {}

  public hydrateFromStore(botService: BotSimulationService): void {
    this.users.clear();

    for (const su of this.store.users) {
      if (su.isBot) continue;
      let available = Math.max(0, Math.round(su.availableBalance ?? 0));
      const delta = su.pendingAdminCreditDelta ?? 0;
      if (delta !== 0) {
        available = Math.max(0, available + delta);
        su.pendingAdminCreditDelta = 0;
      }
      const pendingBonuses = Array.isArray(su.pendingBonusCredits) ? su.pendingBonusCredits : [];
      if (pendingBonuses.length > 0) {
        const bonusSum = pendingBonuses.reduce((acc, b) => acc + Math.max(0, b.amountTokens), 0);
        available += bonusSum;
        su.pendingBonusCredits = [];
      }
      su.availableBalance = available;
      if (!su.referralCode || su.referralCode.toUpperCase() === su.username.toUpperCase()) {
        su.referralCode = this.promoService.generateUniqueReferralCode(su.username, su.id);
      }

      const u = User.fromJSON({
        id: su.id,
        username: su.username,
        displayName: su.displayName,
        email: su.email,
        passwordHash: '',
        avatarUrl: su.avatarUrl || PRESET_AVATARS[0],
        avatarFrameId: su.avatarFrameId,
        role: su.role === 'HIGH_ROLLER' ? UserRole.HIGH_ROLLER : UserRole.PLAYER,
        status: su.status === 'SUSPENDED' ? UserStatus.SUSPENDED : UserStatus.ACTIVE,
        availableBalance: su.availableBalance,
        heldBalance: Math.max(0, Math.round(su.heldBalance ?? 0)),
        isBot: false,
        createdAt: su.createdAt,
        country: su.country,
        phoneNumber: su.phoneNumber,
        dateOfBirth: su.dateOfBirth,
        ageVerified: su.ageVerified,
        kycStatus:
          su.kycStatus === 'VERIFIED'
            ? KycStatus.VERIFIED
            : su.kycStatus === 'PENDING'
              ? KycStatus.PENDING
              : KycStatus.UNVERIFIED,
        kycDocumentName: su.kycDocumentName,
        kycDocumentDataUrl: su.kycDocumentDataUrl,
        kycSubmittedAt: su.kycSubmittedAt,
        kycLastDecision: su.kycLastDecision,
        kycReviewNote: su.kycReviewNote,
        kycReviewedAt: su.kycReviewedAt,
        kycReviewedBy: su.kycReviewedBy,
        savedCryptoAddress: su.savedCryptoAddress,
        savedBankDetails: su.savedBankDetails,
        dailyBetLimitTokens: su.dailyBetLimitTokens,
        referralCode: su.referralCode,
        referredByCode: su.referredByCode,
        referredByUserId: su.referredByUserId,
        referredByUsername: su.referredByUsername,
        welcomeBonusClaimed: su.welcomeBonusClaimed,
        welcomeBonusTokens: su.welcomeBonusTokens,
        transactions: (su.transactions ?? []).map((tx) => ({
          id: tx.id,
          userId: tx.userId,
          type: tx.type as TransactionType,
          amount: tx.amount,
          balanceAfter: tx.balanceAfter,
          heldAfter: tx.heldAfter,
          description: tx.description,
          createdAt: tx.createdAt,
          referenceId: tx.referenceId,
        })),
      });
      this.users.set(u.id, u);
    }

    const seededBots = botService.seedBotAccounts(this.users);
    for (const bot of seededBots) {
      const existingStored = this.store.users.find((u) => u.id === bot.id);
      if (!existingStored) {
        this.store.users.push({
          id: bot.id,
          username: bot.username,
          displayName: bot.displayName,
          email: bot.email,
          role: 'PLAYER',
          status: 'ACTIVE',
          availableBalance: bot.wallet.availableBalance,
          heldBalance: bot.wallet.heldBalance,
          isBot: true,
          createdAt: bot.createdAt,
          country: bot.country,
          avatarUrl: bot.avatarUrl,
          avatarFrameId: bot.avatarFrameId,
          kycStatus: 'VERIFIED',
        });
      } else {
        existingStored.isBot = true;
        existingStored.username = bot.username;
        existingStored.displayName = bot.displayName;
        existingStored.country = bot.country;
        existingStored.avatarUrl = bot.avatarUrl;
        existingStored.avatarFrameId = bot.avatarFrameId;
      }
    }
  }

  public flushToStore(): void {
    const existingById = new Map<string, ServerStoredUser>();
    for (const su of this.store.users) {
      existingById.set(su.id, su);
    }

    for (const u of this.users.values()) {
      const su = existingById.get(u.id);
      if (!su) continue;
      su.username = u.username;
      su.displayName = u.displayName;
      su.email = u.email;
      su.avatarUrl = u.avatarUrl;
      su.avatarFrameId = u.avatarFrameId;
      su.role = u.role === UserRole.HIGH_ROLLER ? 'HIGH_ROLLER' : 'PLAYER';
      su.status = u.status === UserStatus.SUSPENDED ? 'SUSPENDED' : 'ACTIVE';
      su.availableBalance = u.wallet.availableBalance;
      su.heldBalance = u.wallet.heldBalance;
      su.country = u.country;
      su.phoneNumber = u.phoneNumber;
      su.dateOfBirth = u.dateOfBirth;
      su.ageVerified = u.ageVerified;
      su.kycStatus = u.kycStatus;
      su.kycDocumentName = u.kycDocumentName;
      su.kycDocumentDataUrl = u.kycDocumentDataUrl;
      su.kycSubmittedAt = u.kycSubmittedAt;
      su.kycLastDecision = u.kycLastDecision;
      su.kycReviewNote = u.kycReviewNote;
      su.kycReviewedAt = u.kycReviewedAt;
      su.kycReviewedBy = u.kycReviewedBy;
      su.savedCryptoAddress = u.savedCryptoAddress;
      su.savedBankDetails = u.savedBankDetails;
      su.dailyBetLimitTokens = u.dailyBetLimitTokens;
      su.referralCode = u.referralCode;
      su.transactions = u.wallet.transactions.slice(0, 150).map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        heldAfter: t.heldAfter,
        description: t.description,
        createdAt: t.createdAt,
        referenceId: t.referenceId,
      }));
    }
  }

  public requireHumanUser(userId: string): User {
    const user = this.users.get(userId);
    if (!user || user.isBot) {
      throw new Error('Authenticated player account not found.');
    }
    return user;
  }

  public requireActiveHumanUser(userId: string): User {
    const user = this.requireHumanUser(userId);
    if (!user.isActive) {
      throw new Error('Your account is currently suspended. Contact support for review.');
    }
    return user;
  }

  public registerPlayer(
    input: {
      displayName: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
      referralCode?: string;
    },
    ipHash: string
  ): {
    user: User;
    welcomeBonusGranted: boolean;
    welcomeBonusTokens: number;
    referredByUsername?: string;
  } {
    const displayName = String(input.displayName ?? '').trim();
    const username = String(input.username ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const password = String(input.password ?? '');
    const confirmPassword = String(input.confirmPassword ?? '');

    if (displayName.length < 2) {
      throw new Error('Please enter your full name (at least 2 characters).');
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new Error('Username must be 3–20 characters using letters, numbers, or underscores.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    for (const existing of this.users.values()) {
      if (existing.username.toLowerCase() === username.toLowerCase()) {
        throw new Error(`Username "${username}" is already taken.`);
      }
      if (!existing.isBot && existing.email.toLowerCase() === email) {
        throw new Error(`An account with email "${email}" already exists.`);
      }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hasher.hashScrypt(password, salt);
    const userId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const avatarUrl = PRESET_AVATARS[this.users.size % PRESET_AVATARS.length];

    const created = this.createStoredAndDomainUser({
      id: userId,
      username,
      displayName,
      email,
      passwordHash,
      passwordSalt: salt,
      avatarUrl,
      referralCodeInput: input.referralCode,
      ipHash,
    });

    this.commitChanges({ persistNow: true, broadcastArena: true, affectedUserIds: [userId] });
    return {
      user: created.domainUser,
      welcomeBonusGranted: created.welcomeBonusGranted,
      welcomeBonusTokens: created.welcomeBonusTokens,
      referredByUsername: created.referredByUsername,
    };
  }

  public loginWithPassword(identifier: string, password: string): User {
    const cleanId = String(identifier ?? '').trim().toLowerCase();
    if (!cleanId || !password) {
      throw new Error('Please enter both your username/email and password.');
    }

    const su = this.store.users.find(
      (u) => !u.isBot && (u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId)
    );
    if (!su) {
      throw new Error('Invalid username/email or password.');
    }
    if (!su.passwordHash || !su.passwordSalt) {
      throw new Error('This account uses Google Sign-In or requires a password reset by Admin.');
    }
    if (!this.hasher.verifyScrypt(password, su.passwordSalt, su.passwordHash)) {
      throw new Error('Invalid username/email or password.');
    }
    if (su.status === 'SUSPENDED') {
      throw new Error('Your account is currently suspended. Please contact support.');
    }

    const domainUser = this.users.get(su.id);
    if (!domainUser) {
      throw new Error('Account runtime state missing.');
    }
    return domainUser;
  }

  public loginOrRegisterGoogle(
    verifiedClaims: VerifiedGoogleIdentity,
    referralCodeInput: string | undefined,
    ipHash: string
  ): {
    user: User;
    isNew: boolean;
    welcomeBonusGranted: boolean;
    welcomeBonusTokens: number;
    referredByUsername?: string;
  } {
    const cleanEmail = verifiedClaims.email.trim().toLowerCase();
    const su = this.store.users.find(
      (u) =>
        !u.isBot &&
        ((u.googleUid && u.googleUid === verifiedClaims.uid) ||
          (u.email && u.email.toLowerCase() === cleanEmail))
    );

    if (su) {
      if (su.status === 'SUSPENDED') {
        throw new Error('Your account is currently suspended. Please contact support.');
      }
      if (!su.googleUid) {
        su.googleUid = verifiedClaims.uid;
        this.persistOnly();
      }
      const domainUser = this.users.get(su.id);
      if (!domainUser) throw new Error('Account runtime state missing.');
      return {
        user: domainUser,
        isNew: false,
        welcomeBonusGranted: false,
        welcomeBonusTokens: 0,
        referredByUsername: su.referredByUsername,
      };
    }

    const baseHandle =
      (verifiedClaims.name || cleanEmail.split('@')[0] || 'player')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(0, 14) || 'player';
    let candidateUsername = baseHandle.length >= 3 ? baseHandle : `ply_${baseHandle}`;
    let suffix = 1;
    while (
      Array.from(this.users.values()).some(
        (u) => u.username.toLowerCase() === candidateUsername.toLowerCase()
      )
    ) {
      candidateUsername = `${baseHandle.slice(0, 11)}${suffix}`;
      suffix += 1;
    }

    const userId = `usr_g_${verifiedClaims.uid.slice(0, 20)}`;
    const created = this.createStoredAndDomainUser({
      id: userId,
      username: candidateUsername,
      displayName: (verifiedClaims.name || candidateUsername).trim().slice(0, 64),
      email: cleanEmail,
      googleUid: verifiedClaims.uid,
      avatarUrl:
        verifiedClaims.picture && /^https:\/\//i.test(verifiedClaims.picture)
          ? verifiedClaims.picture
          : PRESET_AVATARS[this.users.size % PRESET_AVATARS.length],
      referralCodeInput,
      ipHash,
    });

    this.commitChanges({ persistNow: true, broadcastArena: true, affectedUserIds: [userId] });
    return {
      user: created.domainUser,
      isNew: true,
      welcomeBonusGranted: created.welcomeBonusGranted,
      welcomeBonusTokens: created.welcomeBonusTokens,
      referredByUsername: created.referredByUsername,
    };
  }

  private createStoredAndDomainUser(params: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    passwordHash?: string;
    passwordSalt?: string;
    googleUid?: string;
    avatarUrl: string;
    referralCodeInput?: string;
    ipHash: string;
  }): {
    domainUser: User;
    welcomeBonusGranted: boolean;
    welcomeBonusTokens: number;
    referredByUsername?: string;
  } {
    const now = Date.now();
    const referralCode = this.promoService.generateUniqueReferralCode(params.username, params.id);
    const referrer = this.store.promoConfig.referralProgramEnabled
      ? this.promoService.resolveReferrerByCode(params.referralCodeInput, params.id, params.email)
      : null;

    const welcomeEval = this.promoService.evaluateSignupWelcomeBonus({
      userId: params.id,
      username: params.username,
      ipHash: params.ipHash,
      now,
    });

    const domainUser = new User({
      id: params.id,
      username: params.username,
      displayName: params.displayName,
      email: params.email,
      passwordHash: '',
      avatarUrl: params.avatarUrl,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      initialBalance: 0,
      createdAt: now,
      referralCode,
      referredByCode: referrer?.referralCode,
      referredByUserId: referrer?.id,
      referredByUsername: referrer?.username,
      welcomeBonusClaimed: welcomeEval.grantWelcome,
      welcomeBonusTokens: welcomeEval.welcomeTokens,
    });

    if (welcomeEval.grantWelcome && welcomeEval.welcomeTokens > 0) {
      domainUser.wallet.creditAvailable(
        welcomeEval.welcomeTokens,
        TransactionType.SIGNUP_BONUS,
        `Welcome Bonus (+${welcomeEval.welcomeTokens} TKN)`,
        `WELCOME_BONUS_${params.id}`
      );
    }

    this.users.set(domainUser.id, domainUser);

    const storedUser: ServerStoredUser = {
      id: domainUser.id,
      username: domainUser.username,
      displayName: domainUser.displayName,
      email: domainUser.email,
      passwordHash: params.passwordHash,
      passwordSalt: params.passwordSalt,
      googleUid: params.googleUid,
      avatarUrl: domainUser.avatarUrl,
      avatarFrameId: domainUser.avatarFrameId,
      role: 'PLAYER',
      status: 'ACTIVE',
      availableBalance: domainUser.wallet.availableBalance,
      heldBalance: 0,
      isBot: false,
      createdAt: now,
      kycStatus: 'UNVERIFIED',
      referralCode,
      referredByCode: referrer?.referralCode,
      referredByUserId: referrer?.id,
      referredByUsername: referrer?.username,
      welcomeBonusClaimed: welcomeEval.grantWelcome,
      welcomeBonusTokens: welcomeEval.welcomeTokens,
      pendingBonusCredits: [],
      promoSignupTokensGranted: welcomeEval.welcomeTokens,
      promoReferralTokensGranted: 0,
      promoTokensGrantedTotal: welcomeEval.welcomeTokens,
      promoTokensRemaining: welcomeEval.welcomeTokens,
      promoTokensWagered: 0,
      promoRealizedLossTokens: 0,
      promoRevokedTokens: 0,
      realDepositedTokens: 0,
      realWithdrawnTokens: 0,
      signupIpHash: params.ipHash || undefined,
      promoRiskFlag: welcomeEval.userRiskFlag,
      promoAdminNote: welcomeEval.userNote,
      transactions: domainUser.wallet.transactions.map((t) => ({ ...t })),
    };

    this.store.users.push(storedUser);

    if (welcomeEval.grantWelcome && welcomeEval.welcomeTokens > 0) {
      this.promoService.appendPromoLedger({
        kind: 'WELCOME_MINT',
        userId: domainUser.id,
        username: domainUser.username,
        relatedUsername: referrer?.username,
        tokenAmount: welcomeEval.welcomeTokens,
        realLiabilityImpactTokens: 0,
        note: `New account free signup welcome grant (+${welcomeEval.welcomeTokens} TKN)${
          referrer ? ` · Referred by @${referrer.username}` : ''
        }`,
      });
    }

    if (referrer) {
      this.store.referrals.unshift({
        id: `ref_${now}_${crypto.randomBytes(3).toString('hex')}`,
        referrerUserId: referrer.id,
        referrerUsername: referrer.username,
        referrerCode: referrer.referralCode || referrer.username.toUpperCase(),
        refereeUserId: domainUser.id,
        refereeUsername: domainUser.username,
        status: 'PENDING_DEPOSIT',
        qualifyingDepositTokens: 0,
        referrerRewardTokens: 0,
        refereeRewardTokens: 0,
        createdAt: now,
      });
    }

    this.ledger.appendAudit(
      'SYSTEM_PROMO',
      welcomeEval.grantWelcome ? 'NEW_USER_WELCOME_BONUS' : 'NEW_USER_REGISTERED',
      `@${domainUser.username}`,
      `${
        welcomeEval.grantWelcome
          ? `Credited +${welcomeEval.welcomeTokens} TKN Free Signup Bonus`
          : welcomeEval.welcomeBlockReason
            ? `Blocked Welcome Bonus (${welcomeEval.welcomeBlockReason})`
            : 'Registered (Welcome Bonus OFF)'
      }${referrer ? ` · Referred by @${referrer.username}` : ''}`
    );

    return {
      domainUser,
      welcomeBonusGranted: welcomeEval.grantWelcome,
      welcomeBonusTokens: welcomeEval.welcomeTokens,
      referredByUsername: referrer?.username,
    };
  }

  public changePlayerPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): void {
    this.requireActiveHumanUser(userId);
    const su = this.store.users.find((u) => u.id === userId && !u.isBot);
    if (!su) throw new Error('Account not found.');
    if (!su.passwordHash || !su.passwordSalt) {
      throw new Error('Password sign-in is not configured for this account.');
    }
    if (!this.hasher.verifyScrypt(currentPassword, su.passwordSalt, su.passwordHash)) {
      throw new Error('Current password is incorrect.');
    }
    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match.');
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    su.passwordSalt = newSalt;
    su.passwordHash = this.hasher.hashScrypt(newPassword, newSalt);
    this.persistOnly();
  }

  public updatePlayerProfile(
    userId: string,
    updates: {
      displayName: string;
      email: string;
      country?: string;
      phoneNumber?: string;
      dateOfBirth?: string;
      ageVerified?: boolean;
      dailyBetLimitTokens?: number;
    }
  ): void {
    const user = this.requireActiveHumanUser(userId);
    const cleanName = String(updates.displayName ?? '').trim().slice(0, 64);
    const cleanEmail = String(updates.email ?? '').trim().toLowerCase().slice(0, 120);
    if (cleanName.length < 2) {
      throw new Error('Display name must be at least 2 characters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    for (const other of this.users.values()) {
      if (other.id !== user.id && !other.isBot && other.email.toLowerCase() === cleanEmail) {
        throw new Error('That email address is already used by another account.');
      }
    }
    if (updates.dateOfBirth) {
      const dob = new Date(updates.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        throw new Error('Please enter a valid date of birth.');
      }
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        throw new Error('You must be at least 18 years old to participate on BetSpot.');
      }
    }

    user.displayName = cleanName;
    user.email = cleanEmail;
    if (updates.country !== undefined) user.country = String(updates.country).trim().slice(0, 80);
    if (updates.phoneNumber !== undefined) user.phoneNumber = String(updates.phoneNumber).trim().slice(0, 40);
    if (updates.dateOfBirth !== undefined) user.dateOfBirth = String(updates.dateOfBirth).slice(0, 20);
    if (updates.ageVerified !== undefined) user.ageVerified = Boolean(updates.ageVerified);
    if (updates.dailyBetLimitTokens !== undefined && Number.isFinite(updates.dailyBetLimitTokens)) {
      user.dailyBetLimitTokens = Math.max(0, Math.round(updates.dailyBetLimitTokens));
    }
    user.touchRecord();
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
  }

  public updatePlayerPayoutDetails(
    userId: string,
    updates: {
      savedCryptoAddress?: string;
      savedBankDetails?: ServerSavedBankDetails;
    }
  ): void {
    const user = this.requireActiveHumanUser(userId);
    if (updates.savedCryptoAddress !== undefined) {
      user.savedCryptoAddress = String(updates.savedCryptoAddress).trim().slice(0, 128);
    }
    if (updates.savedBankDetails !== undefined) {
      if (user.country !== 'Sri Lanka') {
        throw new Error('Sri Lankan local bank settlement details are only supported for Sri Lanka accounts.');
      }
      user.savedBankDetails = {
        bankName: String(updates.savedBankDetails.bankName ?? '').trim().slice(0, 80),
        branch: String(updates.savedBankDetails.branch ?? '').trim().slice(0, 80),
        accountHolder: String(updates.savedBankDetails.accountHolder ?? '').trim().slice(0, 80),
        accountNumber: String(updates.savedBankDetails.accountNumber ?? '').trim().slice(0, 64),
      };
    }
    user.touchRecord();
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
  }

  public submitPlayerKyc(userId: string, documentName: string, documentDataUrl: string): void {
    const user = this.requireActiveHumanUser(userId);
    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new Error('Your KYC verification is already approved.');
    }
    if (!documentName.trim()) {
      throw new Error('Please provide your ID/Passport document file.');
    }
    const safeImg = sanitizeImageDataUrl(documentDataUrl);
    if (!safeImg) {
      throw new Error('Please upload a valid PNG, JPEG, or WebP document image under 4 MB.');
    }
    user.kycStatus = KycStatus.PENDING;
    user.kycDocumentName = documentName.trim().slice(0, 120);
    user.kycDocumentDataUrl = safeImg;
    user.kycSubmittedAt = Date.now();
    user.kycLastDecision = undefined;
    user.kycReviewNote = undefined;
    user.kycReviewedAt = undefined;
    user.kycReviewedBy = undefined;
    user.touchRecord();
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
  }

  public updatePlayerAvatar(userId: string, avatarUrl: string, avatarFrameId?: string): void {
    const user = this.requireActiveHumanUser(userId);
    const safePreset = PRESET_AVATARS.includes(avatarUrl as (typeof PRESET_AVATARS)[number])
      ? avatarUrl
      : undefined;
    const safeUpload = sanitizeImageDataUrl(avatarUrl);
    if (!safePreset && !safeUpload) {
      throw new Error('Invalid avatar selection or uploaded image.');
    }
    user.avatarUrl = safePreset ?? safeUpload!;
    if (avatarFrameId !== undefined) {
      user.avatarFrameId = String(avatarFrameId).trim().slice(0, 48);
    }
    user.touchRecord();
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
  }

  public adminCreateUser(params: {
    username: string;
    displayName: string;
    email: string;
    role: 'PLAYER' | 'HIGH_ROLLER';
    initialBalance: number;
    adminUsername: string;
  }): ServerStoredUser {
    const username = params.username.trim().slice(0, 48);
    if (!username) throw new Error('Username is required.');
    if (this.store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error(`Username "${username}" already exists.`);
    }
    const id = `usr_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const now = Date.now();
    const cleanBal = Math.max(0, Math.round(params.initialBalance));
    const salt = crypto.randomBytes(16).toString('hex');
    const domainUser = new User({
      id,
      username,
      displayName: params.displayName || username,
      email: params.email || `${username.toLowerCase()}@betspot.lk`,
      passwordHash: '',
      avatarUrl: PRESET_AVATARS[this.users.size % PRESET_AVATARS.length],
      role: params.role === 'HIGH_ROLLER' ? UserRole.HIGH_ROLLER : UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      initialBalance: cleanBal,
      createdAt: now,
      referralCode: this.promoService.generateUniqueReferralCode(username, id),
    });
    this.users.set(id, domainUser);

    const created: ServerStoredUser = {
      id,
      username,
      displayName: domainUser.displayName,
      email: domainUser.email,
      passwordSalt: salt,
      passwordHash: this.hasher.hashScrypt(crypto.randomBytes(16).toString('hex'), salt),
      avatarUrl: domainUser.avatarUrl,
      avatarFrameId: domainUser.avatarFrameId,
      role: params.role,
      status: 'ACTIVE',
      availableBalance: cleanBal,
      heldBalance: 0,
      isBot: false,
      createdAt: now,
      kycStatus: 'UNVERIFIED',
      adminAdjustedAt: now,
      referralCode: domainUser.referralCode,
    };
    this.store.users.push(created);
    this.ledger.appendAudit(
      params.adminUsername,
      'CREATE_USER',
      created.username,
      `Created ${params.role} account with ${cleanBal.toLocaleString()} TKN`
    );
    this.commitChanges({ persistNow: true, affectedUserIds: [id], broadcastArena: true });
    return created;
  }

  public adminUpdateUser(
    userId: string,
    updates: {
      displayName?: string;
      email?: string;
      role?: 'PLAYER' | 'HIGH_ROLLER';
      status?: 'ACTIVE' | 'SUSPENDED';
      balanceOverride?: number;
      adminUsername: string;
    }
  ): ServerStoredUser {
    const su = this.store.users.find((u) => u.id === userId);
    const domainUser = this.users.get(userId);
    if (!su || !domainUser) throw new Error('User not found.');

    if (updates.displayName?.trim()) {
      su.displayName = updates.displayName.trim().slice(0, 64);
      domainUser.displayName = su.displayName;
    }
    if (updates.email?.trim()) {
      su.email = updates.email.trim().slice(0, 120);
      domainUser.email = su.email;
    }
    if (updates.role === 'PLAYER' || updates.role === 'HIGH_ROLLER') {
      su.role = updates.role;
      domainUser.role = updates.role === 'HIGH_ROLLER' ? UserRole.HIGH_ROLLER : UserRole.PLAYER;
    }
    if (updates.status === 'ACTIVE' || updates.status === 'SUSPENDED') {
      su.status = updates.status;
      domainUser.status = updates.status === 'SUSPENDED' ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
    }
    if (typeof updates.balanceOverride === 'number' && Number.isFinite(updates.balanceOverride)) {
      const nextBal = Math.max(0, Math.round(updates.balanceOverride));
      const delta = nextBal - domainUser.wallet.availableBalance;
      if (delta !== 0) {
        domainUser.wallet.adjustAvailableByAdmin(delta, 'Admin balance override');
      }
      su.availableBalance = domainUser.wallet.availableBalance;
      su.pendingAdminCreditDelta = 0;
    }
    su.adminAdjustedAt = Date.now();
    this.ledger.appendAudit(
      updates.adminUsername,
      'UPDATE_USER',
      su.username,
      `Updated profile/status (${su.status}, ${su.availableBalance.toLocaleString()} TKN)`
    );
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
    return su;
  }

  public adminReviewKyc(
    userId: string,
    approve: boolean,
    note: string,
    adminUsername: string
  ): ServerStoredUser {
    const su = this.store.users.find((u) => u.id === userId);
    const domainUser = this.users.get(userId);
    if (!su || !domainUser) throw new Error('User not found.');

    const reviewNote =
      note.trim() ||
      (approve
        ? 'Identity document verified and approved by Admin'
        : 'KYC verification rejected — please submit a clear National ID or Passport image');
    const now = Date.now();
    su.kycStatus = approve ? 'VERIFIED' : 'UNVERIFIED';
    su.kycLastDecision = approve ? 'APPROVED' : 'REJECTED';
    su.kycReviewNote = reviewNote;
    su.kycReviewedAt = now;
    su.kycReviewedBy = adminUsername;
    su.kycDocumentDataUrl = undefined;
    su.adminAdjustedAt = now;

    domainUser.kycStatus = approve ? KycStatus.VERIFIED : KycStatus.UNVERIFIED;
    domainUser.kycLastDecision = su.kycLastDecision;
    domainUser.kycReviewNote = reviewNote;
    domainUser.kycReviewedAt = now;
    domainUser.kycReviewedBy = adminUsername;
    domainUser.kycDocumentDataUrl = undefined;

    this.ledger.appendAudit(
      adminUsername,
      approve ? 'APPROVE_KYC' : 'REJECT_KYC',
      su.username,
      reviewNote
    );
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: false });
    return su;
  }
}
