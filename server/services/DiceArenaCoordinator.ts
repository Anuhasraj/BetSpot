import crypto from 'crypto';
import {
  DiceBoard,
  DiceRollEvent,
  ServerDiceBoardSnapshot,
} from '../../src/domain/DiceBoard';
import { SIDE_BET_OPTIONS, SideBetRound } from '../../src/domain/SideBetRound';
import { TierFeeStrategy, TokenEconomy } from '../../src/domain/TokenEconomy';
import {
  GamePhase,
  IRandomGenerator,
  SideBetCategory,
  SideBetOptionKey,
  TierId,
  TransactionType,
} from '../../src/domain/types';
import { User } from '../../src/domain/User';
import { BotSimulationService } from '../../src/services/BotSimulationService';
import {
  CommitChangesFn,
  PlatformStoreData,
  ServerInsufficientTokensError,
  ServerRoomInvite,
} from '../ServerTypes';
import { AuditAndAlertLedger } from './AuditAndAlertLedger';
import { BotRiskCoordinator } from './BotRiskCoordinator';
import { PromoRiskService } from './PromoRiskService';
import { UserAuthAccountService } from './UserAuthAccountService';
import { WalletPaymentService } from './WalletPaymentService';

export class DiceArenaCoordinator {
  private diceBoards: DiceBoard[] = [];
  private readonly rollRevealEndsAt = new Map<string, number>();
  private readonly settledAtByBoard = new Map<string, number>();
  private readonly lobbyEndsAtByBoard = new Map<string, number>();
  private readonly activeInvites = new Map<string, ServerRoomInvite>();
  private readonly inviteBroadcastCooldowns = new Map<string, number>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ticksSinceSave = 0;

  constructor(
    private readonly store: PlatformStoreData,
    private readonly users: Map<string, User>,
    private readonly userService: UserAuthAccountService,
    private readonly walletService: WalletPaymentService,
    private readonly botCoordinator: BotRiskCoordinator,
    private readonly promoService: PromoRiskService,
    private readonly random: IRandomGenerator,
    private readonly feeStrategy: TierFeeStrategy,
    private readonly botService: BotSimulationService,
    private readonly ledger: AuditAndAlertLedger,
    private readonly commitChanges: CommitChangesFn
  ) {}

  private get botUsers(): User[] {
    return Array.from(this.users.values()).filter((u) => u.isBot);
  }

  private attachBoardIncomeListener(board: DiceBoard): void {
    board.setIncomeListener((rec) => {
      this.walletService.recordPlatformIncome(rec);
    });
  }

  public initBoards(): void {
    const rawSaved = Array.isArray(this.store.telemetry?.diceBoards)
      ? (this.store.telemetry.diceBoards as ServerDiceBoardSnapshot[])
      : [];
    const savedById = new Map<string, ServerDiceBoardSnapshot>();
    for (const b of rawSaved) {
      if (b && typeof b.id === 'string' && b.tier?.id) {
        savedById.set(b.id, b);
      }
    }

    const defaults = DiceBoard.createDefaultBoards(this.random, this.feeStrategy);
    const rebuilt: DiceBoard[] = [];
    for (const def of defaults) {
      const saved = savedById.get(def.id);
      if (saved) {
        const restored = DiceBoard.fromServerSnapshot(saved, this.random, this.feeStrategy);
        this.attachBoardIncomeListener(restored);
        rebuilt.push(restored);
        savedById.delete(def.id);
      } else {
        this.attachBoardIncomeListener(def);
        rebuilt.push(def);
      }
    }
    for (const extra of savedById.values()) {
      const restored = DiceBoard.fromServerSnapshot(extra, this.random, this.feeStrategy);
      this.attachBoardIncomeListener(restored);
      rebuilt.push(restored);
    }

    for (const board of rebuilt) {
      if (board.pendingRollReveal) {
        this.rollRevealEndsAt.set(board.id, Date.now() + 1200);
      }
      if (board.phase === GamePhase.SETTLED) {
        this.settledAtByBoard.set(board.id, Date.now());
      }
    }

    this.diceBoards = rebuilt;
    this.syncRoomInvitesFromBoards();
  }

