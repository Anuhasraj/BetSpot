import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { IRepository } from '../../src/core/contracts';
import { DEFAULT_ECONOMY_CONFIG, EconomyConfig } from '../../src/domain/EconomyTypes';
import { TierId } from '../../src/domain/types';
import {
  DEFAULT_PROMO_BUDGET_POOL,
  PlatformStoreData,
  ServerBotConfig,
  ServerContactConfig,
  ServerPromoConfig,
  defaultBotConfig,
  defaultContactConfig,
  defaultEconomyConfig,
  defaultPromoConfig,
  emptyIncomeSummary,
} from '../ServerTypes';

const VALID_TIER_IDS = new Set<TierId>([
  TierId.TIER_1,
  TierId.TIER_2,
  TierId.TIER_3,
  TierId.TIER_4,
  TierId.TIER_5,
  TierId.TIER_6,
]);

export class PlatformConfigSanitizer {
  private static clampInt(val: unknown, fallback: number, min: number, max: number): number {
    if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
    return Math.max(min, Math.min(max, Math.round(val)));
  }

  private static clampDecimal(val: unknown, fallback: number, min: number, max: number): number {
    if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
    return Math.max(min, Math.min(max, Math.round(val * 100) / 100));
  }

  public static sanitizeEconomy(
    raw: unknown,
    existing: EconomyConfig,
    updatedBy?: string
  ): EconomyConfig {
    if (!raw || typeof raw !== 'object') return existing;
    const obj = raw as Record<string, unknown>;
    return {
      tokensPerUsd: this.clampInt(obj.tokensPerUsd, existing.tokensPerUsd, 1, 100_000),
      lkrPerUsd: this.clampDecimal(obj.lkrPerUsd, existing.lkrPerUsd, 1, 10_000),
      minBetTokens: this.clampInt(obj.minBetTokens, existing.minBetTokens, 1, 100_000),
      minDepositUsd: this.clampDecimal(obj.minDepositUsd, existing.minDepositUsd, 0.1, 10_000),
      minWithdrawUsd: this.clampDecimal(obj.minWithdrawUsd, existing.minWithdrawUsd, 0.5, 100_000),
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? existing.updatedBy,
    };
  }

  public static sanitizePromo(
    raw: unknown,
    existing: ServerPromoConfig,
    updatedBy?: string
  ): ServerPromoConfig {
    if (!raw || typeof raw !== 'object') return existing;
    const obj = raw as Record<string, unknown>;
    return {
      welcomeBonusEnabled:
        typeof obj.welcomeBonusEnabled === 'boolean'
          ? obj.welcomeBonusEnabled
          : existing.welcomeBonusEnabled,
      welcomeBonusTokens: this.clampInt(obj.welcomeBonusTokens, existing.welcomeBonusTokens, 0, 50_000),
      referralProgramEnabled:
        typeof obj.referralProgramEnabled === 'boolean'
          ? obj.referralProgramEnabled
          : existing.referralProgramEnabled,
      referralBonusTokens: this.clampInt(obj.referralBonusTokens, existing.referralBonusTokens, 0, 50_000),
      referralMinDepositTokens: this.clampInt(
        obj.referralMinDepositTokens,
        existing.referralMinDepositTokens,
        1,
        500_000
      ),
      dailyPromoMintCapTokens: this.clampInt(
        obj.dailyPromoMintCapTokens,
        existing.dailyPromoMintCapTokens,
        0,
        2_000_000
      ),
      hourlyPromoMintCapTokens: this.clampInt(
        obj.hourlyPromoMintCapTokens,
        existing.hourlyPromoMintCapTokens,
        0,
        1_000_000
      ),
      autoPauseOnBudgetExhausted:
        typeof obj.autoPauseOnBudgetExhausted === 'boolean'
          ? obj.autoPauseOnBudgetExhausted
          : existing.autoPauseOnBudgetExhausted,
      maxReferralsPerUser: this.clampInt(obj.maxReferralsPerUser, existing.maxReferralsPerUser, 1, 500),
      blockSameIpMultiSignupBonus:
        typeof obj.blockSameIpMultiSignupBonus === 'boolean'
          ? obj.blockSameIpMultiSignupBonus
          : existing.blockSameIpMultiSignupBonus,
      maxSignupBonusesPerIp: this.clampInt(obj.maxSignupBonusesPerIp, existing.maxSignupBonusesPerIp, 1, 20),
      requireRealDepositToWithdrawPromo:
        typeof obj.requireRealDepositToWithdrawPromo === 'boolean'
          ? obj.requireRealDepositToWithdrawPromo
          : existing.requireRealDepositToWithdrawPromo,
      minRealDepositToUnlockTokens: this.clampInt(
        obj.minRealDepositToUnlockTokens,
        existing.minRealDepositToUnlockTokens,
        0,
        500_000
      ),
      promoPlaythroughMultiplier: this.clampInt(
        obj.promoPlaythroughMultiplier,
        existing.promoPlaythroughMultiplier,
        0,
        25
      ),
      restrictPurePromoToTier1:
        typeof obj.restrictPurePromoToTier1 === 'boolean'
          ? obj.restrictPurePromoToTier1
          : existing.restrictPurePromoToTier1,
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? existing.updatedBy,
    };
  }

