import { DomainEventListener, DomainEventType, IDomainEvent } from './contracts';

/**
 * Typed Observer / Pub-Sub dispatcher supporting both wildcard UI updates
 * and specific domain event subscriptions.
 */
export class DomainEventDispatcher {
  private readonly globalListeners = new Set<DomainEventListener>();
  private readonly typedListeners = new Map<DomainEventType, Set<DomainEventListener>>();

  public subscribe(listener: DomainEventListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  public on<TPayload = unknown>(
    type: DomainEventType,
    listener: (event: IDomainEvent<TPayload>) => void
  ): () => void {
    const bucket = this.typedListeners.get(type) ?? new Set<DomainEventListener>();
    const wrapped: DomainEventListener = (evt) => {
      if (evt) listener(evt as IDomainEvent<TPayload>);
    };
    bucket.add(wrapped);
    this.typedListeners.set(type, bucket);
    return () => {
      bucket.delete(wrapped);
      if (bucket.size === 0) {
        this.typedListeners.delete(type);
      }
    };
  }

  public emit(type: DomainEventType = 'state:changed', payload?: unknown): void {
    const event: IDomainEvent = {
      type,
      occurredAt: Date.now(),
      payload,
    };

    const specific = this.typedListeners.get(type);
    if (specific) {
      for (const listener of specific) {
        listener(event);
      }
    }

    for (const listener of this.globalListeners) {
      listener(event);
    }
  }
}
