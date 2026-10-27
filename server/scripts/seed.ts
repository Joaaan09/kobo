import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { IncomeConfig } from '../src/models/IncomeConfig.js';
import { Category } from '../src/models/Category.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Seed idempotente (upsert por email/nombre): usuario inicial, su nómina fija
 * y 4 categorías (sin subcategorías). Reejecutable sin duplicar.
 *
 * Credenciales e importe SIEMPRE por entorno (SEED_EMAIL, SEED_PASSWORD,
 * SEED_NOMINA_CENTS): son datos personales, nunca se hardcodean en el repo.
 * Sin defaults a propósito — si faltan, el seed aborta en vez de crear un
 * usuario con credenciales conocidas.
 *
 * Colores: hex neutros/acento alineados a la paleta washi (terracota, matcha,
 * oro, índigo). Placeholders coherentes; el usuario podrá ajustarlos en Ajustes.
 */

const SEED_EMAIL = process.env.SEED_EMAIL;
const SEED_PASSWORD = process.env.SEED_PASSWORD;
/** Nómina fija en céntimos (el dinero es sagrado: enteros, nunca floats). */
const NOMINA_CENTS = Number(process.env.SEED_NOMINA_CENTS);

interface SeedCategory {
  name: string;
  kanji: string;
  color: string;
  percentBp: number;
  order: number;
  flexible: boolean;
}

/**
 * Reparto de ejemplo, deliberadamente redondo y genérico: suma 100 % (10.000 bp)
 * y no refleja el presupuesto de nadie. Ajústalo desde Ajustes tras el primer login.
 */
const CATEGORIES: SeedCategory[] = [
  { name: 'Vida', kanji: '生活', color: '#B4472F', percentBp: 5000, order: 0, flexible: false },
  { name: 'Ahorro e inversión', kanji: '貯蓄', color: '#3F7A6B', percentBp: 3000, order: 1, flexible: false },
  { name: 'Ocio', kanji: '娯楽', color: '#C98A2B', percentBp: 1500, order: 2, flexible: false },
  { name: 'Aleatorio', kanji: '自由', color: '#6E7AA8', percentBp: 500, order: 3, flexible: true },
];

/** Aborta si falta config: mejor no sembrar que sembrar credenciales por defecto. */
function requireEnv(): { email: string; password: string; nominaCents: number } {
  const missing: string[] = [];
  if (!SEED_EMAIL) missing.push('SEED_EMAIL');
  if (!SEED_PASSWORD) missing.push('SEED_PASSWORD');
  if (!Number.isInteger(NOMINA_CENTS) || NOMINA_CENTS < 0) missing.push('SEED_NOMINA_CENTS');
  if (missing.length > 0) {
    console.error(
      `❌ Faltan variables de entorno para el seed: ${missing.join(', ')}.\n` +
        '   Defínelas en server/.env (ver .env.example). No hay valores por defecto a propósito.',
    );
    process.exit(1);
  }
  if (SEED_PASSWORD!.length < 8) {
    console.error('❌ SEED_PASSWORD debe tener al menos 8 caracteres (igual que `passwordSchema`).');
    process.exit(1);
  }
  return { email: SEED_EMAIL!, password: SEED_PASSWORD!, nominaCents: NOMINA_CENTS };
}

async function seed(): Promise<void> {
  const { email, password, nominaCents } = requireEnv();

  await connectDB();

  // Usuario (no pisa el passwordHash si ya existe: $setOnInsert).
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, passwordHash } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Nómina fija.
  await IncomeConfig.findOneAndUpdate(
    { userId: user._id },
    {
      userId: user._id,
      type: 'fija',
      amountCents: nominaCents,
      payDay: 1,
      effectiveFrom: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Categorías (upsert por userId + name).
  let repartidoBp = 0;
  for (const cat of CATEGORIES) {
    await Category.findOneAndUpdate(
      { userId: user._id, name: cat.name },
      { $set: { ...cat, userId: user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    repartidoBp += cat.percentBp;
  }

  const sinAsignarBp = 10000 - repartidoBp;
  console.log('✅ Seed completado');
  // Nunca se imprime la contraseña (§11: los secretos no van a logs).
  console.log(`   · Usuario: ${email}`);
  console.log(`   · Nómina fija: ${(nominaCents / 100).toFixed(2)} €`);
  console.log(`   · Categorías: ${CATEGORIES.length} → repartido ${repartidoBp} bp (${(repartidoBp / 100).toFixed(1)} %)`);
  console.log(`   · Sin asignar: ${sinAsignarBp} bp (${(sinAsignarBp / 100).toFixed(1)} %)`);

  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('❌ Fallo en el seed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
