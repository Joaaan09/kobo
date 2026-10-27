# Atajo de iOS — que el pago entre solo en Kobo

Guía para conectar el iPhone con Kobo: cuando pagas, el gasto se registra sin abrir la app.

## Antes de empezar: qué se puede automatizar y qué no

iOS solo avisa de una transacción cuando el pago pasa por **Apple Pay** — el iPhone o el Watch en el
datáfono, o Apple Pay dentro de una app o web. Si sacas la **tarjeta física**, el sistema no se entera:
no existe ningún disparador de "notificación del banco" y hay que apuntar ese gasto a mano.

Dicho de otro modo: esta automatización rinde si te acostumbras a pagar con el móvil.

## 1. Crear el dispositivo en Kobo

En la app: **Yo → Automatización → Dispositivos → Crear dispositivo**.

- Ponle un nombre que reconozcas (`iPhone · Visa`).
- **Enlaza la cuenta** de la que sale el dinero de esa tarjeta. Es opcional, pero es lo que hace que el
  pago descuente también del patrimonio, no solo del presupuesto.
- Al crearlo verás **el token una sola vez**. Cópialo ya: Kobo solo guarda su huella, no se puede volver
  a consultar. Si lo pierdes, borra el dispositivo y crea otro.
- Copia también la **dirección** que aparece debajo (`https://…/api/ingest/transaction`).

Un token solo sirve para **registrar gastos**. No puede leer tus datos, ni ver tu patrimonio, ni entrar
en tu cuenta. Si pierdes el móvil, bórralo desde esa misma pantalla.

## 2. Crear la automatización en el iPhone

App **Atajos → Automatización → + → Transacción**.

1. **Tarjeta**: elige la tarjeta de Wallet que quieres seguir. Si tienes varias, haz una automatización
   por tarjeta y usa en cada una el token del dispositivo correspondiente (así cada pago descuenta de
   la cuenta correcta).
2. Deja **Categoría** y **Comercio** en "Cualquiera".
3. Marca **Ejecutar inmediatamente** y desactiva "Notificar al ejecutar" si no quieres el aviso de iOS
   (Kobo puede darte el suyo, ver el paso 4).

Luego añade **una sola acción**: `Obtener contenido de la URL`, configurada así (toca la flecha para
desplegar las opciones):

| Campo | Valor |
| --- | --- |
| URL | `https://TU-DOMINIO/api/ingest/transaction` |
| Método | `POST` |
| Encabezados | `Authorization` → `Bearer ` + el token (ver aviso) |
| Solicitud | `JSON` |

> ⚠️ **El token ya empieza por `kobo_`; no lo escribas tú.** En el valor del encabezado teclea solo
> `Bearer` y un espacio, y **pega el token entero** a continuación. Debe quedar
> `Bearer kobo_XXXXXXXX…`, con **48 caracteres** después de `Bearer `. Si ves `kobo_kobo_…` has
> duplicado el prefijo y el servidor rechazará cada pago con un `401`, en silencio.
>
> Ojo también con lo que enseña Kobo en la lista de dispositivos: eso son solo los **13 primeros
> caracteres** (`kobo_XXXXXXXX`), para que reconozcas el token, no el token. El valor completo se
> muestra **una sola vez**, al crear el dispositivo.

Y en el cuerpo JSON, estos campos. Todos de tipo **Texto**:

| Clave | Valor |
| --- | --- |
| `amount` | La transacción → propiedad **Importe** |
| `merchant` | La transacción → propiedad **Comercio** |
| `card` | La transacción → propiedad **Tarjeta** |
| `clientRef` | Ver abajo (opcional; déjalo para el final) |

### Cómo se meten esas variables (esto no se escribe a mano)

Los valores de la tabla no se teclean: se **insertan** y luego se les dice qué parte de la transacción
quieres. Estando en el campo de valor de `amount`:

1. Toca el campo. Sobre el teclado sale la barra de variables → **Seleccionar variable**.
2. La pantalla cambia a la vista de variables. Arriba aparece **Entrada del atajo**: esa *es* la
   transacción. Tócala.
3. Se abre el editor de esa variable, con sus propiedades listadas bajo el título. Elige **Importe**.

Para `merchant` y `card`, exactamente lo mismo cambiando el paso 3: **Comercio** y **Tarjeta**.

> **Si en el paso 2 no aparece "Entrada del atajo"**, el disparador no te está pasando la transacción:
> vuelve a la pantalla del disparador *Transacción* y activa **"Recibir transacción como entrada"**.

Consejo: monta primero solo `amount` y `merchant`, paga algo pequeño y comprueba que llega. Añade `card`
y `clientRef` después, cuando ya sepas que el camino funciona.

Notas de cada campo:

- **`amount`** — da igual el formato: Kobo entiende `12,50 €`, `€12.50` o `1.234,56`. Se convierte a
  céntimos con aritmética entera, nunca con decimales flotantes. **No añadas la acción `Reemplazar
  texto`** con expresiones regulares que piden otras guías para limpiar el importe: aquí sobra, el
  servidor lo parsea tal cual llega.
- **`merchant`** — es lo que se compara contra tus reglas. No hace falta limpiarlo: `MERCADONA S.A. 4021`
  y `Mercadona 3312` caen los dos en la regla `Mercadona`.
