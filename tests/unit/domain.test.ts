import { describe, expect, it } from 'vitest';
import { DiceBoard } from '../../src/domain/DiceBoard';
import { DEFAULT_BOT_CONFIG } from '../../src/domain/BotRiskTypes';
import { TierFeeStrategy, TokenEconomy } from '../../src/domain/TokenEconomy';
import {
  DiceFace,
  GamePhase,
  IRandomGenerator,
  SideBetCategory,
  TierId,
  UserRole,
  UserStatus,
} from '../../src/domain/types';
import { User } from '../../src/domain/User';
import { BOT_STEALTH_PROFILES, BotSimulationService } from '../../src/services/BotSimulationService';

class DeterministicRandom implements IRandomGenerator {
  private idx = 0;
  constructor(private readonly sequence: DiceFace[]) {}
  public nextIntInclusive(min: number, _max: number): number {
    return min;
  }
  public rollDaduketaFace(): DiceFace {
    const face = this.sequence[this.idx % this.sequence.length];
    this.idx += 1;
    return face;
  }
  public getOppositeFace(face: DiceFace): DiceFace {
    return (21 - face) as DiceFace;
  }
}

function makePlayer(id: string, username: string, balance = 5000): User {
  return new User({
    id,
    username,
    displayName: username,
    email: `${username}@test.local`,
    passwordHash: 'hash',
    avatarUrl: '/avatar.png',
    role: UserRole.PLAYER,
    status: UserStatus.ACTIVE,
    initialBalance: balance,
    isBot: false,
  });
}

