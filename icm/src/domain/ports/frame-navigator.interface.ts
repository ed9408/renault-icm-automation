import type { Frame } from '../models/frame-context.ts';

/** Mapa calculado nombre → selector CSS. */
export type MenuItemsMap = Record<string, string>;

export interface IFrameNavigator {
  /**
   * Recorre todos los elementos `.LigneMenu` del `frameMenu` y mapea
   * cada `MenuName` a su selector único generado por path-building.
   */
  calculateMenus(frameMenu: Frame, names: readonly string[]): Promise<MenuItemsMap>;

  /** Hace click en un enlace del menú. No-op si `elPath` es vacío/null. */
  gotoMenu(frameMenu: Frame, elPath: string | undefined): Promise<void>;
}