- **`clientRef`** *(opcional)* — evita gastos duplicados si iOS reintenta la automatización. Si no lo
  quieres, **borra la clave entera** del JSON en vez de dejarla creada y vacía: una variable que no
  resuelve no desaparece del cuerpo, se manda como texto vacío. (Kobo ya lo tolera —lo trata como
  ausente— pero durante un tiempo eso rechazaba el pago entero, así que mejor no dejar claves a medias.)

  Es un texto que mezcla lo que tecleas y variables insertadas; en el campo se ve así (las cápsulas son
  variables, el resto lo escribes tú, todo seguido y sin espacios):

  ```
  wallet-[Fecha actual]-[Importe]
  ```

  Y lo que se envía acaba siendo algo como `wallet-20260806-1432-12,50 €`. La **Fecha actual** se inserta
  con la acción/variable `Fecha` y se le da formato personalizado `yyyyMMdd-HHmm` tocándola.

  Los guiones son decorativos: a Kobo solo le importa que ese texto sea **el mismo si iOS reintenta el
  mismo pago** y **distinto entre pagos distintos**. Con fecha al minuto, dos compras del mismo importe
  en el mismo minuto se fundirían en una (raro, pero conviene saberlo). Si te resulta engorroso, omite
  el campo entero: solo pierdes esa protección.
- **`date`** *(opcional)* — si no lo mandas, el gasto se fecha en el momento en que llega.
- **`note`** *(opcional)* — texto libre que quieras guardar en el gasto.

## 3. Probar sin comprar nada

No hace falta gastar dinero para saber si está bien montado.

**Atajo de prueba (lo que de verdad conviene hacer).** Crea un **atajo normal**, no una automatización —
llámalo "Probar Kobo"— con la misma acción `Obtener contenido de la URL`: misma URL, mismo encabezado
`Authorization`, mismo JSON, pero con el valor **escrito a mano** en vez de variables:

- `amount` → `1,23`
- `merchant` → `Prueba Kobo`

Un atajo suelto sí se lanza con el botón ▶ las veces que quieras. Abre Kobo, comprueba que el gasto de
1,23 € aparece en **Gastos**, y bórralo desde ahí. Esto valida lo que suele fallar de verdad: la URL, el
token, el formato del JSON y que el gasto entra donde debe.

**Lanzar la automatización a mano.** También puedes tocarla en la lista para ejecutarla sin pagar. Las
variables de la transacción llegarán vacías y Kobo responderá con error — pero *cuál* error ya dice mucho:
un `400` significa que el token es válido y llegaste al servidor (solo faltaban los datos, que en un pago
real sí vienen); un `401` significa que el problema está en el token.

**Lo único que no se puede simular** es que iOS dispare la automatización al pagar y que las variables
traigan importe y comercio reales. Eso lo confirma el primer pago que hagas con el iPhone, sea el que sea.

### Qué significa cada respuesta

Si algo no llega, mira en Atajos el historial de la automatización: la respuesta del servidor lo explica.

| Respuesta | Qué significa |
| --- | --- |
| `404` | No estás llegando al endpoint (URL mal escrita, o esa versión de Kobo aún no está desplegada). |
| `401 missing_token` / `invalid_token` | Falta `Bearer ` delante, el token está mal copiado (incompleto o con espacios), o lleva el prefijo **`kobo_` duplicado** (`kobo_kobo_…`) por pegarlo detrás de un `kobo_` ya escrito. |
| `401 revoked_token` | Ese dispositivo se borró o revocó en Kobo: crea otro. |
| `400 amount_required` | El campo `amount` llegó vacío o no venía. Con la automatización lanzada a mano es **lo normal**. |
| `400 invalid_amount` | Llegó algo en `amount`, pero no es un importe reconocible (¿se insertó la variable equivocada?). |
| `400 invalid_payload` | El cuerpo no es el JSON que espera Kobo. Los campos opcionales vacíos ya no cuentan: solo el importe puede tumbar un pago. |
| `400 refund_not_supported` | Era una devolución (importe negativo): apúntala como ingreso a mano. |
| `400 zero_amount` | Autorización de 0 € (gasolinera, alquiler de coche). No es un gasto; Kobo no avisa de estas. |
| `409 no_category` | Aún no tienes ninguna categoría creada en Kobo. |
| `429 rate_limited` | Más de 60 envíos en un minuto: algo está en bucle. |

**Y si no miras el historial de Atajos:** desde ahora un pago rechazado **te llega al móvil** como aviso
(«Un pago no entró en Kobo») y queda anotado en **Yo → Automatización → Dispositivos**, bajo el nombre
del dispositivo, con la fecha y el motivo en cristiano. Si ahí no hay nada en rojo, es que todo entró.

## 4. (Opcional) Notificación con el resultado

Kobo ya te avisa por su cuenta cuando un pago **no** entra (y, según tu preferencia de notificaciones,
también cuando entra). Esto de aquí es el extra: que sea el propio Atajo quien te enseñe la respuesta
en el momento. Si lo quieres, añade después de la petición:

1. `Obtener valor de diccionario` → clave `data` (del *Contenido de la URL*).
2. `Obtener valor de diccionario` → clave `summary` (del resultado anterior).
3. `Mostrar notificación` con ese texto.

Verás algo como `12,50 € · Comida` o `12,50 € · Variable (por revisar)`.

## 5. Enseñarle a clasificar

Al principio Kobo no conoce ningún comercio: todo entra en tu categoría comodín con la marca
**«Por revisar»**. Eso es a propósito — el dinero ya salió de tu cuenta, así que el gasto se registra al
instante; lo único que falta es decidir su categoría.

Cuando abras uno de esos gastos en **Gastos** y le pongas categoría, deja activado *«Recordar»*: la
próxima compra en ese comercio entrará ya clasificada. También puedes crear las reglas a mano en
**Yo → Automatización → Reglas de comercio**.

Consejo: escribe reglas cortas y reconocibles (`mercadona`, `repsol`, `renfe`). Si dos reglas encajan,
gana la más específica, así que puedes tener `mercadona` → *Comida* y `mercadona online` → *Comida ·
Compra grande* a la vez.
