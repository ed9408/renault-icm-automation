/**
 * Selectores CSS/DOM centralizados.
 * Antes vivían dispersos en auth_phase1.mjs, icm.mjs, index.js.
 * Ahora cualquier cambio al sitio de Renault toca solo este archivo.
 *
 * Convención:
 * - Claves en MAYÚSCULAS con prefijo por sección.
 * - Selectores como string para pasarlos a `page.waitForSelector` / `querySelector`.
 */

export const Selectors = {
  /** Página de autenticación inicial (Phase1). */
  phase1: {
    icmModuleSpan: '#spanIdMenuRenaultN42H764740176C0',
  },

  /** Login dentro de ICM. */
  icmLogin: {
    accessButton:
      '#form20 > div.o-form-content.o-form-theme.clearfix > a',
    validateButton:
      'body > form > table > tbody > tr:nth-child(4) > td > input[type=submit]',
  },

  /** Estructura de frames. */
  frames: {
    bodyName: 'body',
    menuName: 'FrameMenu',
    mainFrameset: 'html > frameset',
  },

  /** Enlace "Búsqueda vehículo" que se debe pulsar antes de buscar el VIN. */
  vehicleSearchLink: 'body > center > table > tbody > tr:nth-child(6) > td > a',

  /** "Connexion à ICM refusée" – el navegador se queda esperando. */
  connectionRefusedMarker: 'Connexion à ICM refusée',

  /** Sección "Detalles vehículo". */
  details: {
    titleSelector:
      '#DivDet > table:nth-child(1) > tbody > tr > td.TitrePage',
    fields: {
      tipo_vh: "input[name=Vehicule_TYPE_APV]",
      num_fab: "input[name=Vehicule_N_FAB]",
      tipo_mot: "input[name=Vehicule_TYP_MOT]",
      tipo_caja: "input[name=Vehicule_TYP_BOI]",
      fecha_entrega:
        '#DivDet > table:nth-child(2) > tbody > tr:nth-child(2) > td:nth-child(8)',
    },
  },

  /** Sección "Histórico". */
  historic: {
    titleSelector:
      'body > table:nth-child(7) > tbody > tr > td.TitrePage',
    moreButton: 'body > table:nth-child(9) > tbody > tr > td.Outils > a',
  },

  /** Sección "Contratos y servicios". */
  agreements: {
    titleSelector:
      'body > table:nth-child(11) > tbody > tr > td.TitrePage',
  },

  /** Sección "Programa de mantenimiento". */
  maintenance: {
    titleSelector:
      'body > table:nth-child(8) > tbody > tr > td.TitrePage',
  },

  /** Sección "Administrativa". */
  admin: {
    /** Selector principal – puede fallar, hay fallback en alternates. */
    primaryTitleSelector:
      'body > table:nth-child(8) > tbody > tr > td.TitrePage',
    alternates: [
      '#dvContainer > table:nth-child(3) > tbody > tr > td > table > tbody > tr > td.TitrePage',
    ],
    fields: {
      tipo_mot: "input[name=Vehicule_TYP_MOT]",
      tipo_caja: "input[name=Vehicule_TYP_BOI]",
      tipo_vh: "input[name=TYPE_APV]",
      fecha_entrega:
        '#dvContainer > table:nth-child(4) > tbody > tr:nth-child(2) > td:nth-child(8)',
    },
    actionButton:
      '#dvContainer > table:nth-child(2) > tbody > tr > td > table > tbody > tr > td:nth-child(2) > a',
  },

  /** Sección "OTS a realizar". */
  ots: {
    titleSelector:
      'body > table:nth-child(1) > tbody > tr > td.TitrePage',
  },

  /** Sección "Recomendación de mantenimiento". */
  recmant: {
    titleSelector:
      'body > table:nth-child(11) > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(1)',
  },

  /** Menú lateral – clase que comparten todas las opciones. */
  menuItemClass: '.LigneMenu',
} as const;

/**
 * Nombres "humanos" de las secciones del menú lateral.
 * Se pasan a `calculate_menus` para mapear cada nombre a su selector.
 */
export const MenuNames = [
  'OTS a realizar',
  'Detalles vehículo',
  'Histórico',
  'Contratos y servicios',
  'Programa de mantenimiento',
  'Administrativo',
  'Recomendación de mantenimiento',
] as const;

export type MenuName = (typeof MenuNames)[number];