import { bootstrap } from './bootstrap.ts';
import { formatError } from '../core/errors/error-formatter.ts';
import { classifyError } from '../core/errors/error-classifier.ts';

/**
 * Entry point principal: loop infinito que procesa todos los VINes
 * que el CRM entregue. Reemplaza al `index.js` original.
 *
 * Todos los errores (manejados o no) se reportan con formato legible
 * y sugerencias accionables para diagnóstico rápido.
 */
async function main(): Promise<void> {
  const { orchestrator, logger } = bootstrap({
    installProcessHandlers: true,
  });

  logger.info('╔══════════════════════════════════════════════╗');
  logger.info('║  ICM Runner — TypeScript + Bun              ║');
  logger.info('║  Iniciando loop principal...                ║');
  logger.info('╚══════════════════════════════════════════════╝');

  try {
    await orchestrator.runForever();
  } catch (err) {
    // runForever solo lanza si es fatal (ConfigError o failFast).
    const classified = classifyError(err, { phase: 'main.fatal' });
    logger.error('╔══════════════════════════════════════════════╗');
    logger.error('║  ❌ ERROR FATAL — el runner se detiene       ║');
    logger.error('╚══════════════════════════════════════════════╝');
    logger.error(formatError(classified.error));
    process.exit(1);
  }
}

void main();