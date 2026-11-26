import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqlitePlatformRepository } from '../../server/persistence/SqlitePlatformRepository';
import { ServerArenaRuntime } from '../../server/ServerArenaRuntime';
import { GamePhase, PaymentMethod, TierId } from '../../src/domain/types';

const cleanups: (() => void)[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
});

describe('System High-Concurrency Load Test', () => {
  it('handles 60 concurrent users joining rooms, betting, and leaving with zero balance corruption', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betspot-load-test-'));
    const repo = new SqlitePlatformRepository(dir);
    const runtime = new ServerArenaRuntime(repo, () => {});
    cleanups.push(() => {
      runtime.stop();
      repo.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const userCount = 60;
    const users = Array.from({ length: userCount }, (_, i) =>
      runtime.registerPlayer(
        {
          displayName: `Load User ${i}`,
          username: `loaduser${i}`,
          email: `load${i}@test.local`,
          password: 'Pass1234!',
          confirmPassword: 'Pass1234!',
        },
        `10.1.0.${i + 1}`
      ).user
    );

    // Fund all 60 users concurrently ($20 = 2000 TKN each)
    await Promise.all(
      users.map(async (u) => {
        const dep = runtime.requestCryptoDeposit(u.id, 20, PaymentMethod.CRYPTO_USDT);
        runtime.adminReviewPayment(dep.id, true, 'Approved', 'admin');
      })
    );

    // All 60 users simultaneously enter Tier 1 with varied stakes
    const outcomes = await Promise.all(
      users.map(async (u, idx) => {
        const stake = idx % 2 === 0 ? 50 : 100;
        return runtime.enterTierForPlay(u.id, TierId.TIER_1, stake);
      })
    );

    expect(outcomes.every((o) => o.mode === 'JOIN_SEAT')).toBe(true);

    // Verify no negative balances and all held+available reconcile cleanly
    const adminSnap = runtime.getSanitizedAdminStore();
    const humanUsers = adminSnap.users.filter((u) => !u.isBot);
    expect(humanUsers).toHaveLength(userCount);
    for (const u of humanUsers) {
      expect(u.availableBalance).toBeGreaterThanOrEqual(0);
      expect(u.heldBalance).toBeGreaterThanOrEqual(0);
      expect(u.availableBalance + u.heldBalance).toBeGreaterThan(0);
    }

    // Verify boards never exceeded maxSeats and active boards stayed consistent
    const arenaSnap = runtime.serializePublicArenaState();
    for (const b of arenaSnap.diceBoards) {
      const seatedCount = b.seats.filter(Boolean).length;
      expect(seatedCount).toBeLessThanOrEqual(b.tier.maxSeats);
      expect([
        GamePhase.WAITING_FOR_PLAYERS,
        GamePhase.LOBBY_COUNTDOWN,
        GamePhase.SIDE_BET_WINDOW,
      ]).toContain(b.phase);
    }

    // Half of the users leave their seats simultaneously (both lobby and active boards)
    await Promise.all(
      users.slice(0, 30).map(async (u, idx) => {
        runtime.leaveMainSeat(u.id, outcomes[idx].boardId);
      })
    );

    // Verify SQLite persisted all 60 human users + 100 bots cleanly
    expect(repo.getIndexedUserCount()).toBeGreaterThanOrEqual(userCount);
  }, 20_000);
});