describe('Domain Unit Tests', () => {
  it('enforces Wallet hold, release, loss, and win invariants', () => {
    const user = makePlayer('u1', 'alpha', 1000);
    user.wallet.holdTokens(300, 'Seat hold', 'b1');
    expect(user.wallet.availableBalance).toBe(700);
    expect(user.wallet.heldBalance).toBe(300);

    user.wallet.releaseHoldToAvailable(100, 'Partial refund', undefined, 'b1');
    expect(user.wallet.availableBalance).toBe(800);
    expect(user.wallet.heldBalance).toBe(200);

    expect(() => user.wallet.holdTokens(900, 'Too much')).toThrow();
  });

  it('calculates Tier 1-6 winner fees accurately via TierFeeStrategy', () => {
    const strategy = new TierFeeStrategy();
    // Tier 1: 1% fee on 60 TKN pot (two 30 TKN bets) => 1 TKN (rounded) or exact
    const t1 = strategy.calculateWinnerFee(60, 30, TierId.TIER_1);
    expect(t1.feeRate).toBe(0.01);
    expect(t1.feeAmount + t1.netPayout).toBe(60);

    const t6 = strategy.calculateWinnerFee(300000, 150000, TierId.TIER_6);
    expect(t6.feeRate).toBe(0.3);
    expect(t6.feeAmount).toBe(90000);
    expect(t6.netPayout).toBe(210000);
  });

  it('uses 45s side-bet window and 1-7s random bot turn delay', () => {
    expect(DiceBoard.SIDE_BET_WINDOW_SECONDS).toBe(45);
    for (let i = 0; i < 30; i += 1) {
      const delay = DiceBoard.randomBotTurnDelaySeconds();
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(7);
    }
  });

  it('prevents unrolled left player from winning, while preserving rolled left player result', () => {
    const strategy = new TierFeeStrategy();
    const tier = strategy.getTierById(TierId.TIER_1);
    const users = new Map<string, User>();
    const p1 = makePlayer('u1', 'player1', 1000);
    const p2 = makePlayer('u2', 'player2', 1000);
    users.set(p1.id, p1);
    users.set(p2.id, p2);

    // Case A: p1 leaves BEFORE rolling -> p1 cannot roll or win, p2 wins
    const boardA = new DiceBoard('bA', tier, new DeterministicRandom([3, 18]), strategy, 1);
    boardA.joinMainSeat(p1, 100);
    boardA.joinMainSeat(p2, 100);
    boardA.startMatchIfReady((id) => users.get(id));
    expect(boardA.phase).toBe(GamePhase.SIDE_BET_WINDOW);

    boardA.leaveMainSeat(p1, (id) => users.get(id));
    expect(boardA.occupiedSeats[0].hasLeftMatch).toBe(true);
    expect(boardA.occupiedSeats[0].rollValue).toBeNull();
    // Turn should have advanced to p2
    expect(boardA.currentTurnSeatIndex).toBe(1);

    boardA.closeSideBetWindowAndAdvanceTurn();
    boardA.rollForCurrentPlayer((id) => users.get(id)); // p2 rolls 3
    expect(boardA.phase).toBe(GamePhase.SETTLED);
    expect(boardA.matchHistory[0].winnerUserId).toBe(p2.id);

    // Case B: p3 rolls 18, then leaves -> p4 rolls 6 -> p3 still wins and receives tokens
    const p3 = makePlayer('u3', 'player3', 1000);
    const p4 = makePlayer('u4', 'player4', 1000);
    users.set(p3.id, p3);
    users.set(p4.id, p4);

    const boardB = new DiceBoard('bB', tier, new DeterministicRandom([18, 6]), strategy, 2);
    boardB.joinMainSeat(p3, 100);
    boardB.joinMainSeat(p4, 100);
    boardB.startMatchIfReady((id) => users.get(id));
    boardB.closeSideBetWindowAndAdvanceTurn();
    boardB.rollForCurrentPlayer((id) => users.get(id)); // p3 rolls 18
    boardB.leaveMainSeat(p3, (id) => users.get(id)); // leaves after rolling
    boardB.closeSideBetWindowAndAdvanceTurn();
    boardB.rollForCurrentPlayer((id) => users.get(id)); // p4 rolls 6

    expect(boardB.phase).toBe(GamePhase.SETTLED);
    expect(boardB.matchHistory[0].winnerUserId).toBe(p3.id);
    expect(p3.wallet.availableBalance).toBeGreaterThan(1000);
  });

  it('preserves initialRollValue and tieBreakerRolls and resets history per match', () => {
    const strategy = new TierFeeStrategy();
    const tier = strategy.getTierById(TierId.TIER_1);
    const users = new Map<string, User>();
    const p1 = makePlayer('u1', 'p1', 1000);
    const p2 = makePlayer('u2', 'p2', 1000);
    users.set(p1.id, p1);
    users.set(p2.id, p2);

    // Round 1: both roll 12 (tie!), Tie-breaker: p1 rolls 15, p2 rolls 9
    const board = new DiceBoard('b1', tier, new DeterministicRandom([12, 12, 15, 9]), strategy, 1);
    board.joinMainSeat(p1, 50);
    board.joinMainSeat(p2, 50);
    board.startMatchIfReady((id) => users.get(id));

    board.closeSideBetWindowAndAdvanceTurn();
    board.rollForCurrentPlayer((id) => users.get(id)); // p1 -> 12
    board.closeSideBetWindowAndAdvanceTurn();
    board.rollForCurrentPlayer((id) => users.get(id)); // p2 -> 12 (triggers tie-breaker)

    expect(board.phase).toBe(GamePhase.SIDE_BET_WINDOW);
    expect(board.tieBreakerUserIds).toEqual([p1.id, p2.id]);

    board.closeSideBetWindowAndAdvanceTurn();
    board.rollForCurrentPlayer((id) => users.get(id)); // p1 TB -> 15
    board.closeSideBetWindowAndAdvanceTurn();
    board.rollForCurrentPlayer((id) => users.get(id)); // p2 TB -> 9

    expect(board.phase).toBe(GamePhase.SETTLED);
    expect(board.seats[0]?.initialRollValue).toBe(12);
    expect(board.seats[0]?.tieBreakerRolls).toEqual([15]);
    expect(board.seats[1]?.initialRollValue).toBe(12);
    expect(board.seats[1]?.tieBreakerRolls).toEqual([9]);
    expect(board.rollHistory.length).toBe(4);
    expect(board.matchHistory.length).toBe(1);

    // Resetting for next match clears all per-match histories
    board.resetForNextMatch();
    expect(board.rollHistory).toEqual([]);
    expect(board.pastSideBetReports).toEqual([]);
    expect(board.matchHistory).toEqual([]);
    expect(board.lastRoll).toBeNull();
  });

  it('uses single-part bot usernames and supports organic bot side-bets', () => {
    for (const profile of BOT_STEALTH_PROFILES) {
      expect(profile.username).not.toContain('_');
      expect(profile.username.length).toBeGreaterThan(1);
    }

    const botService = new BotSimulationService();
    const users = new Map<string, User>();
    const bots = botService.seedBotAccounts(users);
    const human = makePlayer('h1', 'human1', 5000);
    users.set(human.id, human);

    const strategy = new TierFeeStrategy();
    const tier = strategy.getTierById(TierId.TIER_1);
    const board = new DiceBoard('b_bot', tier, new DeterministicRandom([6, 12]), strategy, 1);
    board.joinMainSeat(human, 50);

    const summary = {
      poolBalanceTokens: 50000,
      totalMatchesPlayed: 0,
      botWins: 0,
      botLosses: 0,
      netBotPnlTokens: 0,
      hourlyNetPnlTokens: 0,
      dailyNetPnlTokens: 0,
      hourlyLossUsedTokens: 0,
      dailyLossUsedTokens: 0,
      consecutiveLosses: 0,
      cooldownMatchesRemaining: 0,
      isAutoPaused: false,
      autoPausedReason: null,
      activeBotSeats: 0,
    };

    const addedBots = botService.addBotsToBoard(board, bots, DEFAULT_BOT_CONFIG, summary);
    expect(addedBots.length).toBeGreaterThanOrEqual(1);
    expect(addedBots.length).toBeLessThanOrEqual(board.maxSeats - 1);

    board.startMatchIfReady((id) => users.get(id));
    const placedSide = botService.placeAutomatedBotSideBets(
      board,
      bots,
      DEFAULT_BOT_CONFIG,
      summary
    );
    expect(placedSide).toBe(true);
    expect(board.activeSideBetRound?.bets.length).toBeGreaterThanOrEqual(1);
    expect(
      board.activeSideBetRound?.bets.some((b) =>
        [SideBetCategory.LOW_HIGH, SideBetCategory.COUPLE, SideBetCategory.SINGLE].includes(
          b.category
        )
      )
    ).toBe(true);
  });
});
