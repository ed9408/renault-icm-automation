import { exec } from 'node:child_process';

import { appConfig } from '../../core/config/app-config.ts';
import { ScriptExecutionError } from '../../core/errors/domain-errors.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { IAutoItRunner } from '../../domain/ports/autoit-runner.interface.ts';

interface ExecResult {
  error: Error | null;
  stdout: string;
  stderr: string;
}

function runCommand(cmd: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

/**
 * Implementación de IAutoItRunner específica de Windows.
 * Replica exactamente las llamadas a AutoIt3.exe de `helppers.mjs`.
 */
export class WindowsAutoItRunner implements IAutoItRunner {
  constructor(private readonly logger: ILogger) {}

  async enter(): Promise<void> {
    await this.run(appConfig.autoIt.entersScript, 'enter');
  }

  async enterPassword(): Promise<void> {
    await this.run(appConfig.autoIt.passwordScript, 'enterPassword');
  }

  private async run(script: string, label: string): Promise<void> {
    const cmd = `${appConfig.autoIt.executable} ${script}`;
    this.logger.debug('Running AutoIt script', { label, script });

    let result: ExecResult;
    try {
      result = await runCommand(cmd);
    } catch (err) {
      throw new ScriptExecutionError(
        `No se pudo ejecutar AutoIt ${label}`,
        script,
        (err as Error).message,
        { phase: 'autoit', extra: { label, command: cmd } },
        { cause: err as Error },
      );
    }

    if (result.error) {
      this.logger.error('AutoIt script failed', {
        label,
        error: result.error.message,
        stderr: result.stderr,
      });
      throw new ScriptExecutionError(
        `AutoIt ${label} failed`,
        script,
        result.error.message,
        { phase: 'autoit', extra: { label, stderr: result.stderr } },
        { cause: result.error },
      );
    }

    this.logger.debug('AutoIt script OK', { label, stdout: result.stdout });
  }
}