import 'dotenv/config';
import { z } from 'zod';

/**
 * Validación de variables de entorno. El backend NO arranca si faltan las
 * obligatorias (fail-fast). Los secretos nunca se loguean ni salen al cliente.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4100),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es obligatorio'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET debe tener ≥16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET debe tener ≥16 caracteres'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Web Push (VAPID). OPCIONALES a propósito: sin ellas Kobo arranca igual y las
  // notificaciones quedan desactivadas (`pushEnabled`), en vez de tumbar el backend
  // por una función accesoria. La privada es un secreto como el JWT.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`   · ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

/** ¿Hay par VAPID configurado? Si no, las notificaciones push quedan apagadas. */
export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
