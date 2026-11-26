import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PasswordHasher } from '../security/SecurityServices';

export interface StoredAdminCredential {
  username: string;
  salt: string;
  hash: string;
  claimedAt: number;
}

export class AdminCredentialRepository {
  private readonly dataDir: string;
  private readonly authFile: string;
  private readonly hasher: PasswordHasher;

  constructor(dataDir: string, hasher: PasswordHasher) {
    this.dataDir = dataDir;
    this.authFile = path.join(dataDir, 'admin-auth.json');
    this.hasher = hasher;
  }

  private stripQuotes(val: string): string {
    const trimmed = val.trim();
    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  public getEnvConfig(): { configured: boolean; username: string; passcode: string } {
    const rawPasscode = this.stripQuotes(process.env.ADMIN_PASSCODE ?? '');
    const isPlaceholder =
      rawPasscode.length === 0 ||
      /^MY_/i.test(rawPasscode) ||
      rawPasscode.toUpperCase() === 'CHANGEME';
    const passcode = isPlaceholder ? '' : rawPasscode;
    const username = this.stripQuotes(process.env.ADMIN_USERNAME ?? '') || 'admin';
    return {
      configured: passcode.length > 0,
      username,
      passcode,
    };
  }

  public readClaimed(): StoredAdminCredential | null {
    try {
      if (!fs.existsSync(this.authFile)) return null;
      const parsed = JSON.parse(fs.readFileSync(this.authFile, 'utf8')) as Partial<StoredAdminCredential>;
      if (
        typeof parsed.username === 'string' &&
        typeof parsed.salt === 'string' &&
        typeof parsed.hash === 'string' &&
        parsed.username.length >= 3 &&
        parsed.salt.length >= 16 &&
        parsed.hash.length >= 64
      ) {
        return {
          username: parsed.username,
          salt: parsed.salt,
          hash: parsed.hash,
          claimedAt: typeof parsed.claimedAt === 'number' ? parsed.claimedAt : Date.now(),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  public writeClaimed(cred: StoredAdminCredential, allowOverwrite = false): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempPath = `${this.authFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(cred, null, 2), { encoding: 'utf8', mode: 0o600 });
    if (!allowOverwrite && fs.existsSync(this.authFile)) {
      fs.unlinkSync(tempPath);
      throw new Error('Admin credentials have already been claimed.');
    }
    fs.renameSync(tempPath, this.authFile);
  }

  public getStatus(): {
    configuredViaEnv: boolean;
    isClaimed: boolean;
    needsSetup: boolean;
    adminUsernameHint: string | null;
  } {
    const envCfg = this.getEnvConfig();
    if (envCfg.configured) {
      return {
        configuredViaEnv: true,
        isClaimed: true,
        needsSetup: false,
        adminUsernameHint: null,
      };
    }
    const claimed = this.readClaimed();
    return {
      configuredViaEnv: false,
      isClaimed: Boolean(claimed),
      needsSetup: !claimed,
      adminUsernameHint: null,
    };
  }

  public claimInitialAdmin(username: string, password: string): void {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hasher.hashScrypt(password, salt);
    this.writeClaimed({ username, salt, hash, claimedAt: Date.now() }, false);
  }

  public verifyLogin(usernameInput: string, passwordInput: string): {
    ok: boolean;
    username?: string;
    configuredViaEnv: boolean;
    notClaimed?: boolean;
  } {
    const envCfg = this.getEnvConfig();
    if (envCfg.configured) {
      const envUserMatch = usernameInput.toLowerCase() === envCfg.username.toLowerCase();
      const envPassMatch = this.hasher.constantTimeEquals(passwordInput, envCfg.passcode);
      return envUserMatch && envPassMatch
        ? { ok: true, username: envCfg.username, configuredViaEnv: true }
        : { ok: false, configuredViaEnv: true };
    }

    const claimed = this.readClaimed();
    if (!claimed) {
      return { ok: false, configuredViaEnv: false, notClaimed: true };
    }
    const userMatch = usernameInput.toLowerCase() === claimed.username.toLowerCase();
    const passMatch = this.hasher.verifyScrypt(passwordInput, claimed.salt, claimed.hash);
    return userMatch && passMatch
      ? { ok: true, username: claimed.username, configuredViaEnv: false }
      : { ok: false, configuredViaEnv: false };
  }

  public rotateCredentials(
    currentPassword: string,
    newUsername: string | undefined,
    newPassword: string
  ): string {
    const claimed = this.readClaimed();
    if (!claimed) {
      throw new Error('Admin portal credentials have not been claimed yet.');
    }
    if (!this.hasher.verifyScrypt(currentPassword, claimed.salt, claimed.hash)) {
      throw new Error('Current Admin password is incorrect.');
    }
    const targetUsername =
      newUsername && newUsername.trim().length > 0 ? newUsername.trim() : claimed.username;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hasher.hashScrypt(newPassword, salt);
    this.writeClaimed(
      { username: targetUsername, salt, hash, claimedAt: claimed.claimedAt },
      true
    );
    return targetUsername;
  }
}
