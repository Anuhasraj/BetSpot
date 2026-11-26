import crypto from 'crypto';
import { Request, Response } from 'express';
import { DADUKETA_FACES, DADUKETA_OPPOSITES } from '../../src/domain/constants';
import { DiceFace, IRandomGenerator } from '../../src/domain/types';

export interface AdminTokenClaims {
  sub: string;
  role: 'ADMIN';
  jti: string;
  iat: number;
  exp: number;
}

export interface PlayerTokenClaims {
  sub: string;
  role: 'PLAYER';
  jti: string;
  iat: number;
  exp: number;
}

export interface StreamTicketClaims {
  sub: string | null;
  kind: 'SSE_TICKET';
  iat: number;
  exp: number;
}

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

export class PasswordHasher {
  public hashScrypt(password: string, saltHex: string): string {
    return crypto.scryptSync(password, saltHex, 64).toString('hex');
  }

  public verifyScrypt(password: string, saltHex: string, expectedHashHex: string): boolean {
    try {
      const computed = crypto.scryptSync(password, saltHex, 64);
      const expected = Buffer.from(expectedHashHex, 'hex');
      if (computed.length !== expected.length) return false;
      return crypto.timingSafeEqual(computed, expected);
    } catch {
      return false;
    }
  }

  public constantTimeEquals(a: string, b: string): boolean {
    const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
    const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(digestA, digestB);
  }
}

export class NodeCryptoRandomGenerator implements IRandomGenerator {
  public nextIntInclusive(min: number, max: number): number {
    if (min > max) throw new Error('Invalid RNG bounds');
    return crypto.randomInt(min, max + 1);
  }

  public rollDaduketaFace(): DiceFace {
    return DADUKETA_FACES[crypto.randomInt(0, DADUKETA_FACES.length)];
  }

  public getOppositeFace(face: DiceFace): DiceFace {
    return DADUKETA_OPPOSITES[face];
  }
}

export class HmacTokenService {
  private readonly secret: string;
  private readonly revokedTokenIds = new Map<string, number>();

  public static readonly ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  public static readonly PLAYER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  public static readonly STREAM_TICKET_TTL_MS = 60 * 1000;

  constructor(secret?: string) {
    this.secret = secret?.trim() || crypto.randomBytes(32).toString('hex');
  }

  public revokeTokenId(jti: string, expMs: number): void {
    const now = Date.now();
    if (this.revokedTokenIds.size > 1000) {
      for (const [id, exp] of this.revokedTokenIds.entries()) {
        if (exp <= now) this.revokedTokenIds.delete(id);
      }
    }
    this.revokedTokenIds.set(jti, expMs);
  }

  private isTokenRevoked(jti: string): boolean {
    const exp = this.revokedTokenIds.get(jti);
    if (exp === undefined) return false;
    if (Date.now() >= exp) {
      this.revokedTokenIds.delete(jti);
      return false;
    }
    return true;
  }

