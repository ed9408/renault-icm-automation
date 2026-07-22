/**
 * Jerarquía de errores del dominio ICM.
 *
 * Cada subclase implementa:
 *   - `userMessage()`: el mensaje que verá el usuario en consola
 *   - `suggestions()`: lista de acciones que puede intentar para resolverlo
 *   - `retryable`: si el orquestador debe reintentar o abortar
 *
 * Los errores aceptan un `ErrorContext` con datos del entorno
 * (VIN, sección, URL, selector intentado, etc.) para que el reporte
 * en consola sea accionable.
 */

export interface ErrorContext {
  /** VIN del vehículo en proceso cuando ocurrió el error. */
  vin?: string;
  /** ID interno del vehículo. */
  vehicleId?: string;
  /** Sección del menú ICM ("Detalles vehículo", "Histórico", ...). */
  section?: string;
  /** URL actual del navegador. */
  url?: string;
  /** Selector CSS que estaba esperando o usando. */
  selector?: string;
  /** Número de intento (1, 2, 3, ...). */
  attempt?: number;
  /** Etapa del flujo: 'launch', 'phase1', 'login', 'identify', 'capture', 'send', etc. */
  phase?: string;
  /** Fragmento de HTML recibido, útil para diagnosticar páginas inesperadas. */
  htmlSnippet?: string;
  /** Cualquier dato adicional que quiera agregar el caller. */
  extra?: Record<string, unknown>;
}

export abstract class IcmError extends Error {
  public context: ErrorContext;
  /** Si true, el orquestador puede reintentar la operación. */
  public abstract readonly retryable: boolean;

  constructor(message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.context = context;
  }

  /** Mensaje legible para el usuario (puede ser multilínea). */
  abstract userMessage(): string;

  /** Sugerencias accionables para resolver el error. */
  abstract suggestions(): string[];

  /** Adjunta contexto adicional y devuelve `this` (fluent). */
  withContext(extra: Partial<ErrorContext>): this {
    this.context = { ...this.context, ...extra };
    return this;
  }

  /** Convierte a un objeto plano serializable (JSON.stringify seguro). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      retryable: this.retryable,
      userMessage: this.userMessage(),
      suggestions: this.suggestions(),
      stack: this.stack,
    };
  }
}

/* ─────────────────────────── AUTH ─────────────────────────── */

/** Error de autenticación inicial (Phase1 o login ICM). */
export class AuthError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'Falló la autenticación inicial con el portal Renault.';
  }

  suggestions(): string[] {
    return [
      'Verifica que tu sesión del token (Connexion au token) no haya expirado.',
      'Comprueba que los scripts AutoIt3 (enters.au3 / enter_password.au3) existen en la ruta configurada.',
      'Si el sitio ICM cambió su pantalla de login, revisa src/application/usecases/phase1-auth.usecase.ts.',
    ];
  }
}

/** El botón "access" o "validate" no apareció. */
export class LoginButtonNotFoundError extends AuthError {
  readonly retryable = true;

  userMessage(): string {
    return 'No se encontró el botón de acceso o validación en la pantalla de login ICM.';
  }

  suggestions(): string[] {
    return [
      'Revisa los selectores en src/core/config/selectors.ts (icmLogin.accessButton / validateButton).',
      'Es posible que Renault haya cambiado la pantalla. Captura el HTML manualmente y actualiza los selectores.',
    ];
  }
}

/* ─────────────────────────── VIN / CRM ─────────────────────────── */

/** El VIN consultado no existe en el sistema del cliente (diálogo "VIN INTRODUCIDO ES DESCONOCIDO"). */
export class VinUnknownError extends IcmError {
  readonly retryable = false;

  userMessage(): string {
    return 'El VIN consultado es desconocido para Renault/ICM.';
  }

  suggestions(): string[] {
    return [
      'El CRM envió un VIN que no existe en ICM. Se notificó al backend (unknow_vin).',
      'Verifica que los VINes en el CRM estén correctamente cargados.',
      'Si esto pasa con todos los VINes, contacta al administrador de ICM.',
    ];
  }
}