  public start(): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => {
      try {
        this.onServerSecondTick();
      } catch (err) {
        console.error('[DiceArenaCoordinator] tick error:', err);
      }
    }, 1000);
  }

  public stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  public serializePublicBoards(): ServerDiceBoardSnapshot[] {
    return this.diceBoards.map((b) => b.toSnapshot(true));
  }

  public serializeAdminBoards(): ServerDiceBoardSnapshot[] {
    return this.diceBoards.map((b) => b.toSnapshot(false));
  }

  public serializeAdminPanelBoards() {
    return this.diceBoards.map((b) => {
      const snap = b.toSnapshot(false);
      return {
        id: snap.id,
        tierId: snap.tier.id,
        tierLabel: snap.tier.label,
        feeRate: snap.tier.feeRate,
        maxSeats: snap.tier.maxSeats,
        tableNumber: snap.tableNumber,
        tableLabel: snap.tableLabel,
        phase: snap.phase,
        lockedPot: b.lockedPot,
        matchCounter: snap.matchCounter,
        occupiedCount: b.occupiedCount,
        seats: b.occupiedSeats.map((s) => ({
          seatIndex: s.seatIndex,
          userId: s.userId,
          username: s.username,
          isBot: Boolean(s.isBot || this.users.get(s.userId)?.isBot),
          initialBet: s.initialBet,
          lockedBet: s.lockedBet,
          rollValue: s.rollValue,
          tieBreakerRolls: [...s.tieBreakerRolls],
          hasRolled: s.hasRolled,
          joinedAt: s.joinedAt,
        })),
        activeSideBetRound: snap.activeSideBetRound
          ? {
              id: snap.activeSideBetRound.id,
              roundNumber: snap.activeSideBetRound.roundNumber,
              rollerUsername: snap.activeSideBetRound.rollerUsername,
              secondsRemaining: snap.activeSideBetRound.secondsRemaining,
              isClosed: snap.activeSideBetRound.isClosed,
              rolledFace: snap.activeSideBetRound.rolledFace,
              bets: snap.activeSideBetRound.bets.map((bet) => ({
                ...bet,
                isBot: Boolean(this.users.get(bet.userId)?.isBot),
              })),
            }
          : null,
        pastSideBetReports: snap.pastSideBetReports.map((rep) => ({
          roundId: rep.roundId,
          rolledFace: rep.rolledFace,
          totalPoolPlaced: rep.totalPoolPlaced,
          totalMatched: rep.totalMatched,
          totalRefunded: rep.totalRefunded,
          totalFeesCollected: rep.totalFeesCollected,
          winners: rep.winners.map((w) => ({
            username: w.username,
            option: w.option,
            netPayout: w.netPayout,
            fee: w.fee,
          })),
        })),
        matchHistory: snap.matchHistory.map((m) => ({
          ...m,
          winnerIsBot: Boolean(this.users.get(m.winnerUserId)?.isBot),
        })),
      };
    });
  }

  public getActiveInvites(): ServerRoomInvite[] {
    return Array.from(this.activeInvites.values());
  }

  public markPersistTick(): void {
    this.ticksSinceSave = 0;
  }

  private requireBoard(boardId: string): DiceBoard {
    const board = this.diceBoards.find((b) => b.id === boardId);
    if (!board) {
      throw new Error('Dice room not found.');
    }
    return board;
  }

  private ensureOpenBoardForTier(tierId: TierId): void {
    const hasJoinable = this.diceBoards.some(
      (b) => b.tier.id === tierId && b.isJoinableForPlay
    );
    if (!hasJoinable) {
      const tierBoards = this.diceBoards.filter((b) => b.tier.id === tierId);
      const nextTableNum = tierBoards.length + 1;
      const nextBoard = new DiceBoard(
        `board_${tierId.toLowerCase()}_t${nextTableNum}_${Date.now().toString(36).slice(-4)}`,
        this.feeStrategy.getTierById(tierId),
        this.random,
        this.feeStrategy,
        nextTableNum
      );
      this.attachBoardIncomeListener(nextBoard);
      this.diceBoards.push(nextBoard);
    }
  }

  /** Removes idle overflow rooms so long-running servers do not accumulate empty tables. */
  private pruneExcessEmptyBoards(): boolean {
    let pruned = false;
    const joinableCountByTier = new Map<TierId, number>();
    for (const b of this.diceBoards) {
      if (b.isJoinableForPlay) {
        joinableCountByTier.set(b.tier.id, (joinableCountByTier.get(b.tier.id) ?? 0) + 1);
      }
    }

    this.diceBoards = this.diceBoards.filter((b) => {
      const isDefaultPrimary = b.tableNumber === 1;
      const isCompletelyEmpty =
        b.phase === GamePhase.WAITING_FOR_PLAYERS &&
        b.occupiedCount === 0 &&
        b.lobbyVisitors.length === 0 &&
        b.sideBettors.length === 0;
      const openInTier = joinableCountByTier.get(b.tier.id) ?? 0;

      if (!isDefaultPrimary && isCompletelyEmpty && openInTier > 1) {
        joinableCountByTier.set(b.tier.id, openInTier - 1);
        this.rollRevealEndsAt.delete(b.id);
        this.settledAtByBoard.delete(b.id);
        this.lobbyEndsAtByBoard.delete(b.id);
        this.activeInvites.delete(b.id);
        pruned = true;
        return false;
      }
      return true;
    });

    return pruned;
  }

  public syncRoomInvitesFromBoards(): void {
    const now = Date.now();
    const seenBoardIds = new Set<string>();

    for (const board of this.diceBoards) {
      if (
        board.phase === GamePhase.LOBBY_COUNTDOWN &&
        board.occupiedCount > 0 &&
        board.occupiedCount < board.maxSeats &&
        board.lobbySecondsRemaining > 0
      ) {
        const seated = board.occupiedSeats;
        const humanHost = seated.find((s) => !s.isBot) ?? seated[0];
        if (!humanHost) continue;

        seenBoardIds.add(board.id);
        const existing = this.activeInvites.get(board.id);
        const lastBroadcast = this.inviteBroadcastCooldowns.get(board.id) ?? 0;
        const shouldAlert = !existing || now - lastBroadcast >= 20_000;
        if (shouldAlert) {
          this.inviteBroadcastCooldowns.set(board.id, now);
        }

        const hostUser = this.users.get(humanHost.userId);
        const minJoinedBet = Math.min(...seated.map((s) => s.initialBet));
        const endsAt = now + board.lobbySecondsRemaining * 1000;
        this.lobbyEndsAtByBoard.set(board.id, endsAt);

        const invite: ServerRoomInvite = {
          id: existing?.id ?? `inv_${board.id}_${now}`,
          boardId: board.id,
          tierId: board.tier.id,
          tierLabel: board.tier.label,
          roomLabel: board.tableLabel,
          tableNumber: board.tableNumber,
          hostUserId: humanHost.userId,
          hostUsername: humanHost.username,
          hostDisplayName: hostUser?.displayName ?? humanHost.username,
          hostAvatarUrl: hostUser?.avatarUrl ?? humanHost.avatarUrl,
          hostAvatarFrameId: hostUser?.avatarFrameId,
          hostCountry: hostUser?.country,
          betAmountTokens: humanHost.initialBet,
          currentMinBet: minJoinedBet,
          minBetTokens: board.tier.minTokens,
          maxBetTokens: board.tier.maxTokens,
          occupiedCount: board.occupiedCount,
          maxSeats: board.maxSeats,
          seats: seated.map((s) => {
            const su = this.users.get(s.userId);
            return {
              seatIndex: s.seatIndex,
              userId: s.userId,
              username: s.username,
              displayName: su?.displayName ?? s.username,
              avatarUrl: su?.avatarUrl ?? s.avatarUrl,
              avatarFrameId: su?.avatarFrameId,
              country: su?.country,
              betAmountTokens: s.initialBet,
              isBot: false,
            };
          }),
          status: 'WAITING',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          lastBroadcastAt: shouldAlert ? now : existing?.lastBroadcastAt ?? now,
          lobbyEndsAt: endsAt,
        };
        this.activeInvites.set(board.id, invite);
      } else {
        this.activeInvites.delete(board.id);
        this.lobbyEndsAtByBoard.delete(board.id);
      }
    }

    for (const boardId of Array.from(this.activeInvites.keys())) {
      if (!seenBoardIds.has(boardId)) {
        this.activeInvites.delete(boardId);
      }
    }
  }

  private snapshotParticipantStates(board: DiceBoard): Map<string, { avail: number; held: number }> {
    const snap = new Map<string, { avail: number; held: number }>();
    for (const s of board.occupiedSeats) {
      if (s.isBot) continue;
      const u = this.users.get(s.userId);
      if (u) snap.set(u.id, { avail: u.wallet.availableBalance, held: u.wallet.heldBalance });
    }
    for (const b of board.activeSideBetRound?.bets ?? []) {
      const u = this.users.get(b.userId);
      if (u && !u.isBot) snap.set(u.id, { avail: u.wallet.availableBalance, held: u.wallet.heldBalance });
    }
    return snap;
  }

  private collectModifiedUsers(
    before: Map<string, { avail: number; held: number }>,
    target: Set<string>
  ): void {
    for (const [id, prev] of before.entries()) {
      const u = this.users.get(id);
      if (!u) continue;
      if (u.wallet.availableBalance !== prev.avail || u.wallet.heldBalance !== prev.held) {
        target.add(id);
      }
    }
  }

  private startAuthoritativeRoll(board: DiceBoard, autoTriggered: boolean): DiceRollEvent {
    const face = this.random.rollDaduketaFace();
    const oppositeFace = this.random.getOppositeFace(face);
    const rollId = `roll_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const event = board.beginAnimatedRoll(autoTriggered, {
      id: rollId,
      face,
      oppositeFace,
      isTieBreaker: board.phase === GamePhase.TIE_BREAKER,
      timestamp: Date.now(),
    });
    this.rollRevealEndsAt.set(board.id, Date.now() + 2600);
    return event;
  }

  private completeBoardRollAndRecordOutcomes(board: DiceBoard): void {
    const preMatchCounter = board.matchCounter;
    const preSeats = board.occupiedSeats.map((s) => ({ ...s }));
    const prePhase = board.phase;

    const completed = board.completeAnimatedRoll((id) => this.users.get(id));
    if (!completed) return;

    const hasBotInMatch = preSeats.some((s) => s.isBot);

    if (board.lastSettledSideBetSnapshot) {
      const sbSnap = board.lastSettledSideBetSnapshot;
      const botBets = sbSnap.bets.filter((b) => b.isBot);
      const humanBets = sbSnap.bets.filter((b) => !b.isBot && b.matchedStake > 0);
      if (botBets.length > 0 && humanBets.length > 0) {
        const botStake = botBets.reduce((s, b) => s + b.matchedStake, 0);
        const botPayout = botBets.reduce((s, b) => s + b.payout, 0);
        if (botStake > 0 || botPayout > 0) {
          this.botCoordinator.recordMatchOutcome(
            'SIDE_BET',
            board.id,
            `${board.tableLabel} · Roll #${sbSnap.roundNumber}`,
            botBets.map((b) => b.username).join(', '),
            humanBets.map((b) => `@${b.username}`).slice(0, 4).join(', '),
            botStake,
            botPayout,
            []
          );
        }
      }

      if (humanBets.length > 0) {
        const hasBotCounter = botBets.some((b) => b.matchedStake > 0);
        this.promoService.recordOutcomes(
          `${board.tableLabel} · Side-Bet R#${sbSnap.roundNumber}`,
          humanBets.map((b) => ({
            userId: b.userId,
            stakeTokens: b.matchedStake,
            payoutTokens: b.payout,
            hasBotOpponent: hasBotCounter,
          }))
        );
      }
    }

    if (prePhase !== GamePhase.SETTLED && board.phase === GamePhase.SETTLED) {
      this.settledAtByBoard.set(board.id, Date.now());
      const latestResult = board.matchHistory[0];
      if (latestResult && latestResult.matchNumber === preMatchCounter) {
        const humanSeats = preSeats.filter((s) => !s.isBot);
        const botSeats = preSeats.filter((s) => s.isBot);

        if (botSeats.length > 0 && humanSeats.length > 0) {
          const botStake = botSeats.reduce((sum, s) => sum + s.lockedBet, 0);
          const botWon = botSeats.some((s) => s.userId === latestResult.winnerUserId);
          const botPayout = botWon ? latestResult.netPayout : 0;
          this.botCoordinator.recordMatchOutcome(
            'MAIN_MATCH',
            board.id,
            `${board.tableLabel} · Match #${latestResult.matchNumber}`,
            botSeats.map((s) => s.username).join(', '),
            humanSeats.map((s) => `@${s.username}`).join(', '),
            botStake,
            botPayout,
            humanSeats.map((s) => ({
              userId: s.userId,
              username: s.username,
              won: s.userId === latestResult.winnerUserId,
            }))
          );
        }

        if (humanSeats.length > 0) {
          this.promoService.recordOutcomes(
            `${board.tableLabel} · Match #${latestResult.matchNumber}`,
            humanSeats.map((s) => ({
              userId: s.userId,
              stakeTokens: s.lockedBet,
              payoutTokens: s.userId === latestResult.winnerUserId ? latestResult.netPayout : 0,
              hasBotOpponent: hasBotInMatch,
            }))
          );
        }
      }
    }
  }

  private onServerSecondTick(): void {
    let anyChanged = false;
    let criticalPersist = false;
    const affectedUsers = new Set<string>();
    const now = Date.now();

    for (const board of [...this.diceBoards]) {
      if (board.pendingRollReveal) {
        const endAt = this.rollRevealEndsAt.get(board.id) ?? 0;
        if (now >= endAt) {
          this.rollRevealEndsAt.delete(board.id);
          const beforeUsers = this.snapshotParticipantStates(board);
          this.completeBoardRollAndRecordOutcomes(board);
          this.collectModifiedUsers(beforeUsers, affectedUsers);
          anyChanged = true;
          criticalPersist = true;
        }
        continue;
      }

      if (board.phase === GamePhase.LOBBY_COUNTDOWN) {
        if (board.occupiedCount >= 2) {
          board.lobbySecondsRemaining = 0;
        } else if (board.lobbySecondsRemaining > 0) {
          board.lobbySecondsRemaining = Math.max(0, board.lobbySecondsRemaining - 1);
          anyChanged = true;
        }

        if (board.lobbySecondsRemaining === 0) {
          if (board.occupiedCount === 1 && !board.hasBotSeated && this.store.botConfig.enabled) {
            const botSummary = this.botCoordinator.computeSummary(now);
            const seatedBots = this.botService.addBotsToBoard(
              board,
              this.botUsers,
              this.store.botConfig,
              botSummary
            );
            if (seatedBots.length === 0 && this.store.botCooldownMatchesRemaining > 0) {
              this.store.botCooldownMatchesRemaining = Math.max(0, this.store.botCooldownMatchesRemaining - 1);
            }
          }

          const beforeUsers = this.snapshotParticipantStates(board);
          board.startMatchIfReady((id) => this.users.get(id));
          this.collectModifiedUsers(beforeUsers, affectedUsers);
          this.ensureOpenBoardForTier(board.tier.id);
          anyChanged = true;
          criticalPersist = true;
        }
        continue;
      }

      if (board.phase === GamePhase.SIDE_BET_WINDOW) {
        const round = board.activeSideBetRound;
        if (round && !round.isClosed && round.secondsRemaining > 0) {
          round.secondsRemaining -= 1;
          anyChanged = true;

          const elapsed = DiceBoard.SIDE_BET_WINDOW_SECONDS - round.secondsRemaining;
          if (
            !board.botSideBetTriggeredThisRound &&
            elapsed >= this.store.botConfig.sideBetTriggerDelaySeconds
          ) {
            board.botSideBetTriggeredThisRound = true;
            const botSummary = this.botCoordinator.computeSummary(now);
            this.botService.placeAutomatedBotSideBets(
              board,
              this.botUsers,
              this.store.botConfig,
              botSummary
            );
          }
        }
        if (!round || round.secondsRemaining <= 0) {
          board.closeSideBetWindowAndAdvanceTurn();
          anyChanged = true;
          criticalPersist = true;
        }
        continue;
      }

      if (
        (board.phase === GamePhase.IN_PROGRESS_ROLL || board.phase === GamePhase.TIE_BREAKER) &&
        board.currentTurnSeatIndex !== null
      ) {
        const activeSeat = board.seats[board.currentTurnSeatIndex];
        if (activeSeat?.isBot) {
          if (board.botTurnDelaySeconds > 0) {
            board.botTurnDelaySeconds -= 1;
            anyChanged = true;
          }
          if (board.botTurnDelaySeconds <= 0) {
            this.startAuthoritativeRoll(board, false);
            anyChanged = true;
            criticalPersist = true;
          }
        } else if (activeSeat) {
          if (board.turnRollSecondsRemaining > 0) {
            board.turnRollSecondsRemaining -= 1;
            anyChanged = true;
          }
          if (board.turnRollSecondsRemaining <= 0) {
            this.startAuthoritativeRoll(board, true);
            anyChanged = true;
            criticalPersist = true;
          }
        }
        continue;
      }

      if (board.phase === GamePhase.SETTLED) {
        const settledAt = this.settledAtByBoard.get(board.id) ?? now;
        if (board.occupiedCount === 0 || now - settledAt >= 45_000) {
          this.settledAtByBoard.delete(board.id);
          board.resetForNextMatch();
          anyChanged = true;
          criticalPersist = true;
        }
      }
    }

    if (this.pruneExcessEmptyBoards()) {
      anyChanged = true;
    }

    if (anyChanged) {
      this.ticksSinceSave += 1;
      const shouldPersist = criticalPersist || this.ticksSinceSave >= 5;
      this.commitChanges({
        persistNow: shouldPersist,
        affectedUserIds: Array.from(affectedUsers),
        broadcastArena: true,
      });
    }
  }

  public enterTierForPlay(userId: string, tierId: TierId, betAmount?: number): {
    mode: 'JOIN_SEAT' | 'SPECTATE_ONLY' | 'NEEDS_TOPUP' | 'ALREADY_SEATED';
    boardId: string;
    message: string;
    requiredTokens?: number;
  } {
    const user = this.userService.requireActiveHumanUser(userId);
    const tier = this.feeStrategy.getTierById(tierId);

    const existingSeatBoard = this.diceBoards.find((b) => b.isUserActivelySeated(user.id));
    if (existingSeatBoard) {
      return {
        mode: 'ALREADY_SEATED',
        boardId: existingSeatBoard.id,
        message: `You already hold a seat in ${existingSeatBoard.tableLabel}. Complete or exit your active room first.`,
      };
    }

    if (tierId !== TierId.TIER_1 && this.promoService.isTierRestrictedForPurePromo(userId)) {
      throw new Error(
        'Higher tiers unlock after your first verified deposit. You can play freely in Tier 1 Bronze rooms.'
      );
    }

    const validBet =
      typeof betAmount === 'number' && Number.isFinite(betAmount)
        ? Math.max(tier.minTokens, Math.min(tier.maxTokens, Math.round(betAmount)))
        : undefined;

    const requiredTokens = validBet ?? tier.minTokens;
    if (!user.wallet.canAfford(requiredTokens)) {
      const activeBoard = this.diceBoards.find((b) => b.tier.id === tierId) ?? this.diceBoards[0];
      return {
        mode: 'NEEDS_TOPUP',
        boardId: activeBoard?.id ?? '',
        requiredTokens,
        message: `Insufficient tokens for ${tier.label}. Selected bet requires ${requiredTokens.toLocaleString()} TKN.`,
      };
    }

    const tierBoards = this.diceBoards.filter((b) => b.tier.id === tierId);

    // Smart Room Allocation:
    // 1. Look for existing rooms in this tier that are WAITING or in LOBBY_COUNTDOWN with active players (occupiedCount > 0)
    //    NEVER disrupt a match that is already rolling (IN_PROGRESS_ROLL, SIDE_BET_WINDOW, TIE_BREAKER)!
    //    And verify the bet is compatible with the room's current stakes!
    const joinableBoard =
      tierBoards.find((b) => {
        if (!b.isJoinableForPlay || b.occupiedCount === 0) return false;
        if (b.phase !== GamePhase.WAITING_FOR_PLAYERS && b.phase !== GamePhase.LOBBY_COUNTDOWN) return false;
        if (validBet && b.currentMinBet !== null && validBet < b.currentMinBet) return false;
        return true;
      }) ??
      tierBoards.find(
        (b) =>
          b.isJoinableForPlay &&
          b.phase === GamePhase.WAITING_FOR_PLAYERS &&
          b.occupiedCount === 0
      );

    if (joinableBoard) {
      if (validBet) {
        this.walletService.enforceDailyBetLimit(user, validBet);
        const soloTarget = Math.max(DiceBoard.LOBBY_COUNTDOWN_SECONDS, this.store.botConfig.triggerWaitSeconds);
        const beforeUsers = this.snapshotParticipantStates(joinableBoard);
        joinableBoard.joinMainSeat(user, validBet, undefined, soloTarget);
        if (joinableBoard.occupiedCount >= 2) {
          joinableBoard.startMatchIfReady((id) => this.users.get(id));
        }
        this.ensureOpenBoardForTier(tierId);
        const affected = new Set<string>([userId]);
        this.collectModifiedUsers(beforeUsers, affected);
        this.commitChanges({ persistNow: true, affectedUserIds: Array.from(affected), broadcastArena: true });
      } else {
        joinableBoard.registerLobbyVisitor(user);
        this.commitChanges({ persistNow: false, broadcastArena: true });
      }
      return {
        mode: 'JOIN_SEAT',
        boardId: joinableBoard.id,
        message: `Joined ${joinableBoard.tableLabel} waiting room.`,
      };
    }

    const nextTableNum = tierBoards.length + 1;
    const newBoard = new DiceBoard(
      `board_${tierId.toLowerCase()}_t${nextTableNum}_${Date.now().toString(36).slice(-4)}`,
      tier,
      this.random,
      this.feeStrategy,
      nextTableNum
    );
    this.attachBoardIncomeListener(newBoard);
    this.diceBoards.push(newBoard);
    if (validBet) {
      this.walletService.enforceDailyBetLimit(user, validBet);
      const soloTarget = Math.max(DiceBoard.LOBBY_COUNTDOWN_SECONDS, this.store.botConfig.triggerWaitSeconds);
      newBoard.joinMainSeat(user, validBet, undefined, soloTarget);
      this.ensureOpenBoardForTier(tierId);
    } else {
      newBoard.registerLobbyVisitor(user);
    }
    this.commitChanges({ persistNow: true, affectedUserIds: validBet ? [userId] : [], broadcastArena: true });
    return {
      mode: 'JOIN_SEAT',
      boardId: newBoard.id,
      message: `Created ${newBoard.tableLabel} and opened seats for real players!`,
    };
  }

  public leaveLobbyVisitor(userId: string, boardId: string): void {
    const board = this.diceBoards.find((b) => b.id === boardId);
    if (!board) return;
    board.unregisterLobbyVisitor(userId);
    this.commitChanges({ persistNow: false, broadcastArena: true });
  }

  public enterBoardAsSideBettor(userId: string, boardId: string): void {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);
    if (board.isUserSeated(user.id)) {
      // Seated main players can already place side-bets on their active board for free
      return;
    }
    if (!board.isUserSideBettor(user.id)) {
      if (!user.wallet.canAfford(board.tier.spectatorEntryFee)) {
        throw new ServerInsufficientTokensError(
          `Side-bettor entry fee for ${board.tier.label} is ${board.tier.spectatorEntryFee.toLocaleString()} TKN. Please top up your wallet.`,
          board.tier.spectatorEntryFee,
          user.wallet.availableBalance
        );
      }
      board.joinAsSideBettor(user);
    }
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
  }

  public joinMainSeat(userId: string, boardId: string, betAmount: number): void {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);

    if (!Number.isFinite(betAmount)) {
      throw new Error('Invalid bet amount.');
    }
    const roundedBet = Math.round(betAmount);

    if (board.tier.id !== TierId.TIER_1 && this.promoService.isTierRestrictedForPurePromo(userId)) {
      throw new Error(
        'Higher tiers unlock after your first verified deposit. You can play freely in Tier 1 Bronze rooms.'
      );
    }

    const activeElsewhere = this.diceBoards.find((b) => b.id !== board.id && b.isUserSeated(user.id));
    if (activeElsewhere) {
      throw new Error(`You are already seated in ${activeElsewhere.tableLabel}.`);
    }

    if (
      roundedBet >= board.tier.minTokens &&
      roundedBet <= board.tier.maxTokens &&
      !user.wallet.canAfford(roundedBet)
    ) {
      throw new ServerInsufficientTokensError(
        `You need ${roundedBet.toLocaleString()} TKN in your available balance to join this seat.`,
        roundedBet,
        user.wallet.availableBalance
      );
    }

    this.walletService.enforceDailyBetLimit(user, roundedBet);

    const soloTarget = Math.max(DiceBoard.LOBBY_COUNTDOWN_SECONDS, this.store.botConfig.triggerWaitSeconds);
    board.joinMainSeat(user, roundedBet, undefined, soloTarget);
    this.ensureOpenBoardForTier(board.tier.id);
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
  }

  public acceptRoomInviteAndJoin(userId: string, boardId: string, betAmount: number): string {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.diceBoards.find((b) => b.id === boardId);
    if (!board || (board.phase !== GamePhase.WAITING_FOR_PLAYERS && board.phase !== GamePhase.LOBBY_COUNTDOWN)) {
      throw new Error('This match room has already started or expired.');
    }
    if (board.isUserSeated(user.id)) {
      return board.id;
    }
    const activeElsewhere = this.diceBoards.find((b) => b.id !== board.id && b.isUserSeated(user.id));
    if (activeElsewhere) {
      throw new Error(`You are already seated in ${activeElsewhere.tableLabel}.`);
    }
    const requiredMin = Math.max(board.tier.minTokens, board.currentMinBet ?? board.tier.minTokens);
    const roundedStake = Number.isFinite(betAmount) ? Math.round(betAmount) : 0;
    if (roundedStake < requiredMin) {
      throw new Error(`Current minimum bet to join this room is ${requiredMin.toLocaleString()} TKN.`);
    }
    this.joinMainSeat(userId, board.id, roundedStake);
    return board.id;
  }

  public updateMainSeatBet(userId: string, boardId: string, newBetAmount: number): void {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);
    if (!Number.isFinite(newBetAmount)) {
      throw new Error('Invalid bet amount.');
    }
    const roundedNew = Math.round(newBetAmount);
    const existingSeat = board.occupiedSeats.find((s) => s.userId === user.id);
    const deltaIncrease = existingSeat ? Math.max(0, roundedNew - existingSeat.initialBet) : 0;
    if (deltaIncrease > 0) {
      if (!user.wallet.canAfford(deltaIncrease)) {
        throw new ServerInsufficientTokensError(
          `Raising your stake to ${roundedNew.toLocaleString()} TKN requires ${deltaIncrease.toLocaleString()} more TKN.`,
          deltaIncrease,
          user.wallet.availableBalance
        );
      }
      this.walletService.enforceDailyBetLimit(user, deltaIncrease);
    }
    board.updateMainSeatBet(user, roundedNew);
    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
  }

  public leaveMainSeat(userId: string, boardId: string): void {
    const user = this.userService.requireHumanUser(userId);
    const board = this.requireBoard(boardId);
    const beforeUsers = this.snapshotParticipantStates(board);
    board.leaveMainSeat(user, (id) => this.users.get(id));
    const affected = new Set<string>([userId]);
    this.collectModifiedUsers(beforeUsers, affected);
    this.commitChanges({ persistNow: true, affectedUserIds: Array.from(affected), broadcastArena: true });
  }

  public executeUserTurnRoll(userId: string, boardId: string): DiceRollEvent {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);

    if (board.phase !== GamePhase.IN_PROGRESS_ROLL && board.phase !== GamePhase.TIE_BREAKER) {
      throw new Error('Board is not currently in a rolling phase.');
    }
    if (board.pendingRollReveal) {
      return board.pendingRollReveal;
    }
    if (board.currentTurnSeatIndex === null) {
      throw new Error('No active player turn.');
    }
    const activeSeat = board.seats[board.currentTurnSeatIndex];
    if (!activeSeat || activeSeat.userId !== user.id) {
      throw new Error(`It is currently ${activeSeat?.username ?? 'another player'}'s turn to roll!`);
    }

    const rollEvent = this.startAuthoritativeRoll(board, false);
    this.commitChanges({ persistNow: true, broadcastArena: true });
    return rollEvent;
  }

  public quickStartMatch(userId: string, boardId: string): { started: boolean; message: string } {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);
    if (!board.isUserSeated(user.id)) {
      throw new Error('Join a main seat first before starting the match.');
    }
    if (board.phase !== GamePhase.LOBBY_COUNTDOWN) {
      throw new Error('Room is not currently waiting in lobby countdown.');
    }

    if (board.occupiedCount === 1) {
      if (!board.hasBotSeated && this.store.botConfig.enabled) {
        const botSummary = this.botCoordinator.computeSummary(Date.now());
        const seatedBots = this.botService.addBotsToBoard(
          board,
          this.botUsers,
          this.store.botConfig,
          botSummary
        );
        if (seatedBots.length === 0) {
          throw new Error(
            'Waiting for another player to join this tier. Share the Live Table invite or wait for an opponent.'
          );
        }
      } else {
        throw new Error('Waiting for a second player to join this room.');
      }
    }

    const beforeUsers = this.snapshotParticipantStates(board);
    board.lobbySecondsRemaining = 0;
    const started = board.startMatchIfReady((id) => this.users.get(id));
    this.ensureOpenBoardForTier(board.tier.id);
    const affected = new Set<string>([userId]);
    this.collectModifiedUsers(beforeUsers, affected);
    this.commitChanges({
      persistNow: true,
      affectedUserIds: Array.from(affected),
      broadcastArena: true,
    });
    return {
      started,
      message: started
        ? `Match #${board.matchCounter} started! ${DiceBoard.SIDE_BET_WINDOW_SECONDS}s Side-Bet Window is now open.`
        : 'Waiting for another player to join.',
    };
  }

  public placeSideBetBatch(
    userId: string,
    boardId: string,
    items: { category: SideBetCategory; option: SideBetOptionKey; amount: number }[]
  ): { placedCount: number; totalRefunded: number } {
    const user = this.userService.requireActiveHumanUser(userId);
    const board = this.requireBoard(boardId);
    const round = board.activeSideBetRound;
    if (!round || round.isClosed) {
      throw new Error('Side-betting window is closed for this roll.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Select at least one side bet before confirming.');
    }
    if (items.length > 20) {
      throw new Error('Maximum 20 side-bets can be placed per batch.');
    }

    const normalizedItems: { category: SideBetCategory; option: SideBetOptionKey; amount: number }[] = [];
    for (const raw of items) {
      const catOpts = SIDE_BET_OPTIONS[raw.category];
      if (!catOpts || !catOpts.some((o) => o.key === raw.option)) {
        throw new Error('Invalid side-bet category or option.');
      }
      if (!Number.isFinite(raw.amount)) {
        throw new Error('Invalid side-bet stake amount.');
      }
      const roundedAmount = Math.round(raw.amount);
      if (roundedAmount < TokenEconomy.MIN_BET_TOKENS) {
        throw new Error(`Minimum side bet is ${TokenEconomy.MIN_BET_TOKENS} TKN.`);
      }
      normalizedItems.push({
        category: raw.category,
        option: raw.option,
        amount: roundedAmount,
      });
    }

    // Validate option hedging limits per category BEFORE touching wallet or entry fee
    for (const cat of [SideBetCategory.LOW_HIGH, SideBetCategory.COUPLE, SideBetCategory.SINGLE]) {
      const existingOpts = round.getUserOptionsForCategory(user.id, cat);
      const combined = new Set<SideBetOptionKey>(existingOpts);
      for (const item of normalizedItems) {
        if (item.category === cat) combined.add(item.option);
      }
      const maxOpts = SideBetRound.getMaxOptionsForCategory(cat);
      if (combined.size > maxOpts) {
        if (cat === SideBetCategory.LOW_HIGH) {
          throw new Error('Cannot bet both LOW and HIGH simultaneously in the same round.');
        }
        if (cat === SideBetCategory.COUPLE) {
          throw new Error('Cannot bet all 3 Couple pairs simultaneously — maximum 2 pairs per roll.');
        }
        throw new Error(
          'Cannot bet all 6 Single faces simultaneously — maximum 5 Single numbers allowed per roll.'
        );
      }
    }

    const isSeated = board.isUserSeated(user.id);
    const entryFeeNeeded =
      isSeated || board.isUserSideBettor(user.id) ? 0 : board.tier.spectatorEntryFee;
    const totalStake = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const totalRequired = entryFeeNeeded + totalStake;
    if (user.wallet.availableBalance < totalRequired) {
      throw new ServerInsufficientTokensError(
        `Insufficient balance: need ${totalRequired.toLocaleString()} TKN, available ${user.wallet.availableBalance.toLocaleString()} TKN.`,
        totalRequired,
        user.wallet.availableBalance
      );
    }

    this.walletService.enforceDailyBetLimit(user, totalStake);

    const prevAvailable = user.wallet.availableBalance;
    const prevHeld = user.wallet.heldBalance;
    const prevTxs = [...user.wallet.transactions];
    const prevSideBettors = board.sideBettors.map((sb) => ({ ...sb }));
    const prevEntryFeesCollected = board.totalEntryFeesCollected;
    const prevRoundSnap = round.toJSON();

    let placedCount = 0;
    let totalRefunded = 0;
    try {
      if (!isSeated && !board.isUserSideBettor(user.id)) {
        board.joinAsSideBettor(user);
      }
      for (const item of normalizedItems) {
        const { immediateExcessRefund } = round.placeBet(user, item.category, item.option, item.amount);
        placedCount += 1;
        totalRefunded += immediateExcessRefund;
      }
    } catch (err) {
      const availDelta = prevAvailable - user.wallet.availableBalance;
      const heldDelta = prevHeld - user.wallet.heldBalance;
      if (availDelta !== 0) {
        user.wallet.adjustAvailableByAdmin(availDelta, 'Rollback');
      }
      if (heldDelta < 0) {
        user.wallet.consumeHeldTokens(Math.abs(heldDelta));
      } else if (heldDelta > 0) {
        user.wallet.creditAvailable(heldDelta, TransactionType.ADMIN_ADJUSTMENT, 'Rollback');
        user.wallet.holdTokens(heldDelta, 'Rollback');
      }
      user.wallet.restoreTransactions(prevTxs);
      board.sideBettors = prevSideBettors;
      board.totalEntryFeesCollected = prevEntryFeesCollected;
      board.activeSideBetRound = SideBetRound.fromServerSnapshot(prevRoundSnap);
      throw err;
    }

    this.commitChanges({ persistNow: true, affectedUserIds: [userId], broadcastArena: true });
    return { placedCount, totalRefunded };
  }

  public resetBoardForNextMatch(userId: string, boardId: string): void {
    this.userService.requireHumanUser(userId);
    const board = this.requireBoard(boardId);
    if (board.phase !== GamePhase.SETTLED) {
      throw new Error('Board can only be reset after match settlement.');
    }
    this.settledAtByBoard.delete(board.id);
    board.resetForNextMatch();
    this.commitChanges({ persistNow: true, broadcastArena: true });
  }

  public adminCancelDiceMatch(boardId: string, adminUsername: string): void {
    const board = this.requireBoard(boardId);
    const beforeUsers = this.snapshotParticipantStates(board);
    board.cancelMatchByAdmin((id) => this.users.get(id));
    this.rollRevealEndsAt.delete(boardId);
    this.settledAtByBoard.delete(boardId);
    this.ledger.appendAudit(
      adminUsername,
      'ADMIN_CANCEL_DICE_MATCH',
      board.tableLabel,
      `Cancelled Match #${board.matchCounter - 1} and refunded all held tokens`
    );
    const affected = new Set<string>();
    this.collectModifiedUsers(beforeUsers, affected);
    this.commitChanges({ persistNow: true, affectedUserIds: Array.from(affected), broadcastArena: true });
  }

  public adminCancelSideBet(boardId: string, betId: string, adminUsername: string): void {
    const board = this.requireBoard(boardId);
    const bet = board.activeSideBetRound?.bets.find((b) => b.id === betId);
    const ok = board.activeSideBetRound?.cancelBetByAdmin(betId, (id) => this.users.get(id));
    if (!ok || !bet) {
      throw new Error('Side bet not found or already settled.');
    }
    this.ledger.appendAudit(
      adminUsername,
      'ADMIN_CANCEL_SIDE_BET',
      `@${bet.username}`,
      `Cancelled side bet ${bet.option} (${bet.originalStake} TKN) on ${board.tableLabel}`
    );
    this.commitChanges({ persistNow: true, affectedUserIds: [bet.userId], broadcastArena: true });
  }

  public adminSuspendSideBet(boardId: string, betId: string, adminUsername: string): void {
    const board = this.requireBoard(boardId);
    const bet = board.activeSideBetRound?.bets.find((b) => b.id === betId);
    const ok = board.activeSideBetRound?.suspendBetByAdmin(betId);
    if (!ok || !bet) {
      throw new Error('Side bet not found or already settled.');
    }
    this.ledger.appendAudit(
      adminUsername,
      'ADMIN_SUSPEND_SIDE_BET',
      `@${bet.username}`,
      `Toggled side bet ${bet.option} status to ${bet.status}`
    );
    this.commitChanges({ persistNow: true, broadcastArena: true });
  }

  public assertUserDeletable(userId: string): void {
    for (const board of this.diceBoards) {
      if (
        board.isUserSeated(userId) &&
        (board.phase === GamePhase.IN_PROGRESS_ROLL ||
          board.phase === GamePhase.SIDE_BET_WINDOW ||
          board.phase === GamePhase.TIE_BREAKER)
      ) {
        throw new Error(
          `Cannot delete user while seated in active match on ${board.tableLabel}. Cancel the match first.`
        );
      }
    }
  }

  public removeUserFromBoards(userId: string, domainUser: User | undefined): void {
    for (const board of this.diceBoards) {
      board.unregisterLobbyVisitor(userId);
      if (board.isUserSeated(userId)) {
        if (board.phase === GamePhase.WAITING_FOR_PLAYERS || board.phase === GamePhase.LOBBY_COUNTDOWN) {
          if (domainUser) {
            board.leaveMainSeat(domainUser, (id) => this.users.get(id));
          }
        } else if (board.phase === GamePhase.SETTLED) {
          board.seats = board.seats.map((s) => (s?.userId === userId ? null : s));
        }
      }
    }
  }

  public resetAllBoards(): void {
    this.rollRevealEndsAt.clear();
    this.settledAtByBoard.clear();
    this.lobbyEndsAtByBoard.clear();
    this.activeInvites.clear();
    this.diceBoards = DiceBoard.createDefaultBoards(this.random, this.feeStrategy);
    for (const b of this.diceBoards) {
      this.attachBoardIncomeListener(b);
    }
  }
}
