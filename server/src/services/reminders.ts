import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';
import { sendToUser } from './push.js';
import { pushEnabled } from '../config/env.js';
import { madridDayKey, madridDayRange, madridHour, madridParts } from '../lib/time.js';

/**
 * Recordatorio de fin de día (通知): "apunta lo que no entró solo".
 *
 * Planificador **en proceso**, no un cron del sistema: Kobo es una app personal en
 * un único contenedor, así que un `setInterval` que despierta cada minuto es más
 * simple de operar y de razonar que un servicio aparte. Si algún día hay réplicas,
 * esto necesitaría un cerrojo compartido para no avisar N veces.
 *
 * Idempotencia por `lastDailyKey` (el día ya avisado, en hora de Madrid): el tick
 * corre cada minuto, pero cada usuario recibe **como mucho un aviso al día**.
 *
 * La condición es `hora actual >= hora elegida` en vez de igualdad exacta: si el
 * backend estaba caído o reiniciándose justo a esa hora, el aviso sale en cuanto
 * vuelve, en lugar de perderse hasta el día siguiente.
 */

const TICK_MS = 60_000;

/** Formatea céntimos para el cuerpo de la notificación. */
function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/**
 * Recorre los usuarios con recordatorio activo y avisa a los que toca.
 * Exportada para poder ejercitarla desde un script sin esperar al reloj.
 */
export async function runDailyReminders(now = new Date()): Promise<number> {
  if (!pushEnabled) return 0;

  const hour = madridHour(now);
  const dayKey = madridDayKey(now);

  const users = await User.find({
    'prefs.notifications.dailyReminder': true,
    'prefs.notifications.dailyHour': { $lte: hour },
    // Ya avisado hoy → fuera. `$ne` también deja pasar a quien no tiene el campo.
    'prefs.notifications.lastDailyKey': { $ne: dayKey },
  });

  let sent = 0;
  for (const user of users) {
    const { year, month, day } = madridParts(now);
    const { start, end } = madridDayRange(year, month, day);
    const todays = await Expense.find({
      userId: user._id,
      date: { $gte: start, $lt: end },
    });

    const total = todays.reduce((sum, e) => sum + e.amountCents, 0);
    const body =
      todays.length === 0
        ? 'No has apuntado ningún gasto hoy. ¿Ha sido un día sin gastos?'
        : `Llevas ${todays.length} ${todays.length === 1 ? 'gasto' : 'gastos'} · ${formatEuros(total)}. ¿Falta alguno?`;

    await sendToUser(String(user._id), {
      title: 'Cierre del día · 工房',
      body,
      url: '/gastos',
      // Un único recordatorio vivo: el de hoy sustituye al de ayer si quedó sin ver.
      tag: 'kobo-recordatorio',
    });

    // Se marca SIEMPRE, aunque no hubiera dispositivos: si no, cada minuto se
    // reintentaría el mismo aviso durante el resto del día.
    await User.updateOne(
      { _id: user._id },
      { $set: { 'prefs.notifications.lastDailyKey': dayKey } },
    );
    sent += 1;
  }

  return sent;
}

/** Arranca el planificador. Devuelve una función para pararlo (tests/apagado). */
export function startDailyReminders(): () => void {
  if (!pushEnabled) {
    console.log('[recordatorios] desactivados: no hay claves VAPID configuradas');
    return () => {};
  }

  const timer = setInterval(() => {
    void runDailyReminders().catch((err) => {
      console.error('[recordatorios] tick fallido', err);
    });
  }, TICK_MS);

  // No debe mantener vivo el proceso por sí solo: quien manda es el servidor HTTP.
  timer.unref();
  console.log('[recordatorios] planificador en marcha (tick de 60 s)');
  return () => clearInterval(timer);
}
