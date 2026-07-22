import type { AuditEntry } from '../../domain/models/audit-entry.ts';
import type { IAuditLogger } from '../../domain/ports/audit-logger.interface.ts';
import type { IApiService } from '../../domain/ports/api-service.interface.ts';

/**
 * Implementación de IAuditLogger que acumula entradas en memoria
 * y las envía al backend al hacer `flush()`.
 *
 * Equivalente directo al `let __AUDITA = []` + `Send_auditory` + `SEND_AUDITA_DEF`
 * de la versión JS original, ahora componiendo IApiService.
 */
export class InMemoryAuditLogger implements IAuditLogger {
  private readonly entries: AuditEntry[] = [];

  constructor(private readonly api: IApiService) {}

  log(id: string, vin: string, action: string | undefined): boolean {
    if (!action || action.trim() === '') return false;

    const now = new Date();
    const entry: AuditEntry = {
      id,
      vin,
      action,
      date: Date.now(),
      dateFull: formatDate(now),
    };
    this.entries.push(entry);
    return true;
  }

  size(): number {
    return this.entries.length;
  }

  async flush(): Promise<{ error: boolean }> {
    if (this.entries.length === 0) return { error: false };

    const snapshot = [...this.entries];
    const result = await this.api.sendAudit(snapshot);
    if (!result.error) {
      this.entries.length = 0;
    }
    return result;
  }

  /** Acceso de solo lectura para tests. */
  snapshot(): readonly AuditEntry[] {
    return this.entries;
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}