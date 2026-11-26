import crypto from 'crypto';
import { PlatformStoreData, ServerBotRiskSummary } from '../ServerTypes';
import { AuditAndAlertLedger } from './AuditAndAlertLedger';

export class BotRiskCoordinator {
  constructor(
    private readonly store: PlatformStoreData,
    private readonly ledger: AuditAndAlertLedger
  ) {}

  public computeSummary(now = Date.now()): ServerBotRiskSummary {
    const hourCutoff = now - 60 * 60 * 1000;
    const dayCutoff = now - 24 * 60 * 60 * 1000;
    let hourlyNet = 0;
    let dailyNet = 0;

    for (const entry of this.store.botLiquidityLedger) {
      if (entry.kind !== 'MAIN_MATCH' && entry.kind !== 'SIDE_BET') continue;
      if (entry.createdAt >= dayCutoff) dailyNet += entry.netTokens;
      if (entry.createdAt >= hourCutoff) hourlyNet += entry.netTokens;
    }

    const hourlyLossUsedTokens = Math.max(0, -hourlyNet);
    const dailyLossUsedTokens = Math.max(0, -dailyNet);
    let autoPausedReason: string | null = null;

    const minBetFloor = Math.max(1, this.store.economyConfig?.minBetTokens ?? 30);
    if (this.store.botPoolBalanceTokens < minBetFloor) {
      autoPausedReason = `Bot liquidity pool balance below minimum ${minBetFloor.toLocaleString()} TKN stake`;
    } else if (dailyLossUsedTokens >= this.store.botConfig.maxDailyLossTokens) {
      autoPausedReason = `24h bot loss cap reached (${dailyLossUsedTokens.toLocaleString()} / ${this.store.botConfig.maxDailyLossTokens.toLocaleString()} TKN)`;
    } else if (hourlyLossUsedTokens >= this.store.botConfig.maxHourlyLossTokens) {
      autoPausedReason = `1h bot loss cap reached (${hourlyLossUsedTokens.toLocaleString()} / ${this.store.botConfig.maxHourlyLossTokens.toLocaleString()} TKN)`;
    } else if (this.store.botCooldownMatchesRemaining > 0) {
      autoPausedReason = `Anti-Martingale cooldown active (${this.store.botCooldownMatchesRemaining} match(es) remaining)`;
    }

    return {
      poolBalanceTokens: this.store.botPoolBalanceTokens,
      hourlyNetPnlTokens: hourlyNet,
      dailyNetPnlTokens: dailyNet,
      hourlyLossUsedTokens,
      dailyLossUsedTokens,
      consecutiveLosses: this.store.botConsecutiveLosses,
      cooldownMatchesRemaining: this.store.botCooldownMatchesRemaining,
      isAutoPaused: autoPausedReason !== null,
      autoPausedReason,
    };
  }

