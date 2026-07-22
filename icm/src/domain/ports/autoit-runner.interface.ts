/**
 * Puerto para ejecutar scripts externos que automatizan la entrada
 * de credenciales en diálogos nativos de Windows.
 *
 * La implementación concreta (WindowsAutoItRunner) usa AutoIt3;
 * podría reemplazarse por una versión multiplataforma sin tocar
 * los use cases (OCP / DIP).
 */
export interface IAutoItRunner {
  /** Pulsa Enter (login inicial de ICM). */
  enter(): Promise<void>;

  /** Introduce la contraseña del token cuando aparece su diálogo. */
  enterPassword(): Promise<void>;
}