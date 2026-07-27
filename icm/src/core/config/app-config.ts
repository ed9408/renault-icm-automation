/**
 * Configuración global del ICM Runner.
 * Centraliza URLs, endpoints, paths de scripts y timeouts.
 * Las rutas de AutoIt y el Bearer token son configurables por env vars
 * para no hardcodear credenciales en el repo.
 */

export interface ApiEndpointConfig {
  host: string;
  path: string;
}

export interface AutoItConfig {
  /** Ejecutable de AutoIt3 (Windows). */
  executable: string;
  /** Ruta absoluta del script que simula Enter+login token. */
  entersScript: string;
  /** Ruta absoluta del script que escribe la contraseña del token. */
  passwordScript: string;
}

export interface BrowserConfig {
  /** URL del portal de autenticación inicial. */
  loginUrl: string;
  /** URL base del menú ICM. */
  icmServletUrl: string;
  /** Indica si la ventana debe abrirse en pantalla completa. */
  fullscreen: boolean;
  /** Tamaño inicial del viewport. */
  viewport: { width: number; height: number };
  /** Tiempo (ms) que el runner espera tras lanzar el navegador
   *  antes de invocar el script de contraseña (mimetiza el setTimeout original). */
  passwordScriptDelayMs: number;
  /** Mensaje que indica sesión expirada (cierre de navegador). */
  sessionExpiredMessage: string;
}

export interface AppConfig {
  /** Endpoint del backend (CRM). */
  api: {
    endpoint: ApiEndpointConfig;
    /** Bearer token. Si `ICM_API_TOKEN` está definido en env se usa ese. */
    token: string;
  };
  browser: BrowserConfig;
  autoIt: AutoItConfig;
  /** Tiempos de espera (ms) por sección del flujo. */
  timeouts: {
    retryAfterErrorMs: number;
    connectionRefusedBackoffMs: number;
    postIdentifyWaitMs: number;
    sectionWaitMs: number;
    /** Cap por defecto para `waitForSelector` en frames y secciones del menú ICM. */
    selectorWaitMs: number;
    /** Cap para `waitForSelector` en login (SSO de Renault es lento). */
    loginSelectorWaitMs: number;
    /** Cap para `page.goto` / `page.waitForNavigation`. */
    navigationWaitMs: number;
    /** Cada cuántos ms se loguea WARN de progreso mientras se espera un selector. */
    logWaitProgressMs: number;
    /** Reintentos al fallar `waitForSelector` para sitios lentos (frameset). */
    selectorRetryAttempts: number;
    /** Backoff entre reintentos (ms). */
    selectorRetryBackoffMs: number;
    /**
     * Espera (ms) cuando la cola de VINes está vacía antes de re-consultar
     * el CRM. Por defecto 10 minutos. Configurable vía `ICM_QUEUE_EMPTY_MS`.
     */
    queueEmptyMs: number;
  };
  /** Mensajes de diálogo conocidos del navegador ICM. */
  dialogMessages: {
    vinUnknown: string[];
    pauseF0023: string;
    pausePM: string;
  };
  /** Configuración de diagnóstico (HTML dumps a disco cuando falla un selector). */
  debug: {
    /** Si true, vuelca el HTML completo del frame/página a disco cuando un selector falla. */
    dumpHtmlOnError: boolean;
    /** Cada cuántos ms vuelca HTML parcial durante la espera (0 = solo al fallar). */
    dumpHtmlProgressMs: number;
    /** Directorio donde se vuelcan los HTML (relativo a process.cwd()). */
    dumpDir: string;
  };
}

const DEFAULT_TOKEN =
  'YzIyMzQ2OTBhNDA5ZmRiZTRiMDEyODYzZGFiM2QxNGJ0b2tlbmRlc2VndXJpZGFk';

export const appConfig: AppConfig = {
  api: {
    endpoint: {
      host: process.env.ICM_API_URL ?? 'intranet.caribemotor.com.co',
      path: '/v2_base/index_notema.php?sub_cat=api_icm',
    },
    token: process.env.ICM_API_TOKEN ?? DEFAULT_TOKEN,
  },
  browser: {
    loginUrl: 'https://dcs.renault.com/rne_hpa2/home.jsp',
    icmServletUrl: 'https://dcs.renault.com/icm3/jsp/ServletLogin',
    fullscreen: true,
    viewport: { width: 1080, height: 1024 },
    passwordScriptDelayMs: 5000,
    sessionExpiredMessage: 'Session expired',
  },
  autoIt: {
    executable:
      process.env.ICM_AUTOIT_EXE ??
      '"C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe"',
    entersScript: process.env.ICM_AUTOIT_ENTERS ?? 'C:\\icm\\enters.au3',
    passwordScript:
      process.env.ICM_AUTOIT_PASSWORD ?? 'C:\\icm\\enter_password.au3',
  },
  timeouts: {
    retryAfterErrorMs: 1000 * 20,
    connectionRefusedBackoffMs: 1000 * 60 * 5,
    postIdentifyWaitMs: 4000,
    sectionWaitMs: 3000,
    selectorWaitMs: 30_000,
    loginSelectorWaitMs: 60_000,
    navigationWaitMs: 30_000,
    logWaitProgressMs: 10_000,
    selectorRetryAttempts: 3,
    selectorRetryBackoffMs: 2000,
    queueEmptyMs:
      Number(process.env.ICM_QUEUE_EMPTY_MS ?? 0) || 1000 * 60 * 10,
  },
  dialogMessages: {
    vinUnknown: [
      'El VIN INTRODUCIDO ES DESCONOCIDO',
      'Mensaje 017: Atención, una intervención',
    ],
    pauseF0023: 'Mensaje F0023',
    pausePM: 'Verificar si se visualiza una fecha de entrega en ICM',
  },
  debug: {
    dumpHtmlOnError: process.env.ICM_DUMP_HTML_ON_ERROR !== '0',
    dumpHtmlProgressMs: 0,
    dumpDir: process.env.ICM_DUMP_DIR ?? 'logs',
  },
};

/**
 * Construye la URL completa para una consulta de vehículo en ICM.
 */
export function buildVehicleUrl(vin: string, km: string | number): string {
  const url = new URL(appConfig.browser.icmServletUrl);
  url.searchParams.set('VIN', vin);
  url.searchParams.set('KM', String(km));
  return url.toString();
}