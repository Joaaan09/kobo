#!/usr/bin/env bash
# =====================================================================
# Kobo — resincroniza la contraseña del usuario root de MongoDB con .env
#
# Cuándo hace falta: el contenedor `mongo` arranca con `--auth` (porque el
# compose define MONGO_INITDB_ROOT_*), pero el volumen ya estaba inicializado,
# así que Mongo NO recrea el usuario root. Si el .env se regenera con otra
# contraseña, el backend deja de autenticar ("Authentication failed") y no hay
# forma de entrar: la excepción de localhost solo sirve si no existe ningún
# usuario. La salida es arrancar mongod una vez SIN auth y reescribir la clave.
#
# No toca ninguna colección: solo el usuario de admin. Los datos se conservan.
# Uso:  bash scripts/fix-mongo-auth.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ No encuentro .env en $(pwd). Aborto."
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${MONGO_USER:?falta MONGO_USER en .env}"
: "${MONGO_PASSWORD:?falta MONGO_PASSWORD en .env}"

VOLUME="$(docker volume ls -q | grep -E 'kobo.*mongo_data$' | head -1)"
if [ -z "$VOLUME" ]; then
  echo "❌ No encuentro el volumen de datos de Mongo. Aborto."
  exit 1
fi
echo "▸ Volumen de datos: $VOLUME"

TMP=kobo-mongo-fix
cleanup() { docker stop "$TMP" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▸ Parando backend y mongo…"
docker compose stop backend mongo >/dev/null

echo "▸ Arrancando mongod temporal SIN auth (solo loopback interno, sin puertos publicados)…"
docker rm -f "$TMP" >/dev/null 2>&1 || true
docker run -d --rm --name "$TMP" -v "$VOLUME":/data/db mongo:7 mongod --bind_ip 127.0.0.1 >/dev/null

echo -n "▸ Esperando a que acepte conexiones"
for _ in $(seq 1 30); do
  if docker exec "$TMP" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 1
done

echo "▸ Sincronizando el usuario root con las credenciales del .env…"
docker exec -e U="$MONGO_USER" -e P="$MONGO_PASSWORD" "$TMP" mongosh --quiet --eval '
  const admin = db.getSiblingDB("admin");
  const u = process.env.U, p = process.env.P;
  const existing = admin.system.users.find({ db: "admin" }, { user: 1, _id: 0 }).toArray().map((x) => x.user);
  print("  usuarios en admin: " + JSON.stringify(existing));
  if (existing.includes(u)) {
    admin.changeUserPassword(u, p);
    print("  ✓ contraseña actualizada para \"" + u + "\"");
  } else {
    admin.createUser({ user: u, pwd: p, roles: [{ role: "root", db: "admin" }] });
    print("  ✓ usuario \"" + u + "\" creado con rol root");
  }
  const dbs = db.adminCommand({ listDatabases: 1 }).databases.map((d) => d.name).join(", ");
  print("  bases de datos conservadas: " + dbs);
'

echo "▸ Apagando el mongod temporal…"
cleanup
trap - EXIT
sleep 2

echo "▸ Levantando la pila (mongo con auth + backend + frontend)…"
docker compose up -d --build

echo
echo "✅ Listo. Comprueba el estado con:  docker compose ps"
