import crypto from 'crypto';
import { PlatformStoreData, ServerRiskAlertEntry } from '../ServerTypes';

export class AuditAndAlertLedger {
  constructor(private readonly store: PlatformStoreData) {}

  public appendAudit(adminUsername: string, action: string, target: string, details: string): void {
    this.store.auditLogs.unshift({
      id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      adminUsername,
      action,
      target,
      details,
      createdAt: Date.now(),
    });
    if (this.store.auditLogs.length > 200) {
      this.store.auditLogs = this.store.auditLogs.slice(0, 200);
    }
  }

  public appendRiskAlert(
    alert: Omit<ServerRiskAlertEntry, 'id' | 'acknowledged' | 'createdAt'>,
    dedupWindowMs = 0
  ): void {
    const now = Date.now();
    if (dedupWindowMs > 0) {
      const recentSame = this.store.riskAlerts.find(
        (a) =>
          a.type === alert.type &&
          a.userId === alert.userId &&
          now - a.createdAt < dedupWindowMs
      );
      if (recentSame) return;
    }
    this.store.riskAlerts.unshift({
      ...alert,
      id: `rsk_${now}_${crypto.randomBytes(3).toString('hex')}`,
      acknowledged: false,
      createdAt: now,
    });
    if (this.store.riskAlerts.length > 300) {
      this.store.riskAlerts = this.store.riskAlerts.slice(0, 300);
    }
  }
}