/** El CRM no devolvió VINes pendientes o la respuesta fue inválida. */
export class NoVinAvailableError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'No hay VINes pendientes para procesar en este momento.';
  }

  suggestions(): string[] {
    return [
      'Esto es normal entre cargas. El runner esperará antes de pedir más.',
      'Si se repite indefinidamente, verifica la conexión con el CRM.',
    ];
  }
}

/* ─────────────────────────── SITIO ICM ─────────────────────────── */

/** El sitio ICM devolvió "Connexion à ICM refusée". */
export class ConnectionRefusedError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'El sitio ICM rechazó la conexión ("Connexion à ICM refusée").';
  }

  suggestions(): string[] {
    return [
      'El runner aplicará un backoff de 5 minutos y reintentará automáticamente.',
      'Verifica tu conectividad a dcs.renault.com.',
      'Si persiste, puede ser mantenimiento programado de Renault.',
    ];
  }
}

/** El sitio no cargó el HTML básico dentro del timeout. */
export class SiteNotLoadedError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'El sitio ICM no cargó la página HTML base.';
  }

  suggestions(): string[] {
    return [
      'Revisa la conexión al portal Renault.',
      'Si la página devolvió un error de proxy, captura el HTML y compáralo con la marca "Connexion à ICM refusée".',
    ];
  }
}

/** El navegador no devolvió los frames `body` y/o `FrameMenu`. */
export class FrameNotFoundError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'No se encontraron los frames necesarios del sitio ICM (body / FrameMenu).';
  }

  suggestions(): string[] {
    return [
      'Renault puede haber cambiado la estructura del frameset. Revisa los nombres en src/core/config/selectors.ts.',
      'Captura el HTML del frameset (page.content()) y verifica que existan <frame name="body"> y <frame name="FrameMenu">.',
    ];
  }
}

/** Timeout esperando un selector CSS (waitForSelector). */
export class SelectorTimeoutError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'Timeout esperando un elemento del DOM.';
  }

  suggestions(): string[] {
    return [
      'El selector puede haber cambiado. Revísalo en src/core/config/selectors.ts.',
      'Si el sitio se demora más de lo normal, podrías aumentar el timeout.',
      'Captura el HTML del frame para ver qué se está renderizando.',
    ];
  }
}

/** page.goto() no completó dentro del timeout. */
export class NavigationTimeoutError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'Timeout en la navegación a la URL del vehículo.';
  }

  suggestions(): string[] {
    return [
      'Verifica la URL construida (VIN, KM).',
      'Si la red está lenta, considera aumentar el timeout de navegación.',
      'Comprueba que el vehículo realmente exista en ICM.',
    ];
  }
}

/** Error durante la captura de una sección específica. */
export class SectionCaptureError extends IcmError {
  readonly retryable = true;

  /** Sección que estaba procesándose (details, historic, ...). */
  public readonly sectionKey: string;

  constructor(
    message: string,
    sectionKey: string,
    context: ErrorContext = {},
    options?: ErrorOptions,
  ) {
    super(message, { ...context, section: sectionKey }, options);
    this.sectionKey = sectionKey;
  }

  userMessage(): string {
    return `La captura de la sección "${this.sectionKey}" falló.`;
  }

  suggestions(): string[] {
    return [
      `Revisa los selectores específicos de "${this.sectionKey}" en src/core/config/selectors.ts.`,
      'Las demás secciones del reporte siguen siendo válidas y se enviarán.',
      'Si el error es transitorio, el runner lo reintentará en la próxima iteración.',
    ];
  }
}

/* ─────────────────────────── RED / BACKEND ─────────────────────────── */

/** Falla de transporte HTTP (red, status != 2xx, timeout). */
export class HttpTransportError extends IcmError {
  readonly retryable = true;
  public readonly status?: number;

