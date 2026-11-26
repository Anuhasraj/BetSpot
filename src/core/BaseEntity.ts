import { IIdentifiable, ISerializable } from './contracts';

/**
 * Abstract base domain entity providing encapsulated identity, timestamps,
 * invariant validation, and serialization contract.
 */
export abstract class BaseEntity<TSnapshot> implements IIdentifiable, ISerializable<TSnapshot> {
  public readonly id: string;
  public readonly createdAt: number;
  protected _updatedAt: number;

  protected constructor(id: string, createdAt?: number) {
    this.assertInvariant(Boolean(id && id.trim().length > 0), 'Entity id must be a non-empty string.');
    this.id = id;
    this.createdAt = createdAt ?? Date.now();
    this._updatedAt = this.createdAt;
  }

  public get updatedAt(): number {
    return this._updatedAt;
  }

  protected touch(): void {
    this._updatedAt = Date.now();
  }

  protected assertInvariant(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  public abstract toJSON(): TSnapshot;
}