  public static sanitizeBot(
    raw: unknown,
    existing: ServerBotConfig,
    updatedBy?: string
  ): ServerBotConfig {
    if (!raw || typeof raw !== 'object') return existing;
    const obj = raw as Record<string, unknown>;
    const rawTiers = Array.isArray(obj.allowedTierIds)
      ? obj.allowedTierIds.filter((t): t is TierId => typeof t === 'string' && VALID_TIER_IDS.has(t as TierId))
      : existing.allowedTierIds;

    return {
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : existing.enabled,
      sideBetBotsEnabled:
        typeof obj.sideBetBotsEnabled === 'boolean'
          ? obj.sideBetBotsEnabled
          : existing.sideBetBotsEnabled,
      triggerWaitSeconds: this.clampInt(obj.triggerWaitSeconds, existing.triggerWaitSeconds, 10, 900),
      sideBetTriggerDelaySeconds: this.clampInt(
        obj.sideBetTriggerDelaySeconds,
        existing.sideBetTriggerDelaySeconds,
        3,
        18
      ),
      maxPerMatchStakeTokens: this.clampInt(
        obj.maxPerMatchStakeTokens,
        existing.maxPerMatchStakeTokens,
        30,
        50_000
      ),
      maxPerRoundSideBetTokens: this.clampInt(
        obj.maxPerRoundSideBetTokens,
        existing.maxPerRoundSideBetTokens,
        30,
        25_000
      ),
      maxHourlyLossTokens: this.clampInt(obj.maxHourlyLossTokens, existing.maxHourlyLossTokens, 100, 500_000),
      maxDailyLossTokens: this.clampInt(obj.maxDailyLossTokens, existing.maxDailyLossTokens, 300, 2_000_000),
      cooldownAfterLosses: this.clampInt(obj.cooldownAfterLosses, existing.cooldownAfterLosses, 1, 20),
      cooldownMatchCount: this.clampInt(obj.cooldownMatchCount, existing.cooldownMatchCount, 0, 20),
      winStreakAlertThreshold: this.clampInt(
        obj.winStreakAlertThreshold,
        existing.winStreakAlertThreshold,
        3,
        25
      ),
      allowedTierIds: rawTiers.length > 0 ? Array.from(new Set(rawTiers)) : [TierId.TIER_1],
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? existing.updatedBy,
    };
  }

  public static sanitizeContact(
    raw: unknown,
    existing: ServerContactConfig,
    updatedBy?: string
  ): ServerContactConfig {
    if (!raw || typeof raw !== 'object') return existing;
    const obj = raw as Record<string, unknown>;
    const rawEmail = typeof obj.supportEmail === 'string' ? obj.supportEmail.trim() : existing.supportEmail;
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : existing.supportEmail;
    let rawTg = typeof obj.telegramUsername === 'string' ? obj.telegramUsername.trim().replace(/^@/, '') : existing.telegramUsername;
    if (!rawTg) rawTg = existing.telegramUsername;
    const rawLink = typeof obj.telegramLink === 'string' && obj.telegramLink.trim()
      ? obj.telegramLink.trim()
      : `https://t.me/${rawTg}`;
    const rawUsdt = typeof obj.usdtDepositAddress === 'string' ? obj.usdtDepositAddress.trim() : '';
    const usdtDepositAddress =
      rawUsdt && !/\s/.test(rawUsdt) && rawUsdt.length >= 10 && rawUsdt.length <= 128
        ? rawUsdt
        : existing.usdtDepositAddress || defaultContactConfig().usdtDepositAddress;

    return {
      supportEmail: email,
      telegramUsername: rawTg,
      telegramLink: rawLink,
      usdtDepositAddress,
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? existing.updatedBy,
    };
  }
}