  constructor(
    message: string,
    status?: number,
    context: ErrorContext = {},
    options?: ErrorOptions,
  ) {
    super(status ? `${message} (status=${status})` : message, context, options);
    this.status = status;
  }

  userMessage(): string {
    return this.status
      ? `Falla HTTP contra el backend (status=${this.status}).`
      : 'Falla de red al comunicarse con el backend.';
  }

  suggestions(): string[] {
    const hints = [
      'Verifica tu conexión a intranet.caribemotor.com.co.',
      'Si el status es 401/403, el Bearer token puede haber expirado.',
    ];
    if (this.status === 401 || this.status === 403) {
      hints.push('Renueva ICM_API_TOKEN o cárgalo vía variable de entorno.');
    }
    if (this.status && this.status >= 500) {
      hints.push('Error del servidor. Reintentaremos automáticamente.');
    }
    return hints;
  }
}

/** Error reportado por el backend (transactionStatus != 200). */
export class BackendError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'El backend respondió con error de negocio.';
  }

  suggestions(): string[] {
    return [
      'Revisa la respuesta cruda: transactionMessage.',
      'Si es persistente, podría ser un cambio en el contrato del CRM.',
    ];
  }
}

/* ─────────────────────────── SCRIPTS / CONFIG ─────────────────────────── */

/** Falla al ejecutar un script externo (AutoIt3.exe). */
export class ScriptExecutionError extends IcmError {
  readonly retryable = false;
  public readonly script: string;
  public readonly exitInfo?: string;

  constructor(
    message: string,
    script: string,
    exitInfo?: string,
    context: ErrorContext = {},
    options?: ErrorOptions,
  ) {
    super(
      `${message} [script=${script}${exitInfo ? `, exit=${exitInfo}` : ''}]`,
      context,
      options,
    );
    this.script = script;
    this.exitInfo = exitInfo;
  }

  userMessage(): string {
    return `Falló la ejecución del script externo "${this.script}".`;
  }

  suggestions(): string[] {
    return [
      'Verifica que AutoIt3.exe existe en la ruta configurada (ICM_AUTOIT_EXE).',
      `Verifica que el script "${this.script}" existe y tiene permisos de lectura.`,
      'En Windows, ejecuta el .bat desde un cmd con permisos suficientes.',
      'Si no estás en Windows, este runner no funcionará: usa la rama multiplataforma o reemplaza IAutoItRunner.',
    ];
  }
}

/** Error de configuración (paths inválidos, token malformado). */
export class ConfigError extends IcmError {
  readonly retryable = false;

  userMessage(): string {
    return 'La configuración del runner es inválida.';
  }

  suggestions(): string[] {
    return [
      'Revisa las variables de entorno: ICM_API_TOKEN, ICM_AUTOIT_EXE, ICM_AUTOIT_ENTERS, ICM_AUTOIT_PASSWORD.',
      'Revisa src/core/config/app-config.ts para los valores por defecto.',
    ];
  }
}

/* ─────────────────────────── GENÉRICO ─────────────────────────── */

/** Captura de HTML/values falló tras agotar los selectores esperados. */
export class CaptureError extends IcmError {
  readonly retryable = true;

  userMessage(): string {
    return 'La captura de HTML/values falló.';
  }

  suggestions(): string[] {
    return [
      'Captura el HTML manualmente y revisa la estructura del sitio.',
      'Compara con los selectores en src/core/config/selectors.ts.',
    ];
  }
}

/** Error inesperado / desconocido — wrapper defensivo. */
export class UnexpectedError extends IcmError {
  readonly retryable = true;

  constructor(message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super(message, context, options);
  }

  userMessage(): string {
    return 'Ocurrió un error inesperado no clasificado.';
  }

  suggestions(): string[] {
    return [
      'Revisa el stack trace con --debug o ejecutando bun run start:test.',
      'Si persiste, puede ser un bug del runner. Reporta el error completo al desarrollador.',
    ];
  }
}