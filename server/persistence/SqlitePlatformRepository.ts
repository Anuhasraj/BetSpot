import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { IRepository } from '../../src/core/contracts';
import { PlatformStoreData } from '../ServerTypes';
import { JsonFilePlatformRepository } from './JsonFilePlatformRepository';

/**
 * ACID-compliant SQLite persistence repository using Node's built-in `node:sqlite` (WAL mode).
 * Automatically migrates any existing `JsonFilePlatformRepository` data on first boot.
 */
export class SqlitePlatformRepository implements IRepository<PlatformStoreData> {
  private readonly dbPath: string;
  private readonly db: DatabaseSync;
  private readonly jsonFallbackRepo: JsonFilePlatformRepository;

  constructor(dataDir: string, dbFileName = 'betspot.sqlite') {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, dbFileName);
    this.jsonFallbackRepo = new JsonFilePlatformRepository(dataDir);
    this.db = new DatabaseSync(this.dbPath);

    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS platform_state (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users_index (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL,
        available_balance REAL NOT NULL,
        held_balance REAL NOT NULL,
        is_bot INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users_index(username);
    `);
  }

  public get databasePath(): string {
    return this.dbPath;
  }

  public load(): PlatformStoreData {
    const row = this.db
      .prepare('SELECT payload FROM platform_state WHERE id = ?')
      .get('primary') as { payload?: string } | undefined;

    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as Partial<PlatformStoreData>;
      return this.jsonFallbackRepo.sanitizeLoadedData(parsed);
    }

    // One-time seamless migration from legacy JSON store (or fresh defaults)
    const initial = this.jsonFallbackRepo.load();
    this.save(initial);
    return initial;
  }

  public save(data: PlatformStoreData): void {
    const now = Date.now();
    const payload = JSON.stringify(data);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO platform_state (id, payload, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             payload = excluded.payload,
             updated_at = excluded.updated_at`
        )
        .run('primary', payload, now);

      const upsertUser = this.db.prepare(
        `INSERT INTO users_index (id, username, email, role, available_balance, held_balance, is_bot, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           email = excluded.email,
           role = excluded.role,
           available_balance = excluded.available_balance,
           held_balance = excluded.held_balance,
           is_bot = excluded.is_bot,
           updated_at = excluded.updated_at`
      );

      for (const u of data.users) {
        upsertUser.run(
          u.id,
          u.username,
          u.email ?? null,
          u.role,
          u.availableBalance,
          u.heldBalance,
          u.isBot ? 1 : 0,
          now
        );
      }

      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if transaction was already closed
      }
      throw err;
    }
  }

  public getIndexedUserCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM users_index')
      .get() as { cnt?: number } | undefined;
    return Number(row?.cnt ?? 0);
  }

  /**
   * Creates a consistent daily SQLite backup using VACUUM INTO and prunes old backups.
   */
  public runDailyBackup(maxBackupsToKeep = 14): string {
    const backupDir = path.join(path.dirname(this.dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const dateTag = new Date().toISOString().slice(0, 10);
    const targetFile = path.join(backupDir, `betspot-${dateTag}.sqlite`);
    if (!fs.existsSync(targetFile)) {
      const escapedPath = targetFile.replace(/'/g, "''");
      this.db.exec(`VACUUM INTO '${escapedPath}'`);
    }

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('betspot-') && f.endsWith('.sqlite'))
      .sort();
    while (files.length > maxBackupsToKeep) {
      const oldest = files.shift()!;
      try {
        fs.unlinkSync(path.join(backupDir, oldest));
      } catch {
        // Ignore cleanup errors
      }
    }
    return targetFile;
  }

  public close(): void {
    this.db.close();
  }
}