export class JsonFilePlatformRepository implements IRepository<PlatformStoreData> {
  private readonly dataDir: string;
  private readonly storeFile: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.storeFile = path.join(dataDir, 'platform-store.json');
  }

  public static createEmptyStore(): PlatformStoreData {
    return {
      users: [],
      payments: [],
      tickets: [],
      auditLogs: [],
      incomeRecords: [],
      incomeSummary: emptyIncomeSummary(),
      telemetry: { diceBoards: [], sportsEvents: [], updatedAt: 0 },
      economyConfig: defaultEconomyConfig(),
      contactConfig: defaultContactConfig(),
      botConfig: defaultBotConfig(),
      botPoolBalanceTokens: 50000,
      botConsecutiveLosses: 0,
      botCooldownMatchesRemaining: 0,
      botLiquidityLedger: [],
      riskAlerts: [],
      playerRiskStats: {},
      promoConfig: defaultPromoConfig(),
      promoPoolBudgetTokens: DEFAULT_PROMO_BUDGET_POOL,
      promoTokenLedger: [],
      referrals: [],
    };
  }

  public load(): PlatformStoreData {
    try {
      if (!fs.existsSync(this.storeFile)) {
        return JsonFilePlatformRepository.createEmptyStore();
      }
      const raw = fs.readFileSync(this.storeFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PlatformStoreData>;
      return this.sanitizeLoadedData(parsed);
    } catch {
      return JsonFilePlatformRepository.createEmptyStore();
    }
  }

  public sanitizeLoadedData(parsed: Partial<PlatformStoreData>): PlatformStoreData {
    const rawSum = parsed.incomeSummary;
    const defEcon = { ...DEFAULT_ECONOMY_CONFIG };
    const defBot = defaultBotConfig();
    return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        incomeRecords: Array.isArray(parsed.incomeRecords) ? parsed.incomeRecords : [],
        incomeSummary:
          rawSum && typeof rawSum === 'object'
            ? {
                totalTokens: Number(rawSum.totalTokens) || 0,
                diceMainFeeTokens: Number(rawSum.diceMainFeeTokens) || 0,
                sideBetFeeTokens: Number(rawSum.sideBetFeeTokens) || 0,
                entryFeeTokens: Number(rawSum.entryFeeTokens) || 0,
                sportsFeeTokens: Number(rawSum.sportsFeeTokens) || 0,
                humanInvolvedFeeTokens: Number(rawSum.humanInvolvedFeeTokens) || 0,
                recordCount: Number(rawSum.recordCount) || 0,
              }
            : emptyIncomeSummary(),
        telemetry:
          parsed.telemetry && typeof parsed.telemetry === 'object'
            ? {
                diceBoards: Array.isArray(parsed.telemetry.diceBoards) ? parsed.telemetry.diceBoards : [],
                sportsEvents: Array.isArray(parsed.telemetry.sportsEvents) ? parsed.telemetry.sportsEvents : [],
                updatedAt: typeof parsed.telemetry.updatedAt === 'number' ? parsed.telemetry.updatedAt : 0,
              }
            : { diceBoards: [], sportsEvents: [], updatedAt: 0 },
        economyConfig: parsed.economyConfig
          ? PlatformConfigSanitizer.sanitizeEconomy(parsed.economyConfig, defEcon)
          : defEcon,
        contactConfig: parsed.contactConfig
          ? PlatformConfigSanitizer.sanitizeContact(parsed.contactConfig, defaultContactConfig())
          : defaultContactConfig(),
        botConfig: (() => {
          const loadedBot = parsed.botConfig
            ? PlatformConfigSanitizer.sanitizeBot(parsed.botConfig, defBot)
            : defBot;
          if (!loadedBot.updatedBy) {
            if (loadedBot.triggerWaitSeconds === 180) loadedBot.triggerWaitSeconds = 25;
            if (loadedBot.sideBetTriggerDelaySeconds >= 18) loadedBot.sideBetTriggerDelaySeconds = 8;
            if (
              loadedBot.maxPerMatchStakeTokens === 300 &&
              (loadedBot.allowedTierIds.includes(TierId.TIER_2) ||
                loadedBot.allowedTierIds.includes(TierId.TIER_3))
            ) {
              loadedBot.maxPerMatchStakeTokens = 1500;
            }
          }
          return loadedBot;
        })(),
        botPoolBalanceTokens:
          typeof parsed.botPoolBalanceTokens === 'number' && Number.isFinite(parsed.botPoolBalanceTokens)
            ? Math.max(0, Math.round(parsed.botPoolBalanceTokens))
            : 50000,
        botConsecutiveLosses:
          typeof parsed.botConsecutiveLosses === 'number' && Number.isFinite(parsed.botConsecutiveLosses)
            ? Math.max(0, Math.round(parsed.botConsecutiveLosses))
            : 0,
        botCooldownMatchesRemaining:
          typeof parsed.botCooldownMatchesRemaining === 'number' &&
          Number.isFinite(parsed.botCooldownMatchesRemaining)
            ? Math.max(0, Math.round(parsed.botCooldownMatchesRemaining))
            : 0,
        botLiquidityLedger: Array.isArray(parsed.botLiquidityLedger) ? parsed.botLiquidityLedger : [],
        riskAlerts: Array.isArray(parsed.riskAlerts) ? parsed.riskAlerts : [],
        playerRiskStats:
          parsed.playerRiskStats && typeof parsed.playerRiskStats === 'object'
            ? parsed.playerRiskStats
            : {},
        promoConfig: parsed.promoConfig
          ? PlatformConfigSanitizer.sanitizePromo(parsed.promoConfig, defaultPromoConfig())
          : defaultPromoConfig(),
        promoPoolBudgetTokens:
          typeof parsed.promoPoolBudgetTokens === 'number' && Number.isFinite(parsed.promoPoolBudgetTokens)
            ? Math.max(0, Math.round(parsed.promoPoolBudgetTokens))
            : DEFAULT_PROMO_BUDGET_POOL,
        promoTokenLedger: Array.isArray(parsed.promoTokenLedger) ? parsed.promoTokenLedger : [],
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
      };
  }

  public save(store: PlatformStoreData): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempPath = `${this.storeFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, this.storeFile);
  }
}
