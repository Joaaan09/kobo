import { Router } from 'express';
import { User, type UserDocument } from '../models/User.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../auth/cookie.js';
import { requireAuth } from '../auth/middleware.js';
import { registerSchema, loginSchema, changePasswordSchema } from '../schemas/auth.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

/** DTO público de usuario: nunca expone el passwordHash. */
function toUserDto(user: UserDocument) {
  return { id: String(user._id), email: user.email, prefs: user.prefs };
}

// POST /api/auth/register — crea usuario, setea cookie de sesión.
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req, res);
    if (!body) return;
    const existing = await User.findOne({ email: body.email });
    if (existing) {
      sendError(res, 'email_taken', 409);
      return;
    }
    const passwordHash = await hashPassword(body.password);
    const user = await User.create({ email: body.email, passwordHash });
    setAuthCookie(res, signToken(String(user._id)));
    sendOk(res, { user: toUserDto(user) }, 201);
  }),
);

// POST /api/auth/login — verifica credenciales, setea cookie.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req, res);
    if (!body) return;
    const user = await User.findOne({ email: body.email });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      sendError(res, 'invalid_credentials', 401);
      return;
    }
    setAuthCookie(res, signToken(String(user._id)));
    sendOk(res, { user: toUserDto(user) });
  }),
);

// POST /api/auth/logout — limpia la cookie de sesión.
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  sendOk(res, { loggedOut: true });
});

// POST /api/auth/change-password — cambia la contraseña del usuario de la sesión.
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(changePasswordSchema, req, res);
    if (!body) return;

    const user = await User.findById(getUserId(req));
    if (!user) {
      sendError(res, 'unauthorized', 401);
      return;
    }

    // La contraseña actual se exige siempre: una cookie robada no basta para
    // secuestrar la cuenta cambiándole la contraseña al dueño (§11).
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      sendError(res, 'invalid_password', 400);
      return;
    }
    if (body.newPassword === body.currentPassword) {
      sendError(res, 'same_password', 400);
      return;
    }

    user.passwordHash = await hashPassword(body.newPassword);
    await user.save();

    // Renueva la cookie: el usuario sigue dentro y con el reloj de sesión a cero.
    setAuthCookie(res, signToken(String(user._id)));
    sendOk(res, { changed: true });
  }),
);

// GET /api/auth/me — usuario de la sesión.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(getUserId(req));
    if (!user) {
      sendError(res, 'unauthorized', 401);
      return;
    }
    sendOk(res, { user: toUserDto(user) });
  }),
);

export default router;
