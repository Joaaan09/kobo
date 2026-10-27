import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { RefreshProvider } from './data/RefreshContext';
import { AppShell } from './shell/AppShell';
import { LoginView } from './views/login';
import { TallerView } from './views/taller';
import { GastosView } from './views/gastos';
import { CuentasView } from './views/cuentas';
import { MesesView } from './views/meses';
import { YoView } from './views/yo';

/**
 * Raíz de la app: providers anidados + router. Todas las rutas se registran AQUÍ
 * (ThemeProvider → AuthProvider → RefreshProvider → BrowserRouter).
 */
export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RefreshProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginView />} />

              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<TallerView />} />
                <Route path="gastos" element={<GastosView />} />
                <Route path="cuentas" element={<CuentasView />} />
                <Route path="meses" element={<MesesView />} />
                <Route path="yo" element={<YoView />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RefreshProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
