import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonFilePlatformRepository } from '../../server/persistence/JsonFilePlatformRepository';
import { SqlitePlatformRepository } from '../../server/persistence/SqlitePlatformRepository';
import { UserRole, UserStatus } from '../../src/domain/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betspot-sqlite-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('SQLite Persistence Integration Tests', () => {
  it('saves and loads platform state atomically and indexes users', () => {
    const dir = makeTempDir();
    const repo = new SqlitePlatformRepository(dir);

    const store = repo.load();
    expect(store.users).toEqual([]);

    store.users.push({
      id: 'usr_1',
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash1',
      avatarUrl: '/a.png',
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      availableBalance: 2500,
      heldBalance: 150,
      transactions: [],
      createdAt: Date.now(),
      isBot: false,
    });
    store.botPoolBalanceTokens = 42000;
    repo.save(store);
    expect(repo.getIndexedUserCount()).toBe(1);
    repo.close();

    // Reopen fresh instance and verify persistence
    const repo2 = new SqlitePlatformRepository(dir);
    const loaded = repo2.load();
    expect(loaded.users).toHaveLength(1);
    expect(loaded.users[0].username).toBe('alice');
    expect(loaded.users[0].availableBalance).toBe(2500);
    expect(loaded.botPoolBalanceTokens).toBe(42000);
    repo2.close();
  });

  it('migrates legacy JsonFilePlatformRepository data automatically on first boot', () => {
    const dir = makeTempDir();
    const jsonRepo = new JsonFilePlatformRepository(dir);
    const legacy = JsonFilePlatformRepository.createEmptyStore();
    legacy.botPoolBalanceTokens = 77777;
    legacy.users.push({
      id: 'usr_legacy',
      username: 'legacy_user',
      displayName: 'Legacy',
      email: 'legacy@example.com',
      passwordHash: 'hash_leg',
      avatarUrl: '/l.png',
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      availableBalance: 900,
      heldBalance: 0,
      transactions: [],
      createdAt: Date.now(),
      isBot: false,
    });
    jsonRepo.save(legacy);

    const sqliteRepo = new SqlitePlatformRepository(dir);
    const migrated = sqliteRepo.load();
    expect(migrated.botPoolBalanceTokens).toBe(77777);
    expect(migrated.users).toHaveLength(1);
    expect(migrated.users[0].username).toBe('legacy_user');
    expect(sqliteRepo.getIndexedUserCount()).toBe(1);
    sqliteRepo.close();
  });
});