  public recordMatchOutcome(
    kind: 'MAIN_MATCH' | 'SIDE_BET',
    boardId: string,
    roomLabel: string,
    botUsername: string,
    opponentSummary: string,
    stakeTokens: number,
    payoutTokens: number,
    humanParticipants: { userId: string; username: string; won: boolean }[]
  ): void {
    const now = Date.now();
    const netTokens = payoutTokens - stakeTokens;
    this.store.botPoolBalanceTokens = Math.max(0, this.store.botPoolBalanceTokens + netTokens);

    this.store.botLiquidityLedger.unshift({
      id: `botl_${now}_${crypto.randomBytes(3).toString('hex')}`,
      kind,
      boardId,
      roomLabel,
      botUsername,
      opponentSummary,
      stakeTokens,
      payoutTokens,
      netTokens,
      poolBalanceAfter: this.store.botPoolBalanceTokens,
      note:
        netTokens >= 0
          ? `${kind === 'SIDE_BET' ? 'Side-bet' : 'Match'} settled (+${netTokens.toLocaleString()} TKN to bot pool)`
          : `${kind === 'SIDE_BET' ? 'Side-bet' : 'Match'} paid human (${netTokens.toLocaleString()} TKN from bot pool)`,
      createdAt: now,
    });
    if (this.store.botLiquidityLedger.length > 500) {
      this.store.botLiquidityLedger = this.store.botLiquidityLedger.slice(0, 500);
    }

    if (kind === 'MAIN_MATCH') {
      if (netTokens < 0) {
        this.store.botConsecutiveLosses += 1;
        if (
          this.store.botConfig.cooldownAfterLosses > 0 &&
          this.store.botConsecutiveLosses >= this.store.botConfig.cooldownAfterLosses
        ) {
          this.store.botCooldownMatchesRemaining = this.store.botConfig.cooldownMatchCount;
          this.store.botConsecutiveLosses = 0;
          if (this.store.botCooldownMatchesRemaining > 0) {
            this.ledger.appendRiskAlert(
              {
                type: 'BOT_LOSS_CAP_HIT',
                severity: 'INFO',
                title: 'Bot Anti-Martingale Cooldown Activated',
                details: `Bot lost ${this.store.botConfig.cooldownAfterLosses} consecutive matches on fixed stakes. Sitting out next ${this.store.botCooldownMatchesRemaining} matches.`,
                metrics: {
                  cooldownMatches: this.store.botCooldownMatchesRemaining,
                  poolBalance: this.store.botPoolBalanceTokens,
                },
              },
              60_000
            );
          }
        }
      } else {
        this.store.botConsecutiveLosses = 0;
      }
    }

    for (const h of humanParticipants) {
      const stat = this.store.playerRiskStats[h.userId] ?? {
        userId: h.userId,
        username: h.username,
        totalResolved: 0,
        totalWins: 0,
        consecutiveWins: 0,
        lastWinAt: 0,
        lastFlaggedStreak: 0,
        lastFlaggedWinRateMatches: 0,
      };
      stat.username = h.username;
      stat.totalResolved += 1;
      if (h.won) {
        stat.totalWins += 1;
        stat.consecutiveWins += 1;
        stat.lastWinAt = now;
      } else {
        stat.consecutiveWins = 0;
        stat.lastFlaggedStreak = 0;
      }

      if (
        stat.consecutiveWins >= this.store.botConfig.winStreakAlertThreshold &&
        stat.consecutiveWins > stat.lastFlaggedStreak
      ) {
        stat.lastFlaggedStreak = stat.consecutiveWins;
        this.ledger.appendRiskAlert({
          type: 'WIN_STREAK',
          severity:
            stat.consecutiveWins >= this.store.botConfig.winStreakAlertThreshold + 3
              ? 'CRITICAL'
              : 'WARNING',
          userId: stat.userId,
          username: stat.username,
          title: `Win-Streak Review: @${stat.username} (${stat.consecutiveWins} consecutive wins)`,
          details: `Account @${stat.username} won ${stat.consecutiveWins} consecutive matches (${stat.totalWins}/${stat.totalResolved} total).`,
          metrics: {
            consecutiveWins: stat.consecutiveWins,
            totalWins: stat.totalWins,
            totalMatches: stat.totalResolved,
          },
        });
      }

      const winRate = stat.totalResolved > 0 ? stat.totalWins / stat.totalResolved : 0;
      if (
        stat.totalResolved >= 10 &&
        winRate >= 0.85 &&
        stat.totalResolved - stat.lastFlaggedWinRateMatches >= 5
      ) {
        stat.lastFlaggedWinRateMatches = stat.totalResolved;
        this.ledger.appendRiskAlert({
          type: 'HIGH_WIN_RATE',
          severity: 'WARNING',
          userId: stat.userId,
          username: stat.username,
          title: `High Win-Rate Anomaly: @${stat.username} (${Math.round(winRate * 100)}%)`,
          details: `Win rate reached ${Math.round(winRate * 100)}% over ${stat.totalResolved} resolved matches.`,
          metrics: {
            winRatePct: Math.round(winRate * 100),
            totalWins: stat.totalWins,
            totalMatches: stat.totalResolved,
          },
        });
      }
      this.store.playerRiskStats[h.userId] = stat;
    }

    const summary = this.computeSummary(now);
    if (
      summary.dailyLossUsedTokens >= this.store.botConfig.maxDailyLossTokens ||
      summary.hourlyLossUsedTokens >= this.store.botConfig.maxHourlyLossTokens
    ) {
      this.ledger.appendRiskAlert(
        {
          type: 'BOT_LOSS_CAP_HIT',
          severity: 'CRITICAL',
          title: 'Bot Loss Cap Reached — Bots Auto-Paused',
          details: summary.autoPausedReason ?? 'Hourly or daily bot loss cap reached.',
          metrics: {
            hourlyLossUsed: summary.hourlyLossUsedTokens,
            dailyLossUsed: summary.dailyLossUsedTokens,
            poolBalance: summary.poolBalanceTokens,
          },
        },
        300_000
      );
    } else if (summary.poolBalanceTokens < 500) {
      this.ledger.appendRiskAlert(
        {
          type: 'BOT_POOL_LOW',
          severity: 'WARNING',
          title: `Bot Liquidity Pool Low (${summary.poolBalanceTokens.toLocaleString()} TKN)`,
          details: 'Top up the dedicated Bot Liquidity Pool from Admin Panel to sustain automated rooms.',
          metrics: { poolBalance: summary.poolBalanceTokens },
        },
        600_000
      );
    }
  }
}
