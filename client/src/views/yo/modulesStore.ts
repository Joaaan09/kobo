/**
 * Preferencias de "Módulos del panel" (y aviso de límite de categorías).
 * v1: persistidas en localStorage — todavía no hay endpoint de prefs de usuario.
 * Follow-up: mover a `PATCH /me/prefs` (ver User.prefs.modules en el modelo).
 */

export type ModuleKey = 'ritmo' | 'comparativa' | 'sinAsignar' | 'avisoLimite';

const STORAGE_KEY = 'kobo.modules';

/** Estado por defecto (coincide con el mockup de Ajustes). */
const DEFAULTS: Record<ModuleKey, boolean> = {
  ritmo: true,
  comparativa: false,
  sinAsignar: true,
  avisoLimite: true,
};

/** Lee las preferencias fusionadas con los valores por defecto. */
export function readModules(): Record<ModuleKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<ModuleKey, boolean>>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persiste el cambio de un único módulo. */
export function writeModule(key: ModuleKey, value: boolean): void {
  const next = { ...readModules(), [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible: se ignora en v1 */
  }
}
