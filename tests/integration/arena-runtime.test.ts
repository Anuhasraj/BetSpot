import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqlitePlatformRepository } from '../../server/persistence/SqlitePlatformRepository';
import { ServerArenaRuntime } from '../../server/ServerArenaRuntime';
import { ApprovalStatus, GamePhase, PaymentMethod, SideBetCategory, TierId } from '../../src/domain/types';

const cleanups: (() => void)[] = [];

function createRuntime(): { runtime: ServerArenaRuntime; repo: SqlitePlatformRepository } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betspot-runtime-test-'));
  const repo = new SqlitePlatformRepository(dir);
  const runtime = new ServerArenaRuntime(repo, () => {});
  cleanups.push(() => {
    runtime.stop();
    repo.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { runtime, repo };
}

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
});

describe('ServerArenaRuntime Integration Tests', () => {
  it('supports registration, deposit, smart room allocation, free seated side-betting, and empty room close', () => {
    const { runtime } = createRuntime();
    const u1 = runtime.registerPlayer(
      {
        displayName: 'Kamal Perera',
        username: 'kamal',
        email: 'kamal@test.local',
        password: 'Pass1234!',
        confirmPassword: 'Pass1234!',
      },
      '10.0.0.1'
    ).user;
    const u2 = runtime.registerPlayer(
      {
        displayName: 'Nimal Silva',
        username: 'nimal',
        email: 'nimal@test.local',
        password: 'Pass1234!',
        confirmPassword: 'Pass1234!',
      },
      '10.0.0.2'
    ).user;

    // Deposit real tokens ($10 = 1000 TKN) for both players
    const dep1 = runtime.requestCryptoDeposit(u1.id, 10, PaymentMethod.CRYPTO_USDT);
    const dep2 = runtime.requestCryptoDeposit(u2.id, 10, PaymentMethod.CRYPTO_USDT);
    runtime.adminReviewPayment(dep1.id, true, 'Approved', 'admin');
    runtime.adminReviewPayment(dep2.id, true, 'Approved', 'admin');

    // Player 1 enters Tier 1 with 100 TKN -> waits in LOBBY_COUNTDOWN
    const enter1 = runtime.enterTierForPlay(u1.id, TierId.TIER_1, 100);
    expect(enter1.mode).toBe('JOIN_SEAT');
    const board1 = runtime.serializePublicArenaState().diceBoards.find((b) => b.id === enter1.boardId)!;
    expect(board1.phase).toBe(GamePhase.LOBBY_COUNTDOWN);

    // Player 2 enters Tier 1 with 50 TKN (< 100 currentMinBet) -> smart allocation must NOT disrupt board1's 100 TKN stake!
    const enterLow = runtime.enterTierForPlay(u2.id, TierId.TIER_1, 50);
    expect(enterLow.boardId).not.toBe(enter1.boardId);
    runtime.leaveMainSeat(u2.id, enterLow.boardId);

    // Player 2 enters Tier 1 with 100 TKN -> matches into board1 and starts SIDE_BET_WINDOW (45s) immediately!
    const enter2 = runtime.enterTierForPlay(u2.id, TierId.TIER_1, 100);
    expect(enter2.boardId).toBe(enter1.boardId);
    const activeBoard = runtime.serializePublicArenaState().diceBoards.find((b) => b.id === enter1.boardId)!;
    expect(activeBoard.phase).toBe(GamePhase.SIDE_BET_WINDOW);
    expect(activeBoard.activeSideBetRound?.secondsRemaining).toBe(45);

    // Main game seated player places a side bet with zero entry fee
    const sb = runtime.placeSideBetBatch(u1.id, enter1.boardId, [
      { category: SideBetCategory.LOW_HIGH, option: 'HIGH', amount: 30 },
    ]);
    expect(sb.placedCount).toBe(1);
  });

  it('sets exact balance and burns surplus on Bot Pool without ever adding tokens', () => {
    const { runtime } = createRuntime();
    const initialPool = runtime.getSanitizedAdminStore().botPoolBalanceTokens;
    expect(initialPool).toBe(50000);

    // SET exact balance to 12000
    runtime.adminAdjustBotPool('SET', 12000, 'admin', 'Exact balance test');
    expect(runtime.getSanitizedAdminStore().botPoolBalanceTokens).toBe(12000);

    // BURN_SURPLUS 2000 -> reduces to 10000 (never adds!)
    runtime.adminAdjustBotPool('BURN_SURPLUS', 2000, 'admin', 'Burn test');
    expect(runtime.getSanitizedAdminStore().botPoolBalanceTokens).toBe(10000);
  });

  it('enforces Golden Rule withdrawal rejection with generic message', () => {
    const { runtime } = createRuntime();
    // Promo-only user (0 real deposits)
    const u = runtime.registerPlayer(
      {
        displayName: 'Promo Player',
        username: 'promouser',
        email: 'promo@test.local',
        password: 'Pass1234!',
        confirmPassword: 'Pass1234!',
      },
      '10.0.0.3'
    ).user;
    runtime.adminManualTopUp({
      userId: u.id,
      amountTokens: 3500,
      reason: 'Promo bonus',
      fundingSource: 'PROMO',
      referenceCode: 'PR-1',
      adminUsername: 'admin',
    });

    const w = runtime.requestWithdrawal(u.id, 3000, PaymentMethod.CRYPTO_USDT, 'TRC20-TEST-ADDR');
    expect(w.status).toBe(ApprovalStatus.PENDING);

    runtime.adminReviewPayment(w.id, false, 'Contact Customer Care', 'admin');
    const updated = runtime.getSanitizedAdminStore().payments.find((p) => p.id === w.id)!;
    expect(updated.status).toBe(ApprovalStatus.REJECTED);
    expect(updated.adminNote).toBe('Contact Customer Care');
  });
});
