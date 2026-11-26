export type DomainEventType =
  | 'state:changed'
  | 'auth:changed'
  | 'wallet:updated'
  | 'dice:updated'
  | 'payment:updated'
  | 'telemetry:synced';

export interface IDomainEvent<TPayload = unknown> {
  readonly type: DomainEventType;
  readonly occurredAt: number;
  readonly payload?: TPayload;
}

export type DomainEventListener = (event?: IDomainEvent) => void;

export interface IIdentifiable {
  readonly id: string;
}

export interface ISerializable<TSnapshot> {
  toJSON(): TSnapshot;
}

export interface IRepository<TEntity> {
  load(): TEntity;
  save(data: TEntity): void;
}
