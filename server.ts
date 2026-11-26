import crypto from 'crypto';
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { PaymentMethod, SideBetCategory, SideBetOptionKey, TierId } from './src/domain/types';
import { AdminCredentialRepository } from './server/persistence/AdminCredentialRepository';
import { JsonFilePlatformRepository } from './server/persistence/JsonFilePlatformRepository';
import { SqlitePlatformRepository } from './server/persistence/SqlitePlatformRepository';
import {
  AdminTokenClaims,
  GoogleIdTokenVerifier,
  HmacTokenService,
  HttpSessionSecurity,
  PasswordHasher,
  PlayerTokenClaims,
  SlidingWindowRateLimiter,
} from './server/security/SecurityServices';
import { ServerArenaRuntime } from './server/ServerArenaRuntime';
import { ServerInsufficientTokensError, StreamBroadcastEvent, defaultContactConfig } from './server/ServerTypes';
import { SseStreamHub } from './server/services/SseStreamHub';

interface AuthenticatedAdminRequest extends Request {
  adminClaims?: AdminTokenClaims;
}

interface AuthenticatedPlayerRequest extends Request {
  playerClaims?: PlayerTokenClaims;
}

const VALID_TIER_IDS = new Set<TierId>([
  TierId.TIER_1,
  TierId.TIER_2,
  TierId.TIER_3,
  TierId.TIER_4,
  TierId.TIER_5,
  TierId.TIER_6,
]);

function sendArenaError(res: Response, err: unknown, fallback: string, status = 400): void {
  if (err instanceof ServerInsufficientTokensError) {
    res.status(400).json({
      error: err.message,
      code: err.code,
      requiredTokens: err.requiredTokens,
      availableTokens: err.availableTokens,
    });
    return;
  }
  res.status(status).json({ error: err instanceof Error ? err.message : fallback });
}