  private sign<T extends object>(claims: T): string {
    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const sigB64 = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${sigB64}`;
  }

  private verify<T>(token: string): T | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const expectedSigB64 = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');
    const sigBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  public signAdminToken(username: string): { token: string; claims: AdminTokenClaims } {
    const now = Date.now();
    const claims: AdminTokenClaims = {
      sub: username,
      role: 'ADMIN',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + HmacTokenService.ADMIN_SESSION_TTL_MS,
    };
    return { token: this.sign(claims), claims };
  }

  public verifyAdminToken(token: string): AdminTokenClaims | null {
    const parsed = this.verify<AdminTokenClaims>(token);
    if (
      !parsed ||
      parsed.role !== 'ADMIN' ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() >= parsed.exp || this.isTokenRevoked(parsed.jti)) return null;
    return parsed;
  }

  public signPlayerToken(userId: string): { token: string; claims: PlayerTokenClaims } {
    const now = Date.now();
    const claims: PlayerTokenClaims = {
      sub: userId,
      role: 'PLAYER',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + HmacTokenService.PLAYER_SESSION_TTL_MS,
    };
    return { token: this.sign(claims), claims };
  }

  public verifyPlayerToken(token: string): PlayerTokenClaims | null {
    const parsed = this.verify<PlayerTokenClaims>(token);
    if (
      !parsed ||
      parsed.role !== 'PLAYER' ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() >= parsed.exp || this.isTokenRevoked(parsed.jti)) return null;
    return parsed;
  }

  public signStreamTicket(userId: string | null): string {
    const now = Date.now();
    const claims: StreamTicketClaims = {
      sub: userId,
      kind: 'SSE_TICKET',
      iat: now,
      exp: now + HmacTokenService.STREAM_TICKET_TTL_MS,
    };
    return this.sign(claims);
  }

  public verifyStreamTicket(ticket: string): StreamTicketClaims | null {
    const parsed = this.verify<StreamTicketClaims>(ticket);
    if (!parsed || parsed.kind !== 'SSE_TICKET' || typeof parsed.exp !== 'number') return null;
    if (Date.now() >= parsed.exp) return null;
    return parsed;
  }
}

export class GoogleIdTokenVerifier {
  private readonly projectId: string;
  private cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  private async fetchCerts(): Promise<Record<string, string>> {
    const now = Date.now();
    if (this.cachedCerts && now < this.cachedCerts.expiresAt) {
      return this.cachedCerts.certs;
    }
    const res = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    if (!res.ok) {
      throw new Error('Unable to verify Google identity certificates.');
    }
    const certs = (await res.json()) as Record<string, string>;
    const cc = res.headers.get('cache-control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cc);
    const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1000 : 300_000;
    this.cachedCerts = { certs, expiresAt: now + ttlMs };
    return certs;
  }

  public async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid Google ID token.');
    }
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) {
      throw new Error('Unsupported Google ID token algorithm.');
    }

    const certs = await this.fetchCerts();
    const certPem = certs[header.kid];
    if (!certPem) {
      throw new Error('Google signing certificate not found for token key ID.');
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(certPem, Buffer.from(sigB64, 'base64url'))) {
      throw new Error('Invalid Google ID token signature.');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== this.projectId) {
      throw new Error('Google ID token audience mismatch.');
    }
    if (payload.iss !== `https://securetoken.google.com/${this.projectId}`) {
      throw new Error('Google ID token issuer mismatch.');
    }
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      throw new Error('Google ID token has expired.');
    }
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
      throw new Error('Invalid Google ID token issued timestamp.');
    }
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new Error('Verified Google email address is required.');
    }

    return {
      uid: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  }
}

export class SlidingWindowRateLimiter {
  private readonly failuresByKey = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 10 * 60 * 1000
  ) {}

  public isLimited(key: string): boolean {
    const entry = this.failuresByKey.get(key);
    if (!entry) return false;
    if (Date.now() - entry.windowStart > this.windowMs) {
      this.failuresByKey.delete(key);
      return false;
    }
    return entry.count >= this.maxAttempts;
  }

  public recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.failuresByKey.get(key);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.failuresByKey.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  public clear(key: string): void {
    this.failuresByKey.delete(key);
  }
}

export class HttpSessionSecurity {
  public static readonly PLAYER_COOKIE_NAME = 'betspot_player_session';

  public static extractBearerToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : null;
  }

  public static parseCookieValue(req: Request, name: string): string | null {
    const raw = req.headers.cookie;
    if (typeof raw !== 'string' || !raw) return null;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      if (part.slice(0, idx).trim() === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return null;
  }

  public static isSecureRequest(req: Request): boolean {
    return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  }

  public static setPlayerCookie(req: Request, res: Response, token: string): void {
    const maxAgeSec = Math.floor(HmacTokenService.PLAYER_SESSION_TTL_MS / 1000);
    const attrs = HttpSessionSecurity.isSecureRequest(req)
      ? `HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAgeSec}`
      : `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
    res.setHeader('Set-Cookie', `${HttpSessionSecurity.PLAYER_COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs}`);
  }

  public static clearPlayerCookie(req: Request, res: Response): void {
    const attrs = HttpSessionSecurity.isSecureRequest(req)
      ? 'HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0'
      : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    res.setHeader('Set-Cookie', `${HttpSessionSecurity.PLAYER_COOKIE_NAME}=; ${attrs}`);
  }

  public static hasValidSameOriginForCookieMutation(req: Request): boolean {
    const host = req.headers.host;
    if (!host) return false;
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (origin) {
      try {
        return new URL(origin).host === host;
      } catch {
        return false;
      }
    }
    const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
    if (referer) {
      try {
        return new URL(referer).host === host;
      } catch {
        return false;
      }
    }
    return false;
  }

  public static getClientIpHash(req: Request): string {
    const raw =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : '') ||
      req.ip ||
      'unknown';
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
  }
}

export function sanitizeImageDataUrl(val: unknown): string | undefined {
  if (typeof val !== 'string' || !val) return undefined;
  if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(val) && val.length <= 4_000_000) {
    return val;
  }
  return undefined;
}
