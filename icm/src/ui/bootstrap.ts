import { LoggerErrorReporter } from '../core/errors/error-reporter.ts';
import { formatError } from '../core/errors/error-formatter.ts';
import { classifyError } from '../core/errors/error-classifier.ts';
import { ConsoleLogger } from '../core/logger/console-logger.ts';
import type { ILogger } from '../core/logger/logger.interface.ts';
import { PuppeteerBrowserSession } from '../infrastructure/browser/puppeteer-browser-session.ts';
import { PuppeteerDomExtractor } from '../infrastructure/browser/dom-extractor.ts';
import { PuppeteerFrameNavigator } from '../infrastructure/browser/frame-navigator.ts';
import { FetchHttpClient } from '../infrastructure/http/fetch-http-client.ts';
import { InMemoryAuditLogger } from '../infrastructure/audit/in-memory-audit-logger.ts';
import { RenaultApiService } from '../infrastructure/api/renault-api.service.ts';
import { WindowsAutoItRunner } from '../infrastructure/autoit/windows-autoit-runner.ts';
import type { IApiService } from '../domain/ports/api-service.interface.ts';
import type { IAuditLogger } from '../domain/ports/audit-logger.interface.ts';
import type { IBrowserSession } from '../domain/ports/browser-session.interface.ts';
import type { IAutoItRunner } from '../domain/ports/autoit-runner.interface.ts';
import type { IDomExtractor } from '../domain/ports/dom-extractor.interface.ts';
import type { IFrameNavigator } from '../domain/ports/frame-navigator.interface.ts';
import { IcmLoginUseCase } from '../application/usecases/icm-login.usecase.ts';
import { Phase1AuthUseCase } from '../application/usecases/phase1-auth.usecase.ts';
import {
  ProcessVehicleUseCase,
  SECTION_ORDER,
  type SectionKey,
} from '../application/usecases/process-vehicle.usecase.ts';
import { CaptureDetailsSection } from '../application/usecases/sections/capture-details-section.usecase.ts';
import { CaptureHistoricSection } from '../application/usecases/sections/capture-historic-section.usecase.ts';
import { CaptureAgreementsSection } from '../application/usecases/sections/capture-agreements-section.usecase.ts';
import { CaptureMaintainSection } from '../application/usecases/sections/capture-maintain-section.usecase.ts';
import { CaptureAdminSection } from '../application/usecases/sections/capture-admin-section.usecase.ts';
import { CaptureOtsSection } from '../application/usecases/sections/capture-ots-section.usecase.ts';
import { CaptureRecmantSection } from '../application/usecases/sections/capture-recmant-section.usecase.ts';
import { VehicleOrchestrator } from '../application/orchestrator/vehicle-orchestrator.ts';

export interface BuiltGraph {
  logger: ILogger;
  browser: IBrowserSession;
  autoIt: IAutoItRunner;
  api: IApiService;
  audit: IAuditLogger;
  orchestrator: VehicleOrchestrator;
  /** Reporter para errores, accesible si un entry point quiere clasificar. */
  errorReporter: LoggerErrorReporter;
}

export interface BootstrapOptions {
  dryRun?: boolean;
  failFast?: boolean;
  /** Si true, instala handlers de proceso (unhandledRejection, SIGINT). */
  installProcessHandlers?: boolean;
}

/**
 * Composition root: aquí se cablean todas las dependencias.
 * Cualquier swap (mock HTTP, fake browser, etc.) se hace aquí o pasando
 * overrides parciales — los use cases no se enteran.
 */
export function bootstrap(options: BootstrapOptions = {}): BuiltGraph {
  const logger = new ConsoleLogger();

  // Reporter: clasifica, formatea y emite errores con sugerencias accionables.
  const errorReporter = new LoggerErrorReporter(logger);

  const http = new FetchHttpClient();
  const api = new RenaultApiService(http);
  const audit = new InMemoryAuditLogger(api);

  const autoIt = new WindowsAutoItRunner(logger);
  const browser = new PuppeteerBrowserSession(logger, autoIt);

  const navigator = new PuppeteerFrameNavigator(logger);
  const extractor = new PuppeteerDomExtractor(logger);

  const sections: Record<SectionKey, import('../application/usecases/sections/section-capture.interface.ts').ISectionCapture> =
    {
      details: new CaptureDetailsSection(extractor, audit),
      historic: new CaptureHistoricSection(extractor, audit),
      agreements: new CaptureAgreementsSection(extractor, audit),
      maintains: new CaptureMaintainSection(extractor, audit),
      admin: new CaptureAdminSection(extractor, audit),
      ots: new CaptureOtsSection(extractor, audit, logger),
      recmant: new CaptureRecmantSection(extractor, audit, logger),
    };

  // Garantiza que SECTION_ORDER cubra todas las secciones
  for (const key of SECTION_ORDER) {
    if (!sections[key]) {
      throw new Error(`Missing section implementation for "${key}"`);
    }
  }

  const phase1 = new Phase1AuthUseCase(browser, autoIt, logger);
  const icmLogin = new IcmLoginUseCase(browser, autoIt, logger);
  const processVehicle = new ProcessVehicleUseCase(
    browser,
    navigator,
    extractor,
    logger,
    sections,
  );

  const orchestrator = new VehicleOrchestrator(
    {
      browser,
      phase1,
      icmLogin,
      processVehicle,
      api,
      audit,
      logger,
    },
    { dryRun: options.dryRun ?? false, failFast: options.failFast ?? false },
  );

  if (options.installProcessHandlers !== false) {
    installProcessErrorHandlers(logger, errorReporter);
  }

  return { logger, browser, autoIt, api, audit, orchestrator, errorReporter };
}

/**
 * Instala handlers para errores no capturados y señales de terminación.
 * Garantiza que NINGÚN fallo se pierda en silencio.
 */
function installProcessErrorHandlers(
  logger: ILogger,
  reporter: LoggerErrorReporter,
): void {
  process.on('unhandledRejection', (reason) => {
    const classified = classifyError(reason, { phase: 'unhandledRejection' });
    logger.error('Unhandled promise rejection');
    logger.error(formatError(classified.error));
  });

  process.on('uncaughtException', (err) => {
    const classified = classifyError(err, { phase: 'uncaughtException' });
    logger.error('Uncaught exception');
    logger.error(formatError(classified.error));
    // En producción podríamos salir con código 1 aquí. Para esta
    // herramienta dejamos que el orchestrator decida.
  });

  const gracefulShutdown = (signal: string) => {
    logger.warn(`Señal ${signal} recibida. Cerrando limpiamente...`);
    // Dar tiempo a que el loop detecte y cierre la página.
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}