import mongoose from 'mongoose';
import { env } from './env.js';

/** Conecta a MongoDB con Mongoose. Reintenta con back-off simple. */
export async function connectDB(retries = 5, delayMs = 3000): Promise<void> {
  mongoose.set('strictQuery', true);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI);
      console.log('✅ MongoDB conectado');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`⚠️  MongoDB intento ${attempt}/${retries} falló: ${msg}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