async function startServer(): Promise<void> {
  const PORT = Number(process.env.PORT) || 3000;
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';
  const DATA_DIR = process.env.BETSPOT_DATA_DIR?.trim()
    ? path.resolve(process.env.BETSPOT_DATA_DIR.trim())
    : path.resolve(process.cwd(), '.betspot-data');
  let FIREBASE_PROJECT_ID = 'betspot-test01';
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (typeof cfg.projectId === 'string' && cfg.projectId.trim()) {
        FIREBASE_PROJECT_ID = cfg.projectId.trim();
      }
    }
  } catch {
    // Keep default provisioned project ID if config read fails
  }

  const allowedAdminEmails = new Set(
    [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_ALLOWED_EMAILS || '').split(',')]
      .map((e) => (e ?? '').trim().toLowerCase())
      .filter(Boolean)
  );

  const hasher = new PasswordHasher();
  const useJsonStorage = process.env.BETSPOT_STORAGE?.trim().toLowerCase() === 'json';
  const platformRepo = useJsonStorage
    ? new JsonFilePlatformRepository(DATA_DIR)
    : new SqlitePlatformRepository(DATA_DIR);
  const adminCredentialRepo = new AdminCredentialRepository(DATA_DIR, hasher);

  // Persist a fixed HMAC secret on disk if env vars are not explicitly provided,
  // so server restarts never log out active players or admins.
  let sessionSecret =
    process.env.ADMIN_SESSION_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const secretFile = path.join(DATA_DIR, '.session-secret');
    if (fs.existsSync(secretFile)) {
      sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
    }
    if (!sessionSecret) {
      sessionSecret = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(secretFile, sessionSecret, { encoding: 'utf8', mode: 0o600 });
    }
  }

  let backupTimer: ReturnType<typeof setInterval> | null = null;
  if (platformRepo instanceof SqlitePlatformRepository) {
    try {
      platformRepo.runDailyBackup(14);
      backupTimer = setInterval(() => {
        try {
          platformRepo.runDailyBackup(14);
        } catch (err) {
          console.error('[BetSpot] Daily SQLite backup failed:', err);
        }
      }, 24 * 60 * 60 * 1000);
      backupTimer.unref();
    } catch (err) {
      console.error('[BetSpot] Initial SQLite backup check failed:', err);
    }
  }

  const tokenService = new HmacTokenService(sessionSecret);
  const googleVerifier = new GoogleIdTokenVerifier(FIREBASE_PROJECT_ID);
  const authRateLimiter = new SlidingWindowRateLimiter(12, 10 * 60 * 1000);
  const adminRateLimiter = new SlidingWindowRateLimiter(12, 5 * 60 * 1000);
  const arenaActionRateLimiter = new SlidingWindowRateLimiter(180, 60 * 1000);
  const sseHub = new SseStreamHub();

  let runtime!: ServerArenaRuntime;
  const broadcastStreamEvent = (evt: StreamBroadcastEvent) => {
    sseHub.broadcast(
      evt,
      () => runtime.serializePublicArenaState(),
      (uid) => runtime.serializePlayerPrivateState(uid)
    );
  };

  runtime = new ServerArenaRuntime(platformRepo, broadcastStreamEvent, hasher);
  runtime.start();
  sseHub.startHeartbeat(20_000);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  const getClientKey = (req: Request): string => req.ip || 'unknown';

  app.use('/api/arena', (req: Request, res: Response, next: NextFunction) => {
    const key = `arena:${getClientKey(req)}`;
    if (arenaActionRateLimiter.isLimited(key)) {
      res.status(429).json({
        error: 'Too many arena requests. Please wait a moment and try again.',
      });
      return;
    }
    arenaActionRateLimiter.recordFailure(key);
    next();
  });

  const requireAdminBearer = (
    req: AuthenticatedAdminRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const token = HttpSessionSecurity.extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Admin authorization token is required.' });
      return;
    }
    const claims = tokenService.verifyAdminToken(token);
    if (!claims) {
      res.status(401).json({ error: 'Admin session has expired or is invalid.' });
      return;
    }
    req.adminClaims = claims;
    next();
  };

  const requirePlayerBearer = (
    req: AuthenticatedPlayerRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const bearer = HttpSessionSecurity.extractBearerToken(req);
    const cookieToken = HttpSessionSecurity.parseCookieValue(req, HttpSessionSecurity.PLAYER_COOKIE_NAME);
    const token = bearer || cookieToken;
    if (!token) {
      res.status(401).json({ error: 'Sign in required. Please log in to continue.' });
      return;
    }
    if (!bearer && cookieToken && req.method !== 'GET' && !HttpSessionSecurity.hasValidSameOriginForCookieMutation(req)) {
      res.status(403).json({ error: 'Cross-site request origin rejected.' });
      return;
    }
    const claims = tokenService.verifyPlayerToken(token);
    if (!claims) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    const user = runtime.getDomainUser(claims.sub);
    if (!user || user.isBot) {
      res.status(401).json({ error: 'Player account session invalid.' });
      return;
    }
    req.playerClaims = claims;
    next();
  };

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // --- Economy, Promo Metadata & Public Arena Snapshots ---
  app.get('/api/economy/config', (_req: Request, res: Response) => {
    res.json({ config: runtime.getPublicEconomyConfig() });
  });

  app.get('/api/promo/config', (_req: Request, res: Response) => {
    res.json(runtime.getPublicPromoMetadata());
  });

  app.get('/api/arena/state', (_req: Request, res: Response) => {
    res.json(runtime.serializePublicArenaState());
  });

  app.get('/api/invites/active', (_req: Request, res: Response) => {
    res.json({ invites: runtime.serializePublicArenaState().activeInvites });
  });

  app.get('/api/invites/stream', (req: Request, res: Response) => {
    sseHub.registerInviteClient(req, res, () => runtime.serializePublicArenaState().activeInvites);
  });

  // --- Authoritative Arena + Private Player SSE Stream ---
  app.post('/api/stream/ticket', (req: Request, res: Response) => {
    const token =
      HttpSessionSecurity.extractBearerToken(req) ||
      HttpSessionSecurity.parseCookieValue(req, HttpSessionSecurity.PLAYER_COOKIE_NAME);
    const claims = token ? tokenService.verifyPlayerToken(token) : null;
    const validUser = claims && runtime.getDomainUser(claims.sub) ? claims.sub : null;
    res.json({ ticket: tokenService.signStreamTicket(validUser) });
  });

  app.get('/api/arena/stream', (req: Request, res: Response) => {
    const rawTicket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : '';
    const ticketClaims = rawTicket ? tokenService.verifyStreamTicket(rawTicket) : null;
    let userId: string | null = ticketClaims?.sub ?? null;

    if (!userId) {
      const cookieToken = HttpSessionSecurity.parseCookieValue(req, HttpSessionSecurity.PLAYER_COOKIE_NAME);
      const cookieClaims = cookieToken ? tokenService.verifyPlayerToken(cookieToken) : null;
      if (cookieClaims && runtime.getDomainUser(cookieClaims.sub)) {
        userId = cookieClaims.sub;
      }
    }

    sseHub.registerArenaClient(
      req,
      res,
      userId,
      () => runtime.serializePublicArenaState(),
      (uid) => runtime.serializePlayerPrivateState(uid)
    );
  });

  // --- Player Authentication Routes ---
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    if (authRateLimiter.isLimited(clientKey)) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again shortly.' });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    try {
      const result = runtime.registerPlayer(
        {
          displayName: String(body?.displayName ?? ''),
          username: String(body?.username ?? ''),
          email: String(body?.email ?? ''),
          password: String(body?.password ?? ''),
          confirmPassword: String(body?.confirmPassword ?? ''),
          referralCode: typeof body?.referralCode === 'string' ? body.referralCode : undefined,
        },
        HttpSessionSecurity.getClientIpHash(req)
      );
      const priv = runtime.serializePlayerPrivateState(result.user.id);
      res.status(201).json({
        ok: true,
        user: priv?.user,
        welcomeBonusGranted: result.welcomeBonusGranted,
        welcomeBonusTokens: result.welcomeBonusTokens,
        referredByUsername: result.referredByUsername,
        promoConfig: priv?.promoConfig,
        economyConfig: priv?.economyConfig,
      });
    } catch (err) {
      authRateLimiter.recordFailure(clientKey);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    if (authRateLimiter.isLimited(clientKey)) {
      res.status(429).json({
        error: 'Too many failed sign-in attempts. Please wait 10 minutes before trying again.',
      });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const identifier = typeof body?.identifier === 'string' ? body.identifier : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    try {
      const user = runtime.loginWithPassword(identifier, password);
      authRateLimiter.clear(clientKey);
      const { token } = tokenService.signPlayerToken(user.id);
      HttpSessionSecurity.setPlayerCookie(req, res, token);
      res.json({
        token,
        playerState: runtime.serializePlayerPrivateState(user.id),
        arena: runtime.serializePublicArenaState(),
      });
    } catch (err) {
      authRateLimiter.recordFailure(clientKey);
      res.status(401).json({ error: err instanceof Error ? err.message : 'Invalid credentials.' });
    }
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    if (authRateLimiter.isLimited(clientKey)) {
      res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    const referralCode =
      typeof body?.referralCode === 'string' ? body.referralCode.trim() : undefined;

    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required.' });
      return;
    }

    try {
      const verified = await googleVerifier.verify(idToken);
      const result = runtime.loginOrRegisterGoogle(
        verified,
        referralCode,
        HttpSessionSecurity.getClientIpHash(req)
      );
      authRateLimiter.clear(clientKey);
      const { token } = tokenService.signPlayerToken(result.user.id);
      HttpSessionSecurity.setPlayerCookie(req, res, token);
      res.json({
        token,
        isNew: result.isNew,
        welcomeBonusGranted: result.welcomeBonusGranted,
        welcomeBonusTokens: result.welcomeBonusTokens,
        referredByUsername: result.referredByUsername,
        playerState: runtime.serializePlayerPrivateState(result.user.id),
        arena: runtime.serializePublicArenaState(),
      });
    } catch (err) {
      authRateLimiter.recordFailure(clientKey);
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Google sign-in verification failed.',
      });
    }
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const cookieToken = HttpSessionSecurity.parseCookieValue(
      req,
      HttpSessionSecurity.PLAYER_COOKIE_NAME
    );
    const token = HttpSessionSecurity.extractBearerToken(req) || cookieToken;
    if (!token) {
      res.json({ authenticated: false, arena: runtime.serializePublicArenaState() });
      return;
    }
    const claims = tokenService.verifyPlayerToken(token);
    if (!claims || !runtime.getDomainUser(claims.sub)) {
      if (cookieToken) {
        HttpSessionSecurity.clearPlayerCookie(req, res);
      }
      res.json({ authenticated: false, arena: runtime.serializePublicArenaState() });
      return;
    }
    res.json({
      authenticated: true,
      token,
      playerState: runtime.serializePlayerPrivateState(claims.sub),
      arena: runtime.serializePublicArenaState(),
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const bearer = HttpSessionSecurity.extractBearerToken(req);
    const cookieToken = !bearer
      ? HttpSessionSecurity.parseCookieValue(req, HttpSessionSecurity.PLAYER_COOKIE_NAME)
      : null;
    if (!bearer && cookieToken && !HttpSessionSecurity.hasValidSameOriginForCookieMutation(req)) {
      res.status(403).json({ error: 'Cross-origin cookie logout blocked.' });
      return;
    }
    const token = bearer || cookieToken;
    if (token) {
      const claims = tokenService.verifyPlayerToken(token);
      if (claims?.jti) tokenService.revokeTokenId(claims.jti, claims.exp);
    }
    HttpSessionSecurity.clearPlayerCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.changePlayerPassword(
        req.playerClaims!.sub,
        String(body?.currentPassword ?? ''),
        String(body?.newPassword ?? ''),
        String(body?.confirmPassword ?? '')
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update password.' });
    }
  });

  // --- Player Profile, Wallet, KYC & Referrals ---
  app.get('/api/player/state', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const state = runtime.serializePlayerPrivateState(req.playerClaims!.sub);
    if (!state) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json(state);
  });

  app.get('/api/player/referrals', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const state = runtime.serializePlayerPrivateState(req.playerClaims!.sub);
    if (!state) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json({
      config: state.promoConfig,
      summary: state.referralSummary,
    });
  });

  app.patch('/api/player/profile', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.updatePlayerProfile(req.playerClaims!.sub, {
        displayName: String(body?.displayName ?? ''),
        email: String(body?.email ?? ''),
        country: typeof body?.country === 'string' ? body.country : undefined,
        phoneNumber: typeof body?.phoneNumber === 'string' ? body.phoneNumber : undefined,
        dateOfBirth: typeof body?.dateOfBirth === 'string' ? body.dateOfBirth : undefined,
        ageVerified: typeof body?.ageVerified === 'boolean' ? body.ageVerified : undefined,
        dailyBetLimitTokens:
          typeof body?.dailyBetLimitTokens === 'number' ? body.dailyBetLimitTokens : undefined,
      });
      res.json({ playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update profile.' });
    }
  });

  app.put('/api/player/payout', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const bankRaw = body?.savedBankDetails as Record<string, unknown> | undefined;
      runtime.updatePlayerPayoutDetails(req.playerClaims!.sub, {
        savedCryptoAddress:
          typeof body?.savedCryptoAddress === 'string' ? body.savedCryptoAddress : undefined,
        savedBankDetails: bankRaw
          ? {
              bankName: String(bankRaw.bankName ?? ''),
              branch: String(bankRaw.branch ?? ''),
              accountHolder: String(bankRaw.accountHolder ?? ''),
              accountNumber: String(bankRaw.accountNumber ?? ''),
            }
          : undefined,
      });
      res.json({ playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save payout details.' });
    }
  });

  app.post('/api/player/kyc', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.submitPlayerKyc(
        req.playerClaims!.sub,
        String(body?.documentName ?? ''),
        String(body?.documentDataUrl ?? '')
      );
      res.json({ playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to submit KYC.' });
    }
  });

  app.put('/api/player/avatar', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.updatePlayerAvatar(
        req.playerClaims!.sub,
        String(body?.avatarUrl ?? ''),
        typeof body?.avatarFrameId === 'string' ? body.avatarFrameId : undefined
      );
      res.json({ playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update avatar.' });
    }
  });

  // --- Authoritative Payments Endpoints ---
  app.post('/api/payments/deposit-crypto', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const usdAmount = typeof body?.usdAmount === 'number' ? body.usdAmount : Number(body?.usdAmount);
    const method =
      body?.method === PaymentMethod.CRYPTO_USDC ? PaymentMethod.CRYPTO_USDC : PaymentMethod.CRYPTO_USDT;
    try {
      const payment = runtime.requestCryptoDeposit(req.playerClaims!.sub, usdAmount, method);
      res.status(201).json({
        payment,
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to request deposit.' });
    }
  });

  app.post('/api/payments/:id/receipt', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const payment = runtime.attachDepositReceipt(
        req.playerClaims!.sub,
        String(req.params.id ?? ''),
        String(body?.receiptName ?? 'payment_slip.png'),
        String(body?.receiptDataUrl ?? '')
      );
      res.json({
        payment,
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload receipt.' });
    }
  });

  app.post('/api/payments/withdraw', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const tokenAmount = typeof body?.tokenAmount === 'number' ? body.tokenAmount : Number(body?.tokenAmount);
    const rawMethod = String(body?.method ?? '');
    const method =
      rawMethod === PaymentMethod.SRI_LANKA_BANK
        ? PaymentMethod.SRI_LANKA_BANK
        : rawMethod === PaymentMethod.CRYPTO_USDC
          ? PaymentMethod.CRYPTO_USDC
          : PaymentMethod.CRYPTO_USDT;
    const dest = String(body?.destinationDetails ?? '');
    try {
      const payment = runtime.requestWithdrawal(req.playerClaims!.sub, tokenAmount, method, dest);
      res.status(201).json({
        payment,
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to submit withdrawal.' });
    }
  });

  // --- Authoritative Arena Action Endpoints ---
  app.post('/api/arena/enter-tier', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const tierId = String(body?.tierId ?? '') as TierId;
    const betAmount =
      typeof body?.betAmount === 'number' && Number.isFinite(body.betAmount)
        ? Math.round(body.betAmount)
        : undefined;
    if (!VALID_TIER_IDS.has(tierId)) {
      res.status(400).json({ error: 'Invalid tier ID.' });
      return;
    }
    try {
      const outcome = runtime.enterTierForPlay(req.playerClaims!.sub, tierId, betAmount);
      res.json({
        outcome,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to enter room tier.');
    }
  });

  app.post('/api/arena/leave-visitor', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    runtime.leaveLobbyVisitor(req.playerClaims!.sub, String(body?.boardId ?? ''));
    res.json({ ok: true, arena: runtime.serializePublicArenaState() });
  });

  app.post('/api/arena/enter-sidebet', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.enterBoardAsSideBettor(req.playerClaims!.sub, String(body?.boardId ?? ''));
      res.json({
        ok: true,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to enter as side-bettor.');
    }
  });

  app.post('/api/arena/join-seat', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    const betAmount = typeof body?.betAmount === 'number' ? body.betAmount : Number(body?.betAmount);
    try {
      runtime.joinMainSeat(req.playerClaims!.sub, boardId, betAmount);
      res.json({
        ok: true,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to join seat.');
    }
  });

  app.post('/api/arena/update-bet', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    const betAmount = typeof body?.betAmount === 'number' ? body.betAmount : Number(body?.betAmount);
    try {
      runtime.updateMainSeatBet(req.playerClaims!.sub, boardId, betAmount);
      res.json({
        ok: true,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to update stake.');
    }
  });

  app.post('/api/arena/leave-seat', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    try {
      runtime.leaveMainSeat(req.playerClaims!.sub, boardId);
      res.json({
        ok: true,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to leave seat.');
    }
  });

  app.post('/api/arena/quick-start', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    try {
      const result = runtime.quickStartMatch(req.playerClaims!.sub, boardId);
      res.json({
        ok: true,
        ...result,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to fast-start match.');
    }
  });

  app.post('/api/arena/roll', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    try {
      const roll = runtime.executeUserTurnRoll(req.playerClaims!.sub, boardId);
      res.json({ roll, arena: runtime.serializePublicArenaState() });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Roll denied.' });
    }
  });

  app.post('/api/arena/sidebet-batch', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    const items = Array.isArray(body?.items)
      ? (body.items as { category: SideBetCategory; option: SideBetOptionKey; amount: number }[])
      : [];
    try {
      const result = runtime.placeSideBetBatch(req.playerClaims!.sub, boardId, items);
      res.json({
        ...result,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to place side-bets.');
    }
  });

  app.post('/api/arena/reset-board', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      runtime.resetBoardForNextMatch(req.playerClaims!.sub, String(body?.boardId ?? ''));
      res.json({ ok: true, arena: runtime.serializePublicArenaState() });
    } catch (err) {
      sendArenaError(res, err, 'Unable to reset board.');
    }
  });

  app.post('/api/arena/accept-invite', requirePlayerBearer, (req: AuthenticatedPlayerRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const boardId = String(body?.boardId ?? '');
    const betAmount = typeof body?.betAmount === 'number' ? body.betAmount : Number(body?.betAmount);
    try {
      const joinedBoardId = runtime.acceptRoomInviteAndJoin(req.playerClaims!.sub, boardId, betAmount);
      res.json({
        ok: true,
        boardId: joinedBoardId,
        arena: runtime.serializePublicArenaState(),
        playerState: runtime.serializePlayerPrivateState(req.playerClaims!.sub),
      });
    } catch (err) {
      sendArenaError(res, err, 'Unable to join invited room.');
    }
  });

  // --- Retired Client-Trusted Endpoints (Blocked to prevent client tampering) ---
  const retireRoute = (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Legacy client-trusted route disabled. All operations run exclusively on the server.',
    });
  };
  for (const retiredPath of [
    '/api/sync/player',
    '/api/dice/roll',
    '/api/bot/outcome',
    '/api/bot/cooldown-tick',
    '/api/promo/register-user',
    '/api/promo/deposit-qualified',
    '/api/promo/outcome',
    '/api/invites/publish',
    '/api/invites/join',
    '/api/invites/leave',
    '/api/invites/expire',
  ]) {
    app.post(retiredPath, retireRoute);
  }
  app.get('/api/bot/runtime', retireRoute);
  app.get('/api/promo/referrals/:userId', retireRoute);

  // --- Admin Authentication Endpoints ---
  app.get('/api/admin/auth/status', (_req: Request, res: Response) => {
    const base = adminCredentialRepo.getStatus();
    res.json({
      ...base,
      googleAdminEnabled: allowedAdminEmails.size > 0,
    });
  });

  app.post('/api/admin/auth/google', async (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    if (adminRateLimiter.isLimited(clientKey)) {
      res.status(429).json({
        error: 'Too many failed admin sign-in attempts. Please wait 5 minutes before trying again.',
      });
      return;
    }

    if (allowedAdminEmails.size === 0) {
      res.status(403).json({
        error: 'Google Admin sign-in is not configured on this server. Use local Admin credentials.',
      });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required for Admin sign-in.' });
      return;
    }

    try {
      const verified = await googleVerifier.verify(idToken);
      const email = verified.email.trim().toLowerCase();

      if (!allowedAdminEmails.has(email)) {
        adminRateLimiter.recordFailure(clientKey);
        res.status(403).json({
          error: 'This Google account is not authorized as a BetSpot Admin operator.',
        });
        return;
      }

      adminRateLimiter.clear(clientKey);
      const { token, claims } = tokenService.signAdminToken(verified.email);
      res.json({
        token,
        username: claims.sub,
        email: verified.email,
        authMethod: 'google',
        expiresAt: claims.exp,
        configuredViaEnv: adminCredentialRepo.getEnvConfig().configured,
      });
    } catch (err) {
      adminRateLimiter.recordFailure(clientKey);
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Google Admin token verification failed.',
      });
    }
  });

  app.post('/api/admin/auth/setup', (req: Request, res: Response) => {
    if (adminCredentialRepo.getEnvConfig().configured) {
      res.status(403).json({ error: 'Admin credentials are managed by environment secrets.' });
      return;
    }
    if (adminCredentialRepo.readClaimed()) {
      res.status(409).json({ error: 'Admin portal has already been claimed.' });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      res.status(400).json({ error: 'Admin username must be 3–32 safe characters.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Admin password must be at least 8 characters long.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Admin passwords do not match.' });
      return;
    }

    try {
      adminCredentialRepo.claimInitialAdmin(username, password);
    } catch {
      res.status(409).json({ error: 'Admin credentials have already been claimed.' });
      return;
    }

    adminRateLimiter.clear(getClientKey(req));
    const { token, claims } = tokenService.signAdminToken(username);
    res.status(201).json({
      token,
      username: claims.sub,
      authMethod: 'password',
      expiresAt: claims.exp,
      configuredViaEnv: false,
    });
  });

  app.post('/api/admin/auth/login', (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    if (adminRateLimiter.isLimited(clientKey)) {
      res.status(429).json({
        error: 'Too many failed admin sign-in attempts. Please wait 5 minutes or use Google Admin Sign-In.',
      });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const usernameInput = typeof body?.username === 'string' ? body.username.trim() : '';
    const passwordInput = typeof body?.password === 'string' ? body.password : '';

    if (!usernameInput || !passwordInput) {
      res.status(400).json({ error: 'Please enter both Admin username and password.' });
      return;
    }

    const verified = adminCredentialRepo.verifyLogin(usernameInput, passwordInput);
    if (verified.notClaimed) {
      res.status(403).json({ error: 'Admin portal has not been claimed yet. Complete first-run setup.' });
      return;
    }
    if (!verified.ok || !verified.username) {
      adminRateLimiter.recordFailure(clientKey);
      res.status(401).json({ error: 'Invalid Admin username or password.' });
      return;
    }

    adminRateLimiter.clear(clientKey);
    const { token, claims } = tokenService.signAdminToken(verified.username);
    res.json({
      token,
      username: claims.sub,
      authMethod: 'password',
      expiresAt: claims.exp,
      configuredViaEnv: verified.configuredViaEnv,
    });
  });

  app.get('/api/admin/auth/session', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const claims = req.adminClaims!;
    res.json({
      authenticated: true,
      username: claims.sub,
      authMethod: claims.sub.includes('@') ? 'google' : 'password',
      expiresAt: claims.exp,
      configuredViaEnv: adminCredentialRepo.getEnvConfig().configured,
    });
  });

  app.post(
    '/api/admin/auth/change-password',
    requireAdminBearer,
    (req: AuthenticatedAdminRequest, res: Response) => {
      if (adminCredentialRepo.getEnvConfig().configured) {
        res.status(403).json({ error: 'Admin credentials are managed via environment secrets.' });
        return;
      }
      const claimed = adminCredentialRepo.readClaimed();
      if (!claimed) {
        res.status(403).json({ error: 'Admin portal credentials have not been claimed yet.' });
        return;
      }

      const body = req.body as Record<string, unknown> | undefined;
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
      const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';
      const newUsername =
        typeof body?.newUsername === 'string' && body.newUsername.trim().length > 0
          ? body.newUsername.trim()
          : claimed.username;

      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(newUsername)) {
        res.status(400).json({ error: 'Admin username must be 3–32 safe characters.' });
        return;
      }
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New Admin password must be at least 8 characters long.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        res.status(400).json({ error: 'New passwords do not match.' });
        return;
      }

      try {
        const updatedUsername = adminCredentialRepo.rotateCredentials(
          currentPassword,
          newUsername,
          newPassword
        );
        if (req.adminClaims?.jti) tokenService.revokeTokenId(req.adminClaims.jti, req.adminClaims.exp);
        const { token, claims } = tokenService.signAdminToken(updatedUsername);
        res.json({ token, username: claims.sub, expiresAt: claims.exp, configuredViaEnv: false });
      } catch (err) {
        res.status(401).json({ error: err instanceof Error ? err.message : 'Unable to rotate admin credentials.' });
      }
    }
  );

  app.post('/api/admin/auth/logout', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    if (req.adminClaims?.jti) tokenService.revokeTokenId(req.adminClaims.jti, req.adminClaims.exp);
    res.json({ ok: true });
  });

  // --- Customer Care Contact Config ---
  app.get('/api/contact/config', (_req: Request, res: Response) => {
    res.json({
      config: runtime.getContactConfig(),
    });
  });

  // --- Support Ticket Submission ---
  app.post('/api/support/tickets', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 120) : '';
    const category = typeof body?.category === 'string' ? body.category.trim().slice(0, 80) : 'Other Inquiry';
    const referenceId = typeof body?.referenceId === 'string' ? body.referenceId.trim().slice(0, 64) : 'N/A';
    const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 140) : '';
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 2000) : '';

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid name and email address are required.' });
      return;
    }
    if (subject.length < 4 || message.length < 15) {
      res.status(400).json({ error: 'Subject and detailed message are required.' });
      return;
    }

    const ticket = runtime.submitSupportTicket({
      name,
      email,
      category,
      referenceId,
      subject,
      message,
    });
    res.status(201).json({ ticket });
  });

  // --- Protected Admin Operations API ---
  app.get('/api/admin/store', requireAdminBearer, (_req: AuthenticatedAdminRequest, res: Response) => {
    res.json(runtime.getSanitizedAdminStore());
  });

  app.put('/api/admin/economy-config', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const { economyConfig, promoConfig } = runtime.adminUpdateEconomyConfig(
      body,
      Boolean(body?.syncReferralMinDeposit),
      req.adminClaims!.sub
    );
    res.json({
      config: economyConfig,
      promoConfig,
      store: runtime.getSanitizedAdminStore(),
    });
  });

  app.put('/api/admin/bot-config', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const config = runtime.adminUpdateBotConfig(req.body, req.adminClaims!.sub);
    const fullStore = runtime.getSanitizedAdminStore();
    res.json({ config, summary: fullStore.botSummary, store: fullStore });
  });

  app.put('/api/admin/promo-config', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const config = runtime.adminUpdatePromoConfig(req.body, req.adminClaims!.sub);
    const fullStore = runtime.getSanitizedAdminStore();
    res.json({ config, promoSummary: fullStore.promoSummary, store: fullStore });
  });

  app.put('/api/admin/contact-config', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const config = runtime.adminUpdateContactConfig(req.body, req.adminClaims!.sub);
    res.json({ config, store: runtime.getSanitizedAdminStore() });
  });

  app.post('/api/admin/promo-budget/adjust', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const action = body?.action === 'REDUCE' ? 'REDUCE' : 'TOPUP';
    const amountTokens =
      typeof body?.amountTokens === 'number' && Number.isFinite(body.amountTokens)
        ? Math.round(body.amountTokens)
        : 0;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
    try {
      runtime.adminAdjustPromoBudget(action, amountTokens, note, req.adminClaims!.sub);
      const fullStore = runtime.getSanitizedAdminStore();
      res.json({ promoSummary: fullStore.promoSummary, store: fullStore });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to adjust promo budget.' });
    }
  });

  app.post('/api/admin/promo/users/:id/revoke', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const reason =
      typeof body?.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 200)
        : 'Admin revoked unbacked promo tokens';
    const requestedAmount =
      typeof body?.amountTokens === 'number' && Number.isFinite(body.amountTokens)
        ? Math.max(0, Math.round(body.amountTokens))
        : 0;
    try {
      const revokedTokens = runtime.adminRevokePromoTokens(
        String(req.params.id ?? ''),
        requestedAmount,
        reason,
        req.adminClaims!.sub
      );
      const fullStore = runtime.getSanitizedAdminStore();
      res.json({ revokedTokens, promoSummary: fullStore.promoSummary, store: fullStore });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to revoke tokens.' });
    }
  });

  app.patch('/api/admin/promo/users/:id/note', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 320) : '';
    const flag =
      body?.flag === 'NONE' ||
      body?.flag === 'SHARED_IP_RING' ||
      body?.flag === 'MAX_REFERRAL_CAP' ||
      body?.flag === 'NO_DEPOSIT_FARMER'
        ? body.flag
        : undefined;

    const user = runtime.adminUpdatePromoUserNote(
      String(req.params.id ?? ''),
      note,
      flag,
      req.adminClaims!.sub
    );
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const fullStore = runtime.getSanitizedAdminStore();
    res.json({ user, promoSummary: fullStore.promoSummary, store: fullStore });
  });

  app.post('/api/admin/bot-pool/adjust', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const rawAction = String(body?.action ?? 'TOPUP').toUpperCase();
    const action = (['TOPUP', 'WITHDRAW', 'SET', 'BURN_SURPLUS'].includes(rawAction)
      ? rawAction
      : 'TOPUP') as 'TOPUP' | 'WITHDRAW' | 'SET' | 'BURN_SURPLUS';
    const amountTokens =
      typeof body?.amountTokens === 'number' && Number.isFinite(body.amountTokens)
        ? Math.round(body.amountTokens)
        : 0;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
    try {
      runtime.adminAdjustBotPool(action, amountTokens, note, req.adminClaims!.sub);
      const fullStore = runtime.getSanitizedAdminStore();
      res.json({ summary: fullStore.botSummary, store: fullStore });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to adjust Bot Pool.' });
    }
  });

  app.post('/api/admin/risk-alerts/:id/ack', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const alert = runtime.adminAcknowledgeRiskAlert(
      String(req.params.id ?? ''),
      req.adminClaims!.sub
    );
    if (!alert) {
      res.status(404).json({ error: 'Risk alert not found.' });
      return;
    }
    res.json({ alert, store: runtime.getSanitizedAdminStore() });
  });

  app.post('/api/admin/users', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const created = runtime.adminCreateUser({
        username: String(body?.username ?? ''),
        displayName: String(body?.displayName ?? ''),
        email: String(body?.email ?? ''),
        role: body?.role === 'HIGH_ROLLER' ? 'HIGH_ROLLER' : 'PLAYER',
        initialBalance: typeof body?.initialBalance === 'number' ? body.initialBalance : 0,
        adminUsername: req.adminClaims!.sub,
      });
      res.status(201).json({ user: created, store: runtime.getSanitizedAdminStore() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create user.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const user = runtime.adminUpdateUser(String(req.params.id ?? ''), {
        displayName: typeof body?.displayName === 'string' ? body.displayName : undefined,
        email: typeof body?.email === 'string' ? body.email : undefined,
        role: body?.role === 'PLAYER' || body?.role === 'HIGH_ROLLER' ? body.role : undefined,
        status: body?.status === 'ACTIVE' || body?.status === 'SUSPENDED' ? body.status : undefined,
        balanceOverride: typeof body?.balanceOverride === 'number' ? body.balanceOverride : undefined,
        adminUsername: req.adminClaims!.sub,
      });
      res.json({ user, store: runtime.getSanitizedAdminStore() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update user.' });
    }
  });

  app.post('/api/admin/users/:id/kyc', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const user = runtime.adminReviewKyc(
        String(req.params.id ?? ''),
        Boolean(body?.approve),
        typeof body?.note === 'string' ? body.note : '',
        req.adminClaims!.sub
      );
      res.json({ user, store: runtime.getSanitizedAdminStore() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to review KYC.' });
    }
  });

  app.post('/api/admin/system/reset-players', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    runtime.adminResetAllPlayers(req.adminClaims!.sub);
    res.json({ ok: true, store: runtime.getSanitizedAdminStore() });
  });

  app.delete('/api/admin/users/:id', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    try {
      runtime.adminDeleteUser(String(req.params.id ?? ''), req.adminClaims!.sub);
      res.json({ ok: true, store: runtime.getSanitizedAdminStore() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to delete user.';
      res.status(msg.includes('not found') ? 404 : 409).json({ error: msg });
    }
  });

  app.post('/api/admin/users/:id/topup', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const user = runtime.adminManualTopUp({
        userId: String(req.params.id ?? ''),
        amountTokens: typeof body?.amountTokens === 'number' ? Math.round(body.amountTokens) : 0,
        reason: typeof body?.reason === 'string' ? body.reason : '',
        fundingSource: typeof body?.fundingSource === 'string' ? body.fundingSource : 'Manual Desk',
        referenceCode: typeof body?.referenceCode === 'string' ? body.referenceCode : '',
        adminUsername: req.adminClaims!.sub,
      });
      res.json({ user, store: runtime.getSanitizedAdminStore() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Manual top-up failed.' });
    }
  });

  app.post('/api/admin/payments/:id/review', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    try {
      const result = runtime.adminReviewPayment(
        String(req.params.id ?? ''),
        Boolean(body?.approve),
        typeof body?.note === 'string' ? body.note : '',
        req.adminClaims!.sub
      );
      res.json({
        payment: result.payment,
        referralRewardInfo: result.referralRewardInfo,
        store: runtime.getSanitizedAdminStore(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to review payment.' });
    }
  });

  app.patch('/api/admin/tickets/:id', requireAdminBearer, (req: AuthenticatedAdminRequest, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const status = body?.status;
    const adminReply = typeof body?.adminReply === 'string' ? body.adminReply.trim().slice(0, 1000) : undefined;
    if (status !== 'Open · Under Review' && status !== 'In Progress' && status !== 'Resolved') {
      res.status(400).json({ error: 'Invalid ticket status.' });
      return;
    }

    const ticket = runtime.adminUpdateSupportTicket(
      String(req.params.id ?? ''),
      status,
      adminReply,
      req.adminClaims!.sub
    );
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    res.json({ ticket, store: runtime.getSanitizedAdminStore() });
  });

  // --- Admin Arena Moderation Endpoints ---
  app.post(
    '/api/admin/arena/boards/:boardId/cancel',
    requireAdminBearer,
    (req: AuthenticatedAdminRequest, res: Response) => {
      try {
        runtime.adminCancelDiceMatch(String(req.params.boardId ?? ''), req.adminClaims!.sub);
        res.json({ ok: true, store: runtime.getSanitizedAdminStore() });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to cancel dice match.' });
      }
    }
  );

  app.post(
    '/api/admin/arena/boards/:boardId/sidebets/:betId/cancel',
    requireAdminBearer,
    (req: AuthenticatedAdminRequest, res: Response) => {
      try {
        runtime.adminCancelSideBet(
          String(req.params.boardId ?? ''),
          String(req.params.betId ?? ''),
          req.adminClaims!.sub
        );
        res.json({ ok: true, store: runtime.getSanitizedAdminStore() });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to cancel side bet.' });
      }
    }
  );

  app.post(
    '/api/admin/arena/boards/:boardId/sidebets/:betId/suspend',
    requireAdminBearer,
    (req: AuthenticatedAdminRequest, res: Response) => {
      try {
        runtime.adminSuspendSideBet(
          String(req.params.boardId ?? ''),
          String(req.params.betId ?? ''),
          req.adminClaims!.sub
        );
        res.json({ ok: true, store: runtime.getSanitizedAdminStore() });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to suspend side bet.' });
      }
    }
  );

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      storage: useJsonStorage ? 'json' : 'sqlite',
      version: runtime.getVersion(),
    });
  });

  // --- Frontend Serving (Vite Dev Middleware or Dist) ---
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.warn('[BetSpot] WARNING: dist/index.html not found. Run "npm run build" before starting in production.');
    }
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true })
    );
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const typedErr = err as { type?: string; status?: number; statusCode?: number } | null;
    if (typedErr?.type === 'entity.too.large' || typedErr?.status === 413 || typedErr?.statusCode === 413) {
      res.status(413).json({
        error: 'Upload payload is too large. Please use an image under 15 MB.',
      });
      return;
    }
    if (typedErr?.type === 'entity.parse.failed' || typedErr?.status === 400) {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`  BetSpot Server is LIVE & READY!`);
    console.log(`  ➜ Local URL:   http://localhost:${PORT}/`);
    console.log(`  ➜ Network URL: http://127.0.0.1:${PORT}/`);
    console.log(`==================================================\n`);
  });

  let shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[BetSpot] Received ${signal}, shutting down cleanly...`);
    if (backupTimer) clearInterval(backupTimer);
    runtime.stop();
    sseHub.stop();
    server.close(() => {
      if (platformRepo instanceof SqlitePlatformRepository) {
        platformRepo.close();
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Failed to start BetSpot server:', err);
  process.exit(1);
});
