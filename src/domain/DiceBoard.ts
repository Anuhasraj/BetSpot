import { BaseEntity } from '../core/BaseEntity';
import { SerializedSideBetRound, SideBetRound, SideBetSettlementReport } from './SideBetRound';
import { TierFeeStrategy, TokenEconomy } from './TokenEconomy';
import {
  DiceFace,
  GamePhase,
  IRandomGenerator,
  MainSeat,
  PlatformIncomeRecord,
  SideBettor,
  TierDefinition,
  TierId,
  TransactionType,
} from './types';
import { User } from './User';

export interface DiceRollEvent {
  readonly id: string;
  readonly rollerUserId: string;
  readonly rollerUsername: string;
  readonly face: DiceFace;
  readonly oppositeFace: DiceFace;
  readonly isTieBreaker: boolean;
  readonly isAutoRoll?: boolean;
  readonly timestamp: number;
}

export interface DiceMatchResult {
  readonly matchNumber: number;
  readonly winnerUserId: string;
  readonly winnerUsername: string;
  readonly winningFace: DiceFace;
  readonly grossPot: number;
  readonly feeAmount: number;
  readonly netPayout: number;
  readonly feeRate: number;
  readonly hadTieBreaker: boolean;
  readonly timestamp: number;
}

export interface LobbyVisitor {
  readonly userId: string;
  readonly username: string;
  readonly avatarUrl?: string;
  readonly joinedAt: number;
}

export interface MatchLockSummary {
  readonly matchNumber: number;
  readonly confirmedBet: number;
  readonly playerCount: number;
  readonly potTotal: number;
  readonly refunds: { userId: string; username: string; initialBet: number; excessRefunded: number }[];
}

export interface ServerDiceBoardSnapshot {
  id: string;
  tier: TierDefinition;
  tableNumber: number;
  tableLabel: string;
  phase: GamePhase;
  lobbySecondsRemaining: number;
  turnRollSecondsRemaining: number;
  botTurnDelaySeconds: number;
  seats: (MainSeat | null)[];
  lobbyVisitors: LobbyVisitor[];
  sideBettors: SideBettor[];
  currentTurnSeatIndex: number | null;
  tieBreakerUserIds: string[];
  activeSideBetRound: SerializedSideBetRound | null;
  pendingRollReveal: DiceRollEvent | null;
  lastLockSummary: MatchLockSummary | null;
  lastRoll: DiceRollEvent | null;
  rollHistory: DiceRollEvent[];
  pastSideBetReports: SideBetSettlementReport[];
  matchHistory: DiceMatchResult[];
  statusBanner: string;
  matchCounter: number;
  totalEntryFeesCollected: number;
  botAssisted: boolean;
  lastSettledSideBetSnapshot: DiceBoard['lastSettledSideBetSnapshot'];
}

export class DiceBoard extends BaseEntity<ServerDiceBoardSnapshot> {
  public static readonly MAX_MAIN_SEATS = 10;
  public static readonly LOBBY_COUNTDOWN_SECONDS = 25;
  public static readonly SIDE_BET_WINDOW_SECONDS = 45;
  public static readonly TURN_ROLL_TIMEOUT_SECONDS = 30;
  public static readonly BOT_TURN_DELAY_SECONDS = 2;
  public static readonly BOT_TURN_DELAY_MIN_SECONDS = 1;
  public static readonly BOT_TURN_DELAY_MAX_SECONDS = 7;

