import crypto from 'crypto';
import { Request, Response } from 'express';
import { PrivatePlayerSnapshot, PublicArenaSnapshot, StreamBroadcastEvent } from '../ServerTypes';

interface SseClient {
  id: string;
  userId: string | null;
  res: Response;
}

export class SseStreamHub {
  private readonly arenaClients = new Set<SseClient>();
  private readonly inviteClients = new Set<SseClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  public startHeartbeat(intervalMs = 20_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const payload = `:keepalive ${Date.now()}\n\n`;
      for (const client of Array.from(this.arenaClients)) {
        try {
          client.res.write(payload);
        } catch {
          this.arenaClients.delete(client);
        }
      }
      for (const client of Array.from(this.inviteClients)) {
        try {
          client.res.write(payload);
        } catch {
          this.inviteClients.delete(client);
        }
      }
    }, intervalMs);
  }

  public stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private configureSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  public registerInviteClient(
    req: Request,
    res: Response,
    getInvites: () => PublicArenaSnapshot['activeInvites']
  ): void {
    this.configureSseHeaders(res);
    try {
      res.write(`event: invites:init\ndata: ${JSON.stringify({ invites: getInvites() })}\n\n`);
    } catch {
      return;
    }
    const client: SseClient = {
      id: `inv_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId: null,
      res,
    };
    this.inviteClients.add(client);
    req.on('close', () => this.inviteClients.delete(client));
  }

  public registerArenaClient(
    req: Request,
    res: Response,
    userId: string | null,
    getPublicSnapshot: () => PublicArenaSnapshot,
    getPrivateSnapshot: (uid: string) => PrivatePlayerSnapshot | null
  ): void {
    this.configureSseHeaders(res);
    const client: SseClient = {
      id: `sse_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId,
      res,
    };
    this.arenaClients.add(client);

    try {
      res.write(`event: arena:snapshot\ndata: ${JSON.stringify(getPublicSnapshot())}\n\n`);
      if (userId) {
        const priv = getPrivateSnapshot(userId);
        if (priv) {
          res.write(`event: player:update\ndata: ${JSON.stringify(priv)}\n\n`);
        }
      }
    } catch {
      this.arenaClients.delete(client);
    }

    req.on('close', () => {
      this.arenaClients.delete(client);
    });
  }

  public broadcast(
    evt: StreamBroadcastEvent,
    getPublicSnapshot: () => PublicArenaSnapshot,
    getPrivateSnapshot: (uid: string) => PrivatePlayerSnapshot | null
  ): void {
    if (this.arenaClients.size === 0 && this.inviteClients.size === 0) return;

    if (evt.type === 'arena' || evt.type === 'all') {
      const publicSnap = getPublicSnapshot();
      const arenaWire = `event: arena:snapshot\ndata: ${JSON.stringify(publicSnap)}\n\n`;
      for (const client of Array.from(this.arenaClients)) {
        try {
          client.res.write(arenaWire);
        } catch {
          this.arenaClients.delete(client);
        }
      }
      if (this.inviteClients.size > 0) {
        const inviteWire = `event: invites:sync\ndata: ${JSON.stringify({ invites: publicSnap.activeInvites })}\n\n`;
        for (const client of Array.from(this.inviteClients)) {
          try {
            client.res.write(inviteWire);
          } catch {
            this.inviteClients.delete(client);
          }
        }
      }
    }

    if ((evt.type === 'player' || evt.type === 'all') && evt.userIds && evt.userIds.length > 0) {
      const targetSet = new Set(evt.userIds);
      for (const client of Array.from(this.arenaClients)) {
        if (!client.userId || !targetSet.has(client.userId)) continue;
        const priv = getPrivateSnapshot(client.userId);
        if (!priv) continue;
        try {
          client.res.write(`event: player:update\ndata: ${JSON.stringify(priv)}\n\n`);
        } catch {
          this.arenaClients.delete(client);
        }
      }
    }
  }
}
