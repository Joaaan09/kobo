import { z } from 'zod';

/**
 * Contraseña al crearla o cambiarla. Mínimo 8 (§11: esto guarda datos
 * financieros). El login NO usa este esquema: allí solo se comprueba que venga
 * algo, para no bloquear a quien tenga una contraseña anterior más corta.
 */
export const passwordSchema = z.string().min(8, 'password_too_short').max(200);

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
