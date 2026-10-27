import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api';
import { Button, Daruma, Field, TextInput } from '../../ui';
import { InstallBanner } from '../../features/install/InstallBanner';
import styles from './index.module.css';

type Mode = 'login' | 'register';

interface LocationState {
  from?: { pathname?: string };
}

/** Pantalla de acceso (/login): login o registro contra la API. */
export function LoginView() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si ya hay sesión, no tiene sentido mostrar el login.
  if (user) {
    return <Navigate to="/" replace />;
  }

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Introduce tu email y contraseña.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Email o contraseña incorrectos.' : err.message);
      } else {
        setError('No se pudo conectar. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <Daruma size={56} />
        <span className={styles.wordmark}>KOBO</span>
        <p className={styles.tagline}>工房 · tu taller de finanzas</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>

        <Field label="Email" htmlFor="login-email">
          <TextInput
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
          />
        </Field>

        <Field label="Contraseña" htmlFor="login-password">
          <TextInput
            id="login-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={submitting}>
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>

        <button
          type="button"
          className={styles.switch}
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setError(null);
          }}
        >
          {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </form>

      {/* Solo se pinta a sí mismo si toca (móvil, en el navegador y sin descartar). */}
      <InstallBanner />
    </main>
  );
}
