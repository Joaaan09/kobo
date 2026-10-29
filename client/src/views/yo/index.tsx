import { useAuth } from '../../auth/AuthProvider';
import { Button, Daruma } from '../../ui';
import { NominaCard } from './NominaCard';
import { ModulosCard } from './ModulosCard';
import { CategoriasCard } from './CategoriasCard';
import { AparienciaCard } from './AparienciaCard';
import { AplicacionCard } from './AplicacionCard';
import { AutomatizacionCard } from './AutomatizacionCard';
import { SuscripcionesCard } from './SuscripcionesCard';
import { NotificacionesCard } from './NotificacionesCard';
import { SeguridadCard } from './SeguridadCard';
import styles from './index.module.css';

/** Vista Yo (自分) / Ajustes (設定) — perfil, nómina, categorías, módulos y apariencia. */
export function YoView() {
  const { user, logout } = useAuth();

  return (
    <section className={styles.view} aria-label="Yo y ajustes">
      <header className={styles.header}>
        <div className={styles.identity}>
          <Daruma size={44} />
          <div className={styles.identityText}>
            <h1 className={styles.name}>Yo</h1>
            {user ? (
              <span className={styles.email} title={user.email}>
                {user.email}
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="ghost" onClick={() => void logout()}>
          Cerrar sesión
        </Button>
      </header>

      <NominaCard />
      <ModulosCard />
      <CategoriasCard />
      <SuscripcionesCard />
      <AparienciaCard />
      <AplicacionCard />
      <AutomatizacionCard />
      <NotificacionesCard />
      <SeguridadCard />
    </section>
  );
}
