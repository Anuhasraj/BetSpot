import { BaseEntity } from '../core/BaseEntity';
import { TokenEconomy } from './TokenEconomy';
import { TransactionType, WalletTransaction } from './types';

export interface SerializedWallet {
  userId: string;
  availableBalance: number;
  heldBalance: number;
  transactions: WalletTransaction[];
}

export class Wallet extends BaseEntity<SerializedWallet> {
  public readonly userId: string;
  private _availableBalance: number;
  private _heldBalance: number;
  private _transactions: WalletTransaction[] = [];

  constructor(userId: string, initialAvailable: number = 0, initialHeld: number = 0) {
    super(`wallet_${userId}`);
    this.userId = userId;
    this._availableBalance = Math.max(0, Math.round(initialAvailable));
    this._heldBalance = Math.max(0, Math.round(initialHeld));
  }

  public get availableBalance(): number {
    return this._availableBalance;
  }

  public get heldBalance(): number {
    return this._heldBalance;
  }

  public get totalBalance(): number {
    return this._availableBalance + this._heldBalance;
  }

  public get transactions(): readonly WalletTransaction[] {
    return this._transactions;
  }

  public canAfford(amount: number): boolean {
    return amount > 0 && this._availableBalance >= Math.round(amount);
  }

  public canWithdraw(amount: number): { allowed: boolean; reason?: string } {
    const rounded = Math.round(amount);
    if (this._availableBalance < TokenEconomy.MIN_WITHDRAW_TOKENS) {
      return {
        allowed: false,
        reason: `Minimum available balance of ${TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN ($${TokenEconomy.MIN_WITHDRAW_USD} USD) is required to withdraw.`,
      };
    }
    if (rounded < TokenEconomy.MIN_WITHDRAW_TOKENS) {
      return {
        allowed: false,
        reason: `Minimum withdrawal request is ${TokenEconomy.MIN_WITHDRAW_TOKENS.toLocaleString()} TKN ($${TokenEconomy.MIN_WITHDRAW_USD} USD).`,
      };
    }
    if (rounded > this._availableBalance) {
      return {
        allowed: false,
        reason: 'Insufficient available balance.',
      };
    }
    return { allowed: true };
  }

  public holdTokens(amount: number, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.round(amount);
    this.assertInvariant(rounded > 0, 'Hold amount must be positive.');
    if (!this.canAfford(rounded)) {
      throw new Error(`Insufficient available balance. Need ${rounded} TKN, have ${this._availableBalance} TKN.`);
    }
    this._availableBalance -= rounded;
    this._heldBalance += rounded;
    this.touch();
    return this.pushTx(TransactionType.BET_HOLD, -rounded, description, referenceId);
  }

  public releaseHoldToAvailable(
    amount: number,
    description: string,
    type: TransactionType = TransactionType.BET_REFUND,
    referenceId?: string
  ): WalletTransaction {
    const rounded = Math.min(this._heldBalance, Math.max(0, Math.round(amount)));
    this._heldBalance -= rounded;
    this._availableBalance += rounded;
    this.touch();
    return this.pushTx(type, rounded, description, referenceId);
  }

  public consumeHeldTokens(amount: number): void {
    const rounded = Math.min(this._heldBalance, Math.max(0, Math.round(amount)));
    this._heldBalance -= rounded;
    this.touch();
  }

  public recordLossFromHold(amount: number, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.min(this._heldBalance, Math.max(0, Math.round(amount)));
    this._heldBalance -= rounded;
    this.touch();
    return this.pushTx(TransactionType.BET_LOSS, -rounded, description, referenceId);
  }

  public recordWithdrawalFromHold(amount: number, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.min(this._heldBalance, Math.max(0, Math.round(amount)));
    this._heldBalance -= rounded;
    this.touch();
    return this.pushTx(TransactionType.WITHDRAWAL, -rounded, description, referenceId);
  }

  public debitAvailableDirect(amount: number, type: TransactionType, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.round(amount);
    if (!this.canAfford(rounded)) {
      throw new Error(`Insufficient balance for ${description}`);
    }
    this._availableBalance -= rounded;
    this.touch();
    return this.pushTx(type, -rounded, description, referenceId);
  }

  public creditAvailable(amount: number, type: TransactionType, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.round(amount);
    this.assertInvariant(rounded >= 0, 'Credit amount cannot be negative.');
    this._availableBalance += rounded;
    this.touch();
    return this.pushTx(type, rounded, description, referenceId);
  }

  public adjustAvailableByAdmin(delta: number, description: string, referenceId?: string): WalletTransaction {
    const rounded = Math.round(delta);
    const next = Math.max(0, this._availableBalance + rounded);
    const actualDelta = next - this._availableBalance;
    this._availableBalance = next;
    this.touch();
    return this.pushTx(TransactionType.ADMIN_ADJUSTMENT, actualDelta, description, referenceId);
  }

  public restoreTransactions(txs: readonly WalletTransaction[]): void {
    this._transactions = txs.slice(0, 250);
    this.touch();
  }

  public toJSON(): SerializedWallet {
    return {
      userId: this.userId,
      availableBalance: this._availableBalance,
      heldBalance: this._heldBalance,
      transactions: [...this._transactions],
    };
  }

  private pushTx(
    type: TransactionType,
    amount: number,
    description: string,
    referenceId?: string
  ): WalletTransaction {
    const tx: WalletTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: this.userId,
      type,
      amount,
      balanceAfter: this._availableBalance,
      heldAfter: this._heldBalance,
      description,
      createdAt: Date.now(),
      referenceId,
    };
    this._transactions = [tx, ...this._transactions].slice(0, 250);
    return tx;
  }
}
