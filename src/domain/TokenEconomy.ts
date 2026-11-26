import { DEFAULT_ECONOMY_CONFIG, EconomyConfig } from './EconomyTypes';
import { FeeCalculationResult, IFeeStrategy, TierDefinition, TierId } from './types';

export class TokenEconomy {
  private static _config: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };

  public static get TOKENS_PER_USD(): number {
    return TokenEconomy._config.tokensPerUsd;
  }

  public static get LKR_PER_USD(): number {
    return TokenEconomy._config.lkrPerUsd;
  }

  public static get MIN_BET_TOKENS(): number {
    return TokenEconomy._config.minBetTokens;
  }

  public static get MIN_DEPOSIT_USD(): number {
    return TokenEconomy._config.minDepositUsd;
  }

  public static get MIN_DEPOSIT_TOKENS(): number {
    return Math.max(1, Math.round(TokenEconomy._config.minDepositUsd * TokenEconomy._config.tokensPerUsd));
  }

  public static get MIN_WITHDRAW_USD(): number {
    return TokenEconomy._config.minWithdrawUsd;
  }

  public static get MIN_WITHDRAW_TOKENS(): number {
    return Math.max(1, Math.round(TokenEconomy._config.minWithdrawUsd * TokenEconomy._config.tokensPerUsd));
  }

  public static readonly TIERS: TierDefinition[] = [
    {
      id: TierId.TIER_1,
      label: 'Tier 1 · Bronze Room',
      minTokens: 30,
      maxTokens: 300,
      feeRate: 0.01,
      spectatorEntryFee: 50,
      maxSeats: 20,
    },
    {
      id: TierId.TIER_2,
      label: 'Tier 2 · Silver Room',
      minTokens: 300,
      maxTokens: 1500,
      feeRate: 0.03,
      spectatorEntryFee: 100,
      maxSeats: 20,
    },
    {
      id: TierId.TIER_3,
      label: 'Tier 3 · Gold Room',
      minTokens: 1500,
      maxTokens: 6000,
      feeRate: 0.05,
      spectatorEntryFee: 500,
      maxSeats: 10,
    },
    {
      id: TierId.TIER_4,
      label: 'Tier 4 · Platinum Room',
      minTokens: 6000,
      maxTokens: 30000,
      feeRate: 0.1,
      spectatorEntryFee: 1000,
      maxSeats: 10,
    },
    {
      id: TierId.TIER_5,
      label: 'Tier 5 · Diamond Room',
      minTokens: 30000,
      maxTokens: 150000,
      feeRate: 0.15,
      spectatorEntryFee: 5000,
      maxSeats: 6,
    },
    {
      id: TierId.TIER_6,
      label: 'Tier 6 · VIP Room',
      minTokens: 150000,
      maxTokens: 300000,
      feeRate: 0.3,
      spectatorEntryFee: 10000,
      maxSeats: 2,
    },
  ];

  private static readonly BASE_TIER_BOUNDS: readonly { minTokens: number; maxTokens: number }[] = [
    { minTokens: 30, maxTokens: 300 },
    { minTokens: 300, maxTokens: 1500 },
    { minTokens: 1500, maxTokens: 6000 },
    { minTokens: 6000, maxTokens: 30000 },
    { minTokens: 30000, maxTokens: 150000 },
    { minTokens: 150000, maxTokens: 300000 },
  ];

  public static getConfig(): EconomyConfig {
    return { ...TokenEconomy._config };
  }

  public static applyConfig(partial?: Partial<EconomyConfig> | null): EconomyConfig {
    if (!partial) return TokenEconomy.getConfig();
    const tokensPerUsd =
      typeof partial.tokensPerUsd === 'number' && Number.isFinite(partial.tokensPerUsd)
        ? Math.max(1, Math.min(100_000, Math.round(partial.tokensPerUsd)))
        : TokenEconomy._config.tokensPerUsd;
    const lkrPerUsd =
      typeof partial.lkrPerUsd === 'number' && Number.isFinite(partial.lkrPerUsd)
        ? Math.max(1, Math.min(10_000, Math.round(partial.lkrPerUsd * 100) / 100))
        : TokenEconomy._config.lkrPerUsd;
    const minBetTokens =
      typeof partial.minBetTokens === 'number' && Number.isFinite(partial.minBetTokens)
        ? Math.max(1, Math.min(100_000, Math.round(partial.minBetTokens)))
        : TokenEconomy._config.minBetTokens;
    const minDepositUsd =
      typeof partial.minDepositUsd === 'number' && Number.isFinite(partial.minDepositUsd)
        ? Math.max(0.1, Math.min(10_000, Math.round(partial.minDepositUsd * 100) / 100))
        : TokenEconomy._config.minDepositUsd;
    const minWithdrawUsd =
      typeof partial.minWithdrawUsd === 'number' && Number.isFinite(partial.minWithdrawUsd)
        ? Math.max(0.5, Math.min(100_000, Math.round(partial.minWithdrawUsd * 100) / 100))
        : TokenEconomy._config.minWithdrawUsd;

    TokenEconomy._config = {
      tokensPerUsd,
      lkrPerUsd,
      minBetTokens,
      minDepositUsd,
      minWithdrawUsd,
      updatedAt: typeof partial.updatedAt === 'number' ? partial.updatedAt : Date.now(),
      updatedBy: typeof partial.updatedBy === 'string' ? partial.updatedBy : TokenEconomy._config.updatedBy,
    };

    // Update TIERS bounds in-place so existing DiceBoard references reflect new minBetTokens cleanly
    let prevMax = minBetTokens;
    for (let i = 0; i < TokenEconomy.TIERS.length; i++) {
      const base = TokenEconomy.BASE_TIER_BOUNDS[i];
      const tier = TokenEconomy.TIERS[i] as { minTokens: number; maxTokens: number };
      if (i === 0) {
        tier.minTokens = minBetTokens;
        tier.maxTokens = Math.max(base.maxTokens, minBetTokens);
        prevMax = tier.maxTokens;
      } else {
        tier.minTokens = Math.max(base.minTokens, prevMax);
        tier.maxTokens = Math.max(base.maxTokens, tier.minTokens);
        prevMax = tier.maxTokens;
      }
    }

    return TokenEconomy.getConfig();
  }

  public static tokensToUsd(tokens: number): number {
    return Number((tokens / TokenEconomy.TOKENS_PER_USD).toFixed(2));
  }

  public static usdToTokens(usd: number): number {
    return Math.round(usd * TokenEconomy.TOKENS_PER_USD);
  }

  public static tokensToLkr(tokens: number): number {
    const usd = tokens / TokenEconomy.TOKENS_PER_USD;
    return Math.round(usd * TokenEconomy.LKR_PER_USD);
  }

  public static formatTokens(tokens: number): string {
    return `${Math.round(tokens).toLocaleString()} TKN`;
  }

  public static formatUsd(tokens: number): string {
    return `$${TokenEconomy.tokensToUsd(tokens).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  public static formatLkr(tokens: number): string {
    return `LKR ${TokenEconomy.tokensToLkr(tokens).toLocaleString()}`;
  }
}

export class TierFeeStrategy implements IFeeStrategy {
  public resolveTierForAmount(tokens: number): TierDefinition {
    const clamped = Math.max(TokenEconomy.MIN_BET_TOKENS, tokens);
    for (let i = 0; i < TokenEconomy.TIERS.length - 1; i++) {
      if (clamped <= TokenEconomy.TIERS[i].maxTokens) {
        return TokenEconomy.TIERS[i];
      }
    }
    return TokenEconomy.TIERS[TokenEconomy.TIERS.length - 1];
  }

  public getTierById(tierId: TierId): TierDefinition {
    const found = TokenEconomy.TIERS.find((t) => t.id === tierId);
    return found ?? TokenEconomy.TIERS[0];
  }

  public calculateWinnerFee(
    grossPayout: number,
    referenceBetAmount: number,
    explicitTier?: TierId
  ): FeeCalculationResult {
    const tier = explicitTier ? this.getTierById(explicitTier) : this.resolveTierForAmount(referenceBetAmount);
    const feeAmount = Math.round(grossPayout * tier.feeRate);
    const netPayout = Math.max(0, Math.round(grossPayout) - feeAmount);
    return {
      tier,
      grossAmount: Math.round(grossPayout),
      feeRate: tier.feeRate,
      feeAmount,
      netPayout,
    };
  }
}
