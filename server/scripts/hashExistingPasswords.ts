/**
 * Migración de datos: genera un hash bcrypt para cada usuario de ingem_users
 * que todavía no tiene passwordHash, tomando su contraseña en texto plano
 * actual. NO modifica la contraseña que usa el usuario (columna password se
 * deja intacta) y es idempotente: si ya hay hash, lo saltea.
 *
 * Uso (manual, NUNCA automático):
 *   DATABASE_URL="mysql://..." pnpm db:hash-passwords
 *
 * IMPORTANTE: ejecutar apuntando a la base que corresponda. Este script no se
 * ejecuta solo ni durante el arranque del servidor.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { ingemUsers } from "../../drizzle/schema";
import { hashPassword, looksLikeBcryptHash } from "../passwordUtils";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("[hash-passwords] DATABASE_URL no configurada o base no disponible. Abortando.");
    process.exit(1);
    return;
  }

  const users = await db.select().from(ingemUsers);
  console.log(`[hash-passwords] ${users.length} usuario(s) encontrados.`);

  let migrated = 0;
  let skipped = 0;
  let noPlaintext = 0;

  for (const user of users) {
    if (user.passwordHash && looksLikeBcryptHash(user.passwordHash)) {
      skipped++;
      continue; // ya migrado
    }
    if (!user.password) {
      noPlaintext++;
      console.warn(`[hash-passwords] Usuario id=${user.id} (${user.email}) sin passwordHash y sin password en claro: requiere reseteo manual.`);
      continue;
    }
    const passwordHash = await hashPassword(user.password);
    await db.update(ingemUsers).set({ passwordHash }).where(eq(ingemUsers.id, user.id));
    migrated++;
    console.log(`[hash-passwords] Hash generado para id=${user.id} (${user.email}).`);
  }

  console.log(`[hash-passwords] Listo. Migrados: ${migrated}, ya con hash: ${skipped}, sin contraseña: ${noPlaintext}.`);
  console.log("[hash-passwords] La columna 'password' NO fue modificada.");
  process.exit(0);
}

main().catch(err => {
  console.error("[hash-passwords] Error:", err);
  process.exit(1);
});
