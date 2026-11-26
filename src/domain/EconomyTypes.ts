import { PaymentMethod } from './types';

export interface EconomyConfig {
  tokensPerUsd: number;
  lkrPerUsd: number;
  minBetTokens: number;
  minDepositUsd: number;
  minWithdrawUsd: number;
  updatedAt: number;
  updatedBy?: string;
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  tokensPerUsd: 300,
  lkrPerUsd: 297,
  minBetTokens: 30,
  minDepositUsd: 1,
  minWithdrawUsd: 10,
  updatedAt: 0,
};

export const PLATFORM_CRYPTO_DEPOSIT_ADDRESSES: Record<
  PaymentMethod.CRYPTO_USDT | PaymentMethod.CRYPTO_USDC,
  { networkLabel: string; address: string }
> = {
  [PaymentMethod.CRYPTO_USDT]: {
    networkLabel: 'USDT (TRC-20 Network)',
    address: 'TX7mK9pQ2vR8nL4wZ6cB3yH5jD1sF9aE8xP',
  },
  [PaymentMethod.CRYPTO_USDC]: {
    networkLabel: 'USDC (Polygon Network)',
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  },
};