  public static randomBotTurnDelaySeconds(): number {
    const min = DiceBoard.BOT_TURN_DELAY_MIN_SECONDS;
    const max = DiceBoard.BOT_TURN_DELAY_MAX_SECONDS;
    const span = max - min + 1;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return min + (arr[0] % span);
    }
    return min + Math.floor(Math.random() * span);
  }

  public readonly tier: TierDefinition;
  public readonly tableNumber: number;
  public phase: GamePhase = GamePhase.WAITING_FOR_PLAYERS;
  public lobbySecondsRemaining: number = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
  public turnRollSecondsRemaining: number = DiceBoard.TURN_ROLL_TIMEOUT_SECONDS;
  public botTurnDelaySeconds: number = DiceBoard.randomBotTurnDelaySeconds();
  public seats: (MainSeat | null)[];
  public lobbyVisitors: LobbyVisitor[] = [];
  public sideBettors: SideBettor[] = [];
  public currentTurnSeatIndex: number | null = null;
  public tieBreakerUserIds: string[] = [];
  public activeSideBetRound: SideBetRound | null = null;
  public pendingRollReveal: DiceRollEvent | null = null;
  public lastLockSummary: MatchLockSummary | null = null;
  public lastRoll: DiceRollEvent | null = null;
  public rollHistory: DiceRollEvent[] = [];
  public pastSideBetReports: SideBetSettlementReport[] = [];
  public matchHistory: DiceMatchResult[] = [];
  public statusBanner: string = 'Open room · Place your bet before the match starts.';
  public matchCounter: number = 1;
  public totalEntryFeesCollected: number = 0;
  public botAssisted: boolean = false;
  public botSideBetTriggeredThisRound: boolean = false;
  public lastSettledSideBetSnapshot: {
    roundId: string;
    roundNumber: number;
    rolledFace: DiceFace;
    bets: {
      userId: string;
      username: string;
      isBot: boolean;
      option: string;
      matchedStake: number;
      payout: number;
      status: string;
    }[];
  } | null = null;

  private readonly randomGenerator: IRandomGenerator;
  private readonly feeStrategy: TierFeeStrategy;
  private onIncomeRecorded?: (record: PlatformIncomeRecord) => void;

  constructor(
    id: string,
    tier: TierDefinition,
    randomGenerator: IRandomGenerator,
    feeStrategy: TierFeeStrategy,
    tableNumber: number = 1
  ) {
    super(id);
    this.tier = tier;
    this.tableNumber = tableNumber;
    this.seats = Array(tier.maxSeats).fill(null);
    this.randomGenerator = randomGenerator;
    this.feeStrategy = feeStrategy;
  }

  public setIncomeListener(listener: (record: PlatformIncomeRecord) => void): void {
    this.onIncomeRecorded = listener;
  }

  private emitIncomeRecord(
    record: Omit<PlatformIncomeRecord, 'usdEquivalent' | 'createdAt'>
  ): void {
    if (!this.onIncomeRecorded || record.feeAmountTokens <= 0) return;
    this.onIncomeRecorded({
      ...record,
      usdEquivalent: TokenEconomy.tokensToUsd(record.feeAmountTokens),
      createdAt: Date.now(),
    });
  }

  public get maxSeats(): number {
    return this.tier.maxSeats;
  }

  public get tableLabel(): string {
    return `${this.tier.label} · Room #${this.tableNumber}`;
  }

  public get occupiedSeats(): MainSeat[] {
    return this.seats.filter((s): s is MainSeat => s !== null);
  }

  public get occupiedCount(): number {
    return this.occupiedSeats.length;
  }

  public get humanOccupiedCount(): number {
    return this.occupiedSeats.filter((s) => !s.isBot).length;
  }

  public get hasBotSeated(): boolean {
    return this.occupiedSeats.some((s) => s.isBot);
  }

  public get isJoinableForPlay(): boolean {
    return (
      (this.phase === GamePhase.WAITING_FOR_PLAYERS ||
        this.phase === GamePhase.LOBBY_COUNTDOWN) &&
      this.occupiedCount < this.maxSeats
    );
  }

  public get isActiveWithPlayers(): boolean {
    return this.occupiedCount > 0 && this.phase !== GamePhase.SETTLED;
  }

  public get currentMinBet(): number | null {
    const seated = this.occupiedSeats;
    if (seated.length === 0) return null;
    return Math.min(...seated.map((s) => s.initialBet));
  }

  public get lockedPot(): number {
    return this.occupiedSeats.reduce((sum, s) => sum + s.lockedBet, 0);
  }

  public get projectedPot(): number {
    const min = this.currentMinBet;
    if (!min) return 0;
    return min * this.occupiedCount;
  }

  public isUserSeated(userId: string): boolean {
    return this.seats.some((s) => s?.userId === userId);
  }

  public isUserActivelySeated(userId: string): boolean {
    return this.seats.some((s) => s?.userId === userId && !s.hasLeftMatch);
  }

  public isUserSideBettor(userId: string): boolean {
    return this.sideBettors.some((sb) => sb.userId === userId);
  }

  public registerLobbyVisitor(user: User): void {
    if (this.isUserSeated(user.id)) return;
    if (this.lobbyVisitors.some((v) => v.userId === user.id)) return;
    this.lobbyVisitors.push({
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      joinedAt: Date.now(),
    });
  }

  public unregisterLobbyVisitor(userId: string): void {
    this.lobbyVisitors = this.lobbyVisitors.filter((v) => v.userId !== userId);
  }

  public joinMainSeat(
    user: User,
    betAmount: number,
    preferredSeatIndex?: number,
    soloWaitTargetSeconds?: number
  ): MainSeat {
    if (!user.isActive) {
      throw new Error('Suspended accounts cannot join a board.');
    }
    if (this.phase !== GamePhase.WAITING_FOR_PLAYERS && this.phase !== GamePhase.LOBBY_COUNTDOWN) {
      throw new Error('Match already in progress. Join as a side-bettor or wait for the next round.');
    }
    if (this.isUserSeated(user.id)) {
      throw new Error('You already occupy a main seat in this room.');
    }

    const roundedBet = Math.round(betAmount);
    if (roundedBet < TokenEconomy.MIN_BET_TOKENS) {
      throw new Error(`Minimum bet is ${TokenEconomy.MIN_BET_TOKENS} TKN.`);
    }
    if (roundedBet < this.tier.minTokens || roundedBet > this.tier.maxTokens) {
      throw new Error(
        `Bet for ${this.tier.label} must be between ${this.tier.minTokens.toLocaleString()} and ${this.tier.maxTokens.toLocaleString()} TKN.`
      );
    }

    const openIdx =
      preferredSeatIndex !== undefined && this.seats[preferredSeatIndex] === null
        ? preferredSeatIndex
        : this.seats.findIndex((s) => s === null);

    if (openIdx === -1) {
      throw new Error(`All ${this.maxSeats} main seats are full.`);
    }

    // Remove from pending visitor list and side-bettors when seated
    this.unregisterLobbyVisitor(user.id);
    this.sideBettors = this.sideBettors.filter((sb) => sb.userId !== user.id);

    user.wallet.holdTokens(roundedBet, `Held main seat #${openIdx + 1} on ${this.tableLabel}`, this.id);

    const seat: MainSeat = {
      seatIndex: openIdx,
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isBot: user.isBot,
      initialBet: roundedBet,
      lockedBet: roundedBet,
      rollValue: null,
      tieBreakerRolls: [],
      hasRolled: false,
      joinedAt: Date.now(),
    };

    this.seats[openIdx] = seat;
    if (user.isBot) {
      this.botAssisted = true;
    }

    if (this.phase === GamePhase.WAITING_FOR_PLAYERS) {
      this.phase = GamePhase.LOBBY_COUNTDOWN;
      this.lobbySecondsRemaining =
        !user.isBot && soloWaitTargetSeconds && soloWaitTargetSeconds > DiceBoard.LOBBY_COUNTDOWN_SECONDS
          ? soloWaitTargetSeconds
          : DiceBoard.LOBBY_COUNTDOWN_SECONDS;
    } else if (
      !user.isBot &&
      this.humanOccupiedCount >= 2 &&
      !this.hasBotSeated &&
      this.lobbySecondsRemaining > DiceBoard.LOBBY_COUNTDOWN_SECONDS
    ) {
      // A 2nd real player joined during the 3-minute solo wait -> drop countdown to standard 25s
      this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
    }

    this.syncPreMatchSideBetRound();

    const minBet = this.currentMinBet!;
    this.statusBanner = `${user.username} joined Seat #${openIdx + 1} (${roundedBet.toLocaleString()} TKN). Current Min Bet: ${minBet.toLocaleString()} TKN.`;

    return seat;
  }

  private syncPreMatchSideBetRound(): void {
    if (
      this.phase !== GamePhase.WAITING_FOR_PLAYERS &&
      this.phase !== GamePhase.LOBBY_COUNTDOWN
    ) {
      return;
    }
    const seated = this.occupiedSeats;
    if (seated.length >= 2) {
      const firstSeat = seated[0];
      if (!this.activeSideBetRound || this.activeSideBetRound.isClosed || this.activeSideBetRound.isSettled) {
        this.activeSideBetRound = new SideBetRound(
          this.id,
          this.rollHistory.length + 1,
          firstSeat.username,
          DiceBoard.SIDE_BET_WINDOW_SECONDS
        );
      } else {
        this.activeSideBetRound.rollerUsername = firstSeat.username;
      }
    } else if (seated.length === 1 && this.activeSideBetRound && !this.activeSideBetRound.isClosed) {
      this.activeSideBetRound.rollerUsername = seated[0].username;
    }
  }

  public updateMainSeatBet(user: User, newBetAmount: number): MainSeat {
    if (this.phase !== GamePhase.WAITING_FOR_PLAYERS && this.phase !== GamePhase.LOBBY_COUNTDOWN) {
      throw new Error('Cannot change bet amount after match has locked.');
    }
    const seatIdx = this.seats.findIndex((s) => s?.userId === user.id);
    if (seatIdx === -1) {
      throw new Error('You do not hold a main seat in this room.');
    }

    const roundedBet = Math.round(newBetAmount);
    if (roundedBet < TokenEconomy.MIN_BET_TOKENS) {
      throw new Error(`Minimum bet is ${TokenEconomy.MIN_BET_TOKENS} TKN.`);
    }
    if (roundedBet < this.tier.minTokens || roundedBet > this.tier.maxTokens) {
      throw new Error(
        `Bet for ${this.tier.label} must be between ${this.tier.minTokens.toLocaleString()} and ${this.tier.maxTokens.toLocaleString()} TKN.`
      );
    }

    const seat = this.seats[seatIdx]!;
    if (seat.initialBet === roundedBet) return seat;

    user.wallet.releaseHoldToAvailable(
      seat.initialBet,
      `Updated stake from ${seat.initialBet.toLocaleString()} TKN on ${this.tableLabel}`,
      TransactionType.BET_REFUND,
      this.id
    );
    try {
      user.wallet.holdTokens(
        roundedBet,
        `Updated stake to ${roundedBet.toLocaleString()} TKN on ${this.tableLabel}`,
        this.id
      );
    } catch (err) {
      // Restore prior hold if new stake cannot be afforded
      user.wallet.holdTokens(
        seat.initialBet,
        `Restored stake on ${this.tableLabel}`,
        this.id
      );
      throw err;
    }

    seat.initialBet = roundedBet;
    seat.lockedBet = roundedBet;
    const minBet = this.currentMinBet!;
    this.statusBanner = `${user.username} updated Seat #${seatIdx + 1} bet to ${roundedBet.toLocaleString()} TKN. Current Min Bet: ${minBet.toLocaleString()} TKN.`;
    return seat;
  }

  public leaveMainSeat(user: User, userLookup?: (id: string) => User | undefined): void {
    const seatIdx = this.seats.findIndex((s) => s?.userId === user.id);
    if (seatIdx === -1) return;

    if (
      this.phase === GamePhase.SIDE_BET_WINDOW ||
      this.phase === GamePhase.IN_PROGRESS_ROLL ||
      this.phase === GamePhase.TIE_BREAKER
    ) {
      const seat = this.seats[seatIdx]!;
      seat.hasLeftMatch = true;
      if (!seat.hasRolled) {
        seat.hasRolled = true;
      }
      this.statusBanner = `${user.username} left the match. Their stake remains in the pot.`;

      if (this.currentTurnSeatIndex === seat.seatIndex && !this.pendingRollReveal) {
        const nextIdx = this.findNextUnrolledSeatIndex();
        if (nextIdx !== null) {
          this.currentTurnSeatIndex = nextIdx;
          this.turnRollSecondsRemaining = DiceBoard.TURN_ROLL_TIMEOUT_SECONDS;
          if (this.phase === GamePhase.SIDE_BET_WINDOW && this.activeSideBetRound) {
            this.activeSideBetRound.rollerUsername = this.seats[nextIdx]!.username;
          }
        } else if (userLookup) {
          if (this.phase === GamePhase.SIDE_BET_WINDOW && this.activeSideBetRound && !this.activeSideBetRound.isSettled) {
            this.activeSideBetRound.refundAllActiveBets(userLookup, 'Remaining turn cancelled after player left');
          }
          this.evaluateRoundOutcome(userLookup);
        }
      }
      return;
    }

    if (this.phase === GamePhase.SETTLED) {
      this.seats[seatIdx] = null;
      if (this.occupiedCount === 0) {
        this.resetForNextMatch();
        this.statusBanner = 'No players in room · Room closed.';
      } else {
        this.statusBanner = `${user.username} exited the room.`;
      }
      return;
    }

    const seat = this.seats[seatIdx]!;
    user.wallet.releaseHoldToAvailable(
      seat.initialBet,
      `Left Seat #${seatIdx + 1} on ${this.tableLabel}`,
      TransactionType.BET_REFUND,
      this.id
    );
    this.seats[seatIdx] = null;

    if (this.occupiedCount === 0) {
      if (this.activeSideBetRound && !this.activeSideBetRound.isSettled && userLookup) {
        this.activeSideBetRound.refundAllActiveBets(userLookup, 'Lobby emptied before match start');
      }
      this.activeSideBetRound = null;
      this.botAssisted = false;
      this.phase = GamePhase.WAITING_FOR_PLAYERS;
      this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
      this.statusBanner = 'No players in room · Room closed.';
    } else {
      this.syncPreMatchSideBetRound();
      this.statusBanner = `${user.username} vacated Seat #${seatIdx + 1}. Seat is open for replacement.`;
    }
  }

  public syncRemoteWaitingSeat(
    user: User,
    betAmount: number,
    preferredSeatIndex?: number,
    lobbyEndsAt?: number
  ): MainSeat | null {
    if (this.phase !== GamePhase.WAITING_FOR_PLAYERS && this.phase !== GamePhase.LOBBY_COUNTDOWN) {
      return null;
    }
    const roundedBet = Math.max(
      this.tier.minTokens,
      Math.min(this.tier.maxTokens, Math.round(betAmount))
    );
    const existingIdx = this.seats.findIndex((s) => s?.userId === user.id);
    if (existingIdx !== -1) {
      const existing = this.seats[existingIdx]!;
      existing.initialBet = roundedBet;
      existing.lockedBet = roundedBet;
      existing.username = user.username;
      existing.avatarUrl = user.avatarUrl;
      if (lobbyEndsAt && lobbyEndsAt > Date.now()) {
        this.lobbySecondsRemaining = Math.max(
          1,
          Math.ceil((lobbyEndsAt - Date.now()) / 1000)
        );
      }
      return existing;
    }

    let openIdx =
      preferredSeatIndex !== undefined &&
      preferredSeatIndex >= 0 &&
      preferredSeatIndex < this.maxSeats &&
      this.seats[preferredSeatIndex] === null
        ? preferredSeatIndex
        : this.seats.findIndex((s) => s === null);
    if (openIdx === -1) return null;

    this.unregisterLobbyVisitor(user.id);
    const seat: MainSeat = {
      seatIndex: openIdx,
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isBot: user.isBot,
      initialBet: roundedBet,
      lockedBet: roundedBet,
      rollValue: null,
      tieBreakerRolls: [],
      hasRolled: false,
      joinedAt: Date.now(),
    };
    this.seats[openIdx] = seat;
    if (this.phase === GamePhase.WAITING_FOR_PLAYERS) {
      this.phase = GamePhase.LOBBY_COUNTDOWN;
    }
    if (lobbyEndsAt && lobbyEndsAt > Date.now()) {
      this.lobbySecondsRemaining = Math.max(
        1,
        Math.ceil((lobbyEndsAt - Date.now()) / 1000)
      );
    } else if (
      this.humanOccupiedCount >= 2 &&
      !this.hasBotSeated &&
      this.lobbySecondsRemaining > DiceBoard.LOBBY_COUNTDOWN_SECONDS
    ) {
      this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
    }
    this.syncPreMatchSideBetRound();
    const minBet = this.currentMinBet ?? roundedBet;
    this.statusBanner = `${user.username} joined Seat #${openIdx + 1} (${roundedBet.toLocaleString()} TKN). Current Min Bet: ${minBet.toLocaleString()} TKN.`;
    return seat;
  }

  public removeRemoteWaitingSeat(
    userId: string,
    userLookup?: (id: string) => User | undefined
  ): void {
    if (this.phase !== GamePhase.WAITING_FOR_PLAYERS && this.phase !== GamePhase.LOBBY_COUNTDOWN) {
      return;
    }
    const seatIdx = this.seats.findIndex((s) => s?.userId === userId);
    if (seatIdx === -1) return;
    const leavingUsername = this.seats[seatIdx]?.username ?? 'Player';
    this.seats[seatIdx] = null;
    if (this.occupiedCount === 0) {
      if (this.activeSideBetRound && !this.activeSideBetRound.isSettled && userLookup) {
        this.activeSideBetRound.refundAllActiveBets(userLookup, 'Lobby emptied before match start');
      }
      this.activeSideBetRound = null;
      this.botAssisted = false;
      this.phase = GamePhase.WAITING_FOR_PLAYERS;
      this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
      this.statusBanner = 'Room open · Waiting for players to join.';
    } else {
      this.syncPreMatchSideBetRound();
      this.statusBanner = `${leavingUsername} vacated Seat #${seatIdx + 1}. Seat is open for replacement.`;
    }
  }

  public joinAsSideBettor(user: User): SideBettor {
    if (!user.isActive) {
      throw new Error('Suspended accounts cannot join.');
    }
    if (this.isUserSeated(user.id)) {
      throw new Error('Main seat players are already in the room.');
    }
    const existing = this.sideBettors.find((sb) => sb.userId === user.id);
    if (existing) return existing;

    const fee = this.tier.spectatorEntryFee;
    user.wallet.debitAvailableDirect(
      fee,
      TransactionType.ENTRY_FEE,
      `Side-bettor entry fee for ${this.tier.label}`,
      this.id
    );

    const spectator: SideBettor = {
      userId: user.id,
      username: user.username,
      entryFeePaid: fee,
      joinedAt: Date.now(),
      isBot: user.isBot,
    };
    this.sideBettors.push(spectator);
    this.totalEntryFeesCollected += fee;
    this.emitIncomeRecord({
      id: `inc_entry_${this.id}_m${this.matchCounter}_${user.id}_${spectator.joinedAt}`,
      source: 'SPECTATOR_ENTRY_FEE',
      boardOrEventId: this.id,
      roomOrMatchLabel: `${this.tableLabel} · Match #${this.matchCounter}`,
      userId: user.id,
      username: user.username,
      isBotUser: user.isBot,
      includesHumanParticipant: !user.isBot || this.occupiedSeats.some((s) => !s.isBot),
      grossAmountTokens: fee,
      feeRate: 1,
      feeAmountTokens: fee,
      description: `Side-bettor system entry fee (${this.tier.label})`,
    });
    this.statusBanner = `${user.username} entered as a Side-Bettor (${fee} TKN entry fee).`;
    return spectator;
  }

  public startMatchIfReady(userLookup: (id: string) => User | undefined): boolean {
    const seated = this.occupiedSeats;
    if (seated.length < 2) {
      // Cancel start and return held tokens if only 1 player
      for (const seat of seated) {
        const u = userLookup(seat.userId);
        if (u) {
          u.wallet.releaseHoldToAvailable(
            seat.initialBet,
            `Lobby cancelled (< 2 players) on ${this.tier.label}`,
            TransactionType.BET_REFUND,
            this.id
          );
        }
        this.seats[seat.seatIndex] = null;
      }
      if (this.activeSideBetRound && !this.activeSideBetRound.isSettled) {
        this.activeSideBetRound.refundAllActiveBets(userLookup, 'Lobby cancelled (< 2 players)');
      }
      this.activeSideBetRound = null;
      this.botAssisted = false;
      this.lastLockSummary = null;
      this.phase = GamePhase.WAITING_FOR_PLAYERS;
      this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
      this.statusBanner = 'Match cancelled: fewer than 2 main players joined. All held tokens returned.';
      return false;
    }

    // Min-bet lock & excess auto-refund rule
    const minBet = Math.min(...seated.map((s) => s.initialBet));
    const refundedNames: string[] = [];
    const refundDetails: { userId: string; username: string; initialBet: number; excessRefunded: number }[] = [];

    for (const seat of seated) {
      seat.lockedBet = minBet;
      seat.rollValue = null;
      seat.initialRollValue = null;
      seat.tieBreakerRolls = [];
      seat.hasRolled = false;
      seat.hasLeftMatch = false;

      const excess = seat.initialBet - minBet;
      if (excess > 0) {
        const u = userLookup(seat.userId);
        if (u) {
          u.wallet.releaseHoldToAvailable(
            excess,
            `Excess above Min Bet (${minBet.toLocaleString()} TKN) auto-refunded`,
            TransactionType.BET_REFUND,
            this.id
          );
        }
        refundedNames.push(`${seat.username} (+${excess.toLocaleString()})`);
        refundDetails.push({
          userId: seat.userId,
          username: seat.username,
          initialBet: seat.initialBet,
          excessRefunded: excess,
        });
      }
    }

    const firstSeat = seated[0];
    this.clearMatchHistoryState();
    this.phase = GamePhase.SIDE_BET_WINDOW;
    this.currentTurnSeatIndex = firstSeat.seatIndex;
    this.turnRollSecondsRemaining = DiceBoard.TURN_ROLL_TIMEOUT_SECONDS;
    this.botTurnDelaySeconds = DiceBoard.randomBotTurnDelaySeconds();
    this.tieBreakerUserIds = [];
    if (
      this.activeSideBetRound &&
      !this.activeSideBetRound.isClosed &&
      !this.activeSideBetRound.isSettled
    ) {
      this.activeSideBetRound.rollerUsername = firstSeat.username;
      this.activeSideBetRound.secondsRemaining = DiceBoard.SIDE_BET_WINDOW_SECONDS;
    } else {
      this.activeSideBetRound = new SideBetRound(
        this.id,
        this.rollHistory.length + 1,
        firstSeat.username,
        DiceBoard.SIDE_BET_WINDOW_SECONDS
      );
    }
    this.pendingRollReveal = null;
    this.lastLockSummary = {
      matchNumber: this.matchCounter,
      confirmedBet: minBet,
      playerCount: seated.length,
      potTotal: minBet * seated.length,
      refunds: refundDetails,
    };

    const refundMsg =
      refundedNames.length > 0 ? ` Excess returned to wallets: ${refundedNames.join(', ')}.` : '';
    this.statusBanner = `Match #${this.matchCounter} confirmed at lowest bet ${minBet.toLocaleString()} TKN/player (${seated.length} players).${refundMsg} ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window open before ${firstSeat.username} rolls first!`;
    return true;
  }

  public beginAnimatedRoll(
    autoTriggered: boolean = false,
    authoritativeRoll?: {
      id: string;
      face: DiceFace;
      oppositeFace: DiceFace;
      isTieBreaker?: boolean;
      timestamp?: number;
    }
  ): DiceRollEvent {
    if (this.phase !== GamePhase.IN_PROGRESS_ROLL && this.phase !== GamePhase.TIE_BREAKER) {
      throw new Error('Not currently in a rolling phase.');
    }
    if (this.pendingRollReveal) {
      return this.pendingRollReveal;
    }
    if (this.currentTurnSeatIndex === null) {
      throw new Error('No active turn seat.');
    }

    const seat = this.seats[this.currentTurnSeatIndex];
    if (!seat) {
      throw new Error('Active turn seat is empty.');
    }

    const face = authoritativeRoll?.face ?? this.randomGenerator.rollDaduketaFace();
    const oppositeFace = authoritativeRoll?.oppositeFace ?? this.randomGenerator.getOppositeFace(face);
    const isTieBreaker = this.phase === GamePhase.TIE_BREAKER;
    const randSuffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : String(Date.now()).slice(-6);

    const rollEvent: DiceRollEvent = {
      id: authoritativeRoll?.id ?? `roll_${Date.now()}_${randSuffix}`,
      rollerUserId: seat.userId,
      rollerUsername: seat.username,
      face,
      oppositeFace,
      isTieBreaker,
      isAutoRoll: autoTriggered || undefined,
      timestamp: authoritativeRoll?.timestamp ?? Date.now(),
    };

    this.pendingRollReveal = rollEvent;
    this.statusBanner = autoTriggered
      ? `${seat.username} reached the ${DiceBoard.TURN_ROLL_TIMEOUT_SECONDS}s limit — dice auto-thrown toward the plank...`
      : `${seat.username} tosses the die, catches it, and strikes the wooden plank...`;
    return rollEvent;
  }

  public completeAnimatedRoll(userLookup: (id: string) => User | undefined): DiceRollEvent | null {
    const rollEvent = this.pendingRollReveal;
    if (!rollEvent || this.currentTurnSeatIndex === null) return null;

    const seat = this.seats[this.currentTurnSeatIndex];
    this.pendingRollReveal = null;
    if (!seat) return null;

    if (rollEvent.isTieBreaker) {
      if (seat.initialRollValue == null && seat.rollValue != null) {
        seat.initialRollValue = seat.rollValue;
      }
      seat.tieBreakerRolls.push(rollEvent.face);
      seat.rollValue = rollEvent.face;
    } else {
      seat.initialRollValue = rollEvent.face;
      seat.rollValue = rollEvent.face;
    }
    seat.hasRolled = true;

    this.lastRoll = rollEvent;
    this.rollHistory = [rollEvent, ...this.rollHistory].slice(0, 40);

    // Settle the side-bet round targeting this roll immediately when the die lands!
    let settledReport: SideBetSettlementReport | null = null;
    if (this.activeSideBetRound && !this.activeSideBetRound.isSettled) {
      const roundBets = this.activeSideBetRound.bets;
      const roundHasHuman =
        this.occupiedSeats.some((s) => !s.isBot) ||
        roundBets.some((b) => !(userLookup(b.userId)?.isBot ?? false));
      settledReport = this.activeSideBetRound.settle(rollEvent.face, this.feeStrategy, userLookup);
      this.pastSideBetReports = [settledReport, ...this.pastSideBetReports].slice(0, 15);
      this.lastSettledSideBetSnapshot = {
        roundId: this.activeSideBetRound.id,
        roundNumber: this.activeSideBetRound.roundNumber,
        rolledFace: rollEvent.face,
        bets: roundBets.map((b) => ({
          userId: b.userId,
          username: b.username,
          isBot: userLookup(b.userId)?.isBot ?? false,
          option: b.option,
          matchedStake: b.matchedStake,
          payout: b.payout,
          status: b.status,
        })),
      };
      for (const w of settledReport.winners) {
        if (w.fee > 0) {
          const wUser = userLookup(w.userId);
          this.emitIncomeRecord({
            id: `inc_sb_${w.betId}`,
            source: 'SIDE_BET_FEE',
            boardOrEventId: this.id,
            roomOrMatchLabel: `${this.tableLabel} · R#${settledReport.roundNumber}`,
            userId: w.userId,
            username: w.username,
            isBotUser: wUser?.isBot ?? false,
            includesHumanParticipant: roundHasHuman,
            grossAmountTokens: w.grossPayout,
            feeRate: w.feeRate,
            feeAmountTokens: w.fee,
            description: `Side-bet winner fee (${w.option} on Face ${settledReport.rolledFace})`,
          });
        }
      }
    } else {
      this.lastSettledSideBetSnapshot = null;
    }

    const nextSeatIdx = this.findNextUnrolledSeatIndex();
    if (nextSeatIdx !== null) {
      const nextSeat = this.seats[nextSeatIdx]!;
      this.phase = GamePhase.SIDE_BET_WINDOW;
      this.currentTurnSeatIndex = nextSeatIdx;
      this.botSideBetTriggeredThisRound = false;
      this.activeSideBetRound = new SideBetRound(
        this.id,
        this.rollHistory.length + 1,
        nextSeat.username,
        DiceBoard.SIDE_BET_WINDOW_SECONDS
      );
      const sideSummary =
        settledReport && settledReport.winners.length > 0
          ? ` Side-bet winners: ${settledReport.winners
              .map((w) => `${w.username} +${w.netPayout.toLocaleString()} TKN`)
              .join(', ')}.`
          : '';
      this.statusBanner = `${seat.username} stopped on ${rollEvent.face} (Opposite ${rollEvent.oppositeFace}).${sideSummary} ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window open before ${nextSeat.username}'s turn!`;
    } else {
      this.evaluateRoundOutcome(userLookup);
    }

    return rollEvent;
  }

  /**
   * Executes the roll synchronously (used for initial seeding or instant roll resolution).
   */
  public rollForCurrentPlayer(userLookup: (id: string) => User | undefined): DiceRollEvent {
    const event = this.beginAnimatedRoll();
    return this.completeAnimatedRoll(userLookup) ?? event;
  }

  public closeSideBetWindowAndAdvanceTurn(): void {
    if (this.phase !== GamePhase.SIDE_BET_WINDOW) return;
    if (this.activeSideBetRound) {
      this.activeSideBetRound.isClosed = true;
    }
    this.phase = this.tieBreakerUserIds.length > 0 ? GamePhase.TIE_BREAKER : GamePhase.IN_PROGRESS_ROLL;
    this.turnRollSecondsRemaining = DiceBoard.TURN_ROLL_TIMEOUT_SECONDS;
    this.botTurnDelaySeconds = DiceBoard.randomBotTurnDelaySeconds();
    const roller = this.currentTurnSeatIndex !== null ? this.seats[this.currentTurnSeatIndex] : null;
    this.statusBanner = roller
      ? `Side-bets locked! ${roller.username} has ${DiceBoard.TURN_ROLL_TIMEOUT_SECONDS}s to throw (auto-throw on timeout).`
      : 'Side-bets locked! Rolling next turn.';
  }

  private findNextUnrolledSeatIndex(): number | null {
    const candidates =
      this.tieBreakerUserIds.length > 0
        ? this.occupiedSeats.filter(
            (s) => this.tieBreakerUserIds.includes(s.userId) && !s.hasRolled && !s.hasLeftMatch
          )
        : this.occupiedSeats.filter((s) => !s.hasRolled && !s.hasLeftMatch);

    if (candidates.length === 0) return null;
    return candidates[0].seatIndex;
  }

  private evaluateRoundOutcome(userLookup: (id: string) => User | undefined): void {
    const contenders =
      this.tieBreakerUserIds.length > 0
        ? this.occupiedSeats.filter((s) => this.tieBreakerUserIds.includes(s.userId))
        : this.occupiedSeats;

    const highestScore = Math.max(...contenders.map((s) => s.rollValue ?? 0));
    const tiedWinners = contenders.filter((s) => s.rollValue !== null && s.rollValue === highestScore);

    if (tiedWinners.length === 0 || highestScore === 0) {
      for (const s of this.occupiedSeats) {
        const u = userLookup(s.userId);
        if (u) {
          u.wallet.releaseHoldToAvailable(
            s.lockedBet,
            `Match #${this.matchCounter} cancelled: no rolls completed`,
            TransactionType.BET_REFUND,
            this.id
          );
        }
      }
      if (this.activeSideBetRound && !this.activeSideBetRound.isSettled) {
        this.activeSideBetRound.refundAllActiveBets(userLookup, 'Match cancelled before any roll');
      }
      this.resetForNextMatch();
      this.statusBanner = 'Match cancelled: all players left before rolling. Stakes refunded.';
      return;
    }

    if (tiedWinners.length > 1) {
      const activeTied = tiedWinners.filter((s) => !s.hasLeftMatch);
      if (activeTied.length > 1) {
        // Tie-breaker ONLY among active tied players until a single winner emerges!
        this.tieBreakerUserIds = activeTied.map((s) => s.userId);
        for (const s of activeTied) {
          s.hasRolled = false;
        }
        this.phase = GamePhase.SIDE_BET_WINDOW;
        this.currentTurnSeatIndex = activeTied[0].seatIndex;
        this.activeSideBetRound = new SideBetRound(
          this.id,
          this.rollHistory.length + 1,
          activeTied[0].username,
          DiceBoard.SIDE_BET_WINDOW_SECONDS
        );
        this.statusBanner = `TIE at ${highestScore}! Tie-breaker triggered for ${activeTied
          .map((s) => s.username)
          .join(' vs ')}. ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window open!`;
        return;
      }
      if (activeTied.length === 1) {
        tiedWinners.splice(0, tiedWinners.length, activeTied[0]);
      }
    }

    // Single winner emerged!
    const winner = tiedWinners[0];
    const grossPot = this.lockedPot;
    // Main Dice Game Fee Rule: apply the fee corresponding to the board/tier bet value (lockedBet)
    const feeResult = this.feeStrategy.calculateWinnerFee(grossPot, winner.lockedBet, this.tier.id);

    for (const s of this.occupiedSeats) {
      const u = userLookup(s.userId);
      if (u) {
        if (s.userId === winner.userId) {
          u.wallet.consumeHeldTokens(s.lockedBet);
        } else {
          u.wallet.recordLossFromHold(
            s.lockedBet,
            `Lost ${this.tableLabel} Match #${this.matchCounter} (Your roll ${s.rollValue ?? '—'}; Winner ${winner.username} rolled ${highestScore})`,
            this.id
          );
        }
      }
    }

    const winnerUser = userLookup(winner.userId);
    if (winnerUser) {
      winnerUser.wallet.creditAvailable(
        feeResult.netPayout,
        TransactionType.BET_WIN,
        `Won ${this.tier.label} Match #${this.matchCounter} (Roll ${highestScore}, ${Math.round(
          feeResult.feeRate * 100
        )}% tier fee)`,
        this.id
      );
    }

    const result: DiceMatchResult = {
      matchNumber: this.matchCounter,
      winnerUserId: winner.userId,
      winnerUsername: winner.username,
      winningFace: highestScore as DiceFace,
      grossPot,
      feeAmount: feeResult.feeAmount,
      netPayout: feeResult.netPayout,
      feeRate: feeResult.feeRate,
      hadTieBreaker: this.tieBreakerUserIds.length > 0,
      timestamp: Date.now(),
    };

    this.matchHistory = [result, ...this.matchHistory].slice(0, 15);
    this.emitIncomeRecord({
      id: `inc_dm_${this.id}_m${this.matchCounter}_${result.timestamp}`,
      source: 'DICE_MAIN_FEE',
      boardOrEventId: this.id,
      roomOrMatchLabel: `${this.tableLabel} · Match #${this.matchCounter}`,
      userId: winner.userId,
      username: winner.username,
      isBotUser: winnerUser?.isBot ?? false,
      includesHumanParticipant: this.occupiedSeats.some((s) => !s.isBot),
      grossAmountTokens: grossPot,
      feeRate: feeResult.feeRate,
      feeAmountTokens: feeResult.feeAmount,
      description: `Main dice match winner fee (${Math.round(feeResult.feeRate * 100)}% tier fee, Face ${highestScore})`,
    });
    this.phase = GamePhase.SETTLED;
    this.currentTurnSeatIndex = null;
    this.tieBreakerUserIds = [];
    this.activeSideBetRound = null;
    this.statusBanner = `${winner.username} wins Match #${this.matchCounter} with ${highestScore}! Net payout: ${feeResult.netPayout.toLocaleString()} TKN (${Math.round(
      feeResult.feeRate * 100
    )}% fee).`;
  }

  /** Clears per-match roll, side-bet, and winner history before a fresh match. */
  private clearMatchHistoryState(): void {
    this.lastRoll = null;
    this.rollHistory = [];
    this.pastSideBetReports = [];
    this.matchHistory = [];
  }

  public resetForNextMatch(): void {
    this.seats = Array(this.maxSeats).fill(null);
    this.lobbyVisitors = [];
    this.sideBettors = this.sideBettors.filter((sb) => !sb.isBot);
    this.phase = GamePhase.WAITING_FOR_PLAYERS;
    this.lobbySecondsRemaining = DiceBoard.LOBBY_COUNTDOWN_SECONDS;
    this.turnRollSecondsRemaining = DiceBoard.TURN_ROLL_TIMEOUT_SECONDS;
    this.currentTurnSeatIndex = null;
    this.tieBreakerUserIds = [];
    this.activeSideBetRound = null;
    this.pendingRollReveal = null;
    this.lastLockSummary = null;
    this.clearMatchHistoryState();
    this.botAssisted = false;
    this.botSideBetTriggeredThisRound = false;
    this.lastSettledSideBetSnapshot = null;
    this.matchCounter += 1;
    this.statusBanner = `Room ready for Match #${this.matchCounter} · Place your bet before start.`;
  }

  public cancelMatchByAdmin(userLookup: (id: string) => User | undefined): void {
    for (const seat of this.occupiedSeats) {
      const u = userLookup(seat.userId);
      if (u) {
        u.wallet.releaseHoldToAvailable(
          seat.lockedBet || seat.initialBet,
          `Admin cancelled ${this.tier.label} Match #${this.matchCounter}`,
          TransactionType.BET_REFUND,
          this.id
        );
      }
    }
    if (this.activeSideBetRound && !this.activeSideBetRound.isSettled) {
      for (const b of this.activeSideBetRound.bets) {
        this.activeSideBetRound.cancelBetByAdmin(b.id, userLookup);
      }
      this.activeSideBetRound.isClosed = true;
      this.activeSideBetRound.isSettled = true;
    }
    this.resetForNextMatch();
    this.statusBanner = 'Match cancelled by Admin. All held stakes refunded.';
  }

  public toJSON(): ServerDiceBoardSnapshot {
    return this.toSnapshot(false);
  }

  public toSnapshot(sanitizeForPublic: boolean): ServerDiceBoardSnapshot {
    return {
      id: this.id,
      tier: { ...this.tier },
      tableNumber: this.tableNumber,
      tableLabel: this.tableLabel,
      phase: this.phase,
      lobbySecondsRemaining: this.lobbySecondsRemaining,
      turnRollSecondsRemaining: this.turnRollSecondsRemaining,
      botTurnDelaySeconds: this.botTurnDelaySeconds,
      seats: this.seats.map((s) =>
        s
          ? {
              ...s,
              isBot: sanitizeForPublic ? false : s.isBot,
              tieBreakerRolls: [...s.tieBreakerRolls],
            }
          : null
      ),
      lobbyVisitors: this.lobbyVisitors.map((v) => ({ ...v })),
      sideBettors: this.sideBettors.map((sb) => ({
        ...sb,
        isBot: sanitizeForPublic ? false : sb.isBot,
      })),
      currentTurnSeatIndex: this.currentTurnSeatIndex,
      tieBreakerUserIds: [...this.tieBreakerUserIds],
      activeSideBetRound: this.activeSideBetRound ? this.activeSideBetRound.toJSON() : null,
      pendingRollReveal: this.pendingRollReveal ? { ...this.pendingRollReveal } : null,
      lastLockSummary: this.lastLockSummary
        ? {
            ...this.lastLockSummary,
            refunds: this.lastLockSummary.refunds.map((r) => ({ ...r })),
          }
        : null,
      lastRoll: this.lastRoll ? { ...this.lastRoll } : null,
      rollHistory: this.rollHistory.map((r) => ({ ...r })),
      pastSideBetReports: this.pastSideBetReports.map((rep) => ({ ...rep })),
      matchHistory: this.matchHistory.map((m) => ({ ...m })),
      statusBanner: this.statusBanner,
      matchCounter: this.matchCounter,
      totalEntryFeesCollected: this.totalEntryFeesCollected,
      botAssisted: sanitizeForPublic ? false : this.botAssisted,
      lastSettledSideBetSnapshot: this.lastSettledSideBetSnapshot
        ? {
            ...this.lastSettledSideBetSnapshot,
            bets: this.lastSettledSideBetSnapshot.bets.map((b) => ({
              ...b,
              isBot: sanitizeForPublic ? false : b.isBot,
            })),
          }
        : null,
    };
  }

  public static fromServerSnapshot(
    snap: ServerDiceBoardSnapshot,
    randomGenerator: IRandomGenerator,
    feeStrategy: TierFeeStrategy
  ): DiceBoard {
    const liveTier = feeStrategy.getTierById(snap.tier.id);
    const board = new DiceBoard(snap.id, liveTier, randomGenerator, feeStrategy, snap.tableNumber);
    board.phase = snap.phase;
    board.lobbySecondsRemaining = snap.lobbySecondsRemaining;
    board.turnRollSecondsRemaining = snap.turnRollSecondsRemaining;
    board.botTurnDelaySeconds = snap.botTurnDelaySeconds;
    const expectedSeats = liveTier.maxSeats;
    const restoredSeats = Array.isArray(snap.seats) ? snap.seats.slice(0, expectedSeats) : [];
    while (restoredSeats.length < expectedSeats) restoredSeats.push(null);
    board.seats = restoredSeats.map((s) =>
      s
        ? {
            ...s,
            isBot: Boolean(s.isBot),
            initialRollValue: s.initialRollValue ?? null,
            hasLeftMatch: Boolean(s.hasLeftMatch),
            tieBreakerRolls: [...(s.tieBreakerRolls ?? [])],
          }
        : null
    );
    board.lobbyVisitors = Array.isArray(snap.lobbyVisitors) ? snap.lobbyVisitors.map((v) => ({ ...v })) : [];
    board.sideBettors = Array.isArray(snap.sideBettors) ? snap.sideBettors.map((sb) => ({ ...sb })) : [];
    board.currentTurnSeatIndex = snap.currentTurnSeatIndex ?? null;
    board.tieBreakerUserIds = Array.isArray(snap.tieBreakerUserIds) ? [...snap.tieBreakerUserIds] : [];
    board.activeSideBetRound = snap.activeSideBetRound
      ? SideBetRound.fromServerSnapshot(snap.activeSideBetRound)
      : null;
    board.pendingRollReveal = snap.pendingRollReveal ? { ...snap.pendingRollReveal } : null;
    board.lastLockSummary = snap.lastLockSummary ? { ...snap.lastLockSummary } : null;
    board.lastRoll = snap.lastRoll ? { ...snap.lastRoll } : null;
    board.rollHistory = Array.isArray(snap.rollHistory) ? snap.rollHistory.map((r) => ({ ...r })) : [];
    board.pastSideBetReports = Array.isArray(snap.pastSideBetReports)
      ? snap.pastSideBetReports.map((r) => ({ ...r }))
      : [];
    board.matchHistory = Array.isArray(snap.matchHistory) ? snap.matchHistory.map((m) => ({ ...m })) : [];
    board.statusBanner = snap.statusBanner ?? '';
    board.matchCounter = snap.matchCounter ?? 1;
    board.totalEntryFeesCollected = snap.totalEntryFeesCollected ?? 0;
    board.botAssisted = Boolean(snap.botAssisted);
    board.lastSettledSideBetSnapshot = snap.lastSettledSideBetSnapshot
      ? {
          ...snap.lastSettledSideBetSnapshot,
          bets: snap.lastSettledSideBetSnapshot.bets.map((b) => ({ ...b })),
        }
      : null;
    return board;
  }

  public static createDefaultBoards(randomGenerator: IRandomGenerator, feeStrategy: TierFeeStrategy): DiceBoard[] {
    const configs: { id: string; tierId: TierId }[] = [
      { id: 'board_tier1_t1', tierId: TierId.TIER_1 },
      { id: 'board_tier2_t1', tierId: TierId.TIER_2 },
      { id: 'board_tier3_t1', tierId: TierId.TIER_3 },
      { id: 'board_tier4_t1', tierId: TierId.TIER_4 },
      { id: 'board_tier5_t1', tierId: TierId.TIER_5 },
      { id: 'board_tier6_t1', tierId: TierId.TIER_6 },
    ];
    return configs.map(
      (c) => new DiceBoard(c.id, feeStrategy.getTierById(c.tierId), randomGenerator, feeStrategy, 1)
    );
  }
}
