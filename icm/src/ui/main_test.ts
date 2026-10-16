import { bootstrap } from './bootstrap.ts';
import { formatError } from '../core/errors/error-formatter.ts';
import { classifyError } from '../core/errors/error-classifier.ts';

/**
 * Entry point de pruebas: procesa UN único VIN fijo en modo dry-run.
 *
 * - NO se envía información al backend (dryRun=true).
 * - El orquestador imprime por consola lo que HABRÍA enviado (preview).
 * - Para sobreescribir el VIN, exporta `ICM_TEST_VIN=<vin>` en el entorno.
 */
async function main(): Promise<void> {
  const { orchestrator, logger } = bootstrap({
    dryRun: true,
    failFast: true,
  });
  const vin = process.env.ICM_TEST_VIN ?? '9FB4SR0E5PM565683';
  logger.info('╔══════════════════════════════════════════════════════════╗');
  logger.info('║  ICM Runner — Modo TEST (DRY-RUN)                       ║');
  logger.info(`║  VIN: ${vin.padEnd(48)}║`);
  logger.info('║  dryRun=true  →  NO se enviarán datos al backend        ║');
  logger.info('║                      Solo se mostrará preview en consola║');
  logger.info('║  failFast=true                                         ║');
  logger.info('╚══════════════════════════════════════════════════════════╝');

  try {
    await orchestrator.runOnce(vin);
    logger.info('✅ Test run completed successfully');
  } catch (err) {
    const classified = classifyError(err, { phase: 'main_test', vin });
    logger.error('❌ Test run failed');
    logger.error(formatError(classified.error));
    process.exit(1);
  }
}

void main();