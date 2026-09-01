import { appConfig } from '../../core/config/app-config.ts';
import { BackendError } from '../../core/errors/domain-errors.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type {
  ApiAck,
  IApiService,
  VinResponse,
} from '../../domain/ports/api-service.interface.ts';
import type { IHttpClient } from '../../domain/ports/http-client.interface.ts';
import type { AuditEntry } from '../../domain/models/audit-entry.ts';
import type { VehicleContext, VehicleReport } from '../../domain/models/vehicle.ts';
import {
  buildEndpointUrl,
  formatReportAuditPayload,
  formatSetVinDataPayload,
  maskedAuth,
} from './payload-preview.ts';
import { CMD } from './api-commands.ts';

function endpointHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${appConfig.api.token}`,
  };
}

/**
 * Implementación de IApiService que replica la lógica de `queries.mjs`
 * (Get_vin, Send_Data, Send_Unknow_vin, SEND_AUDITA_DEF).
 *
 * Recibe IHttpClient por constructor → testeable sin red.
 * Recibe ILogger para loguear cada envío (cmd, url, auth enmascarada,
 * payload resumido) antes de salir al HTTP real.
 */
export class RenaultApiService implements IApiService {
  constructor(
    private readonly http: IHttpClient,
    private readonly logger: ILogger,
  ) {}

  private logOutgoing(
    cmd: string,
    payload: unknown,
    payloadSummary: unknown,
  ): void {
    this.logger.info(`→ ${cmd}`, {
      url: buildEndpointUrl(),
      auth: maskedAuth(),
      payload: payloadSummary ?? payload,
    });
  }

  async getVin(
    lastId: string,
  ): Promise<{ error: boolean; data: VinResponse['transactionMessage'] }> {
    const payload = { cmd: CMD.getVin, id: lastId };
    this.logOutgoing(CMD.getVin, payload, payload);
    try {
      const resp = (await this.http.request(
        {
          host: appConfig.api.endpoint.host,
          path: appConfig.api.endpoint.path,
          headers: endpointHeaders(),
        },
        { cmd: CMD.getVin, id: lastId },
      )) as VinResponse;

      if (resp.transactionStatus !== 200) {
        return { error: true, data: {} as VinResponse['transactionMessage'] };
      }

      return { error: false, data: resp.transactionMessage };
    } catch (err) {
      throw new BackendError(
        `getVin failed: ${(err as Error).message}`,
        { phase: 'api.getVin', extra: { originalMessage: (err as Error).message } },
        { cause: err as Error },
      );
    }
  }

  async sendData(
    context: VehicleContext,
    report: VehicleReport,
  ): Promise<{ error: boolean; data?: unknown }> {
    const payload = {
      cmd: CMD.setVinData,
      id: context.id,
      vin: context.vin,
      tipo: context.tipo,
      km: context.km,
      data: report,
    };
    const summary = formatSetVinDataPayload(context, report);

    try {
      this.logOutgoing(CMD.setVinData, payload, summary);
      const resp = (await this.http.request(
        {
          host: appConfig.api.endpoint.host,
          path: appConfig.api.endpoint.path,
          headers: endpointHeaders(),
        },
        payload,
      )) as ApiAck;

      if (resp.transactionStatus !== 200) {
        return { error: true, data: {} };
      }
      return { error: false };
    } catch (err) {
      throw new BackendError(
        `sendData failed: ${(err as Error).message}`,
        { phase: 'api.sendData', extra: { originalMessage: (err as Error).message } },
        { cause: err as Error },
      );
    }
  }

  async sendUnknownVin(id: string, vin: string): Promise<{ error: boolean }> {
    const payload = {
      cmd: CMD.unknownVin,
      id,
      vin,
    };
    try {
      this.logOutgoing(CMD.unknownVin, payload, payload);
      const resp = (await this.http.request(
        {
          host: appConfig.api.endpoint.host,
          path: appConfig.api.endpoint.path,
          headers: endpointHeaders(),
        },
        payload,
      )) as ApiAck;

      if (resp.transactionStatus !== 200) {
        return { error: true };
      }
      return { error: false };
    } catch (err) {
      throw new BackendError(
        `sendUnknownVin failed: ${(err as Error).message}`,
        { phase: 'api.sendUnknownVin', extra: { originalMessage: (err as Error).message } },
        { cause: err as Error },
      );
    }
  }

  async sendAudit(actions: unknown[]): Promise<{ error: boolean }> {
    const payload = {
      cmd: CMD.reportAudit,
      actions,
    };
    const summary = formatReportAuditPayload(
      actions as readonly AuditEntry[],
    );

    try {
      this.logOutgoing(CMD.reportAudit, payload, summary);
      const resp = (await this.http.request(
        {
          host: appConfig.api.endpoint.host,
          path: appConfig.api.endpoint.path,
          headers: endpointHeaders(),
        },
        payload,
      )) as ApiAck;

      if (resp.transactionStatus !== 200) {
        return { error: true };
      }
      return { error: false };
    } catch (err) {
      throw new BackendError(
        `sendAudit failed: ${(err as Error).message}`,
        { phase: 'api.sendAudit', extra: { originalMessage: (err as Error).message } },
        { cause: err as Error },
      );
    }
  }
}