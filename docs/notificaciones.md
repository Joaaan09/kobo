# Notificaciones (通知)

Kobo puede avisarte al móvil de dos cosas: **un gasto que acaba de entrar solo** y un **recordatorio
de fin de día** para apuntar lo que la automatización no puede ver.

## Requisito en iPhone: Kobo tiene que estar instalada

Apple solo entrega notificaciones web a las apps **añadidas a la pantalla de inicio**. En Safari normal
no llegan, y el sistema ni siquiera pide permiso.

Si aún no la has instalado: abre Kobo en Safari → botón **Compartir** → **Añadir a pantalla de inicio**.
Después abre la app **desde ese icono**, no desde Safari. En Ajustes → Notificaciones tienes un atajo a
esta misma guía cuando hace falta.

## Activarlas

**Yo → Notificaciones**:

1. **En este dispositivo** — el interruptor pide el permiso del sistema y da de alta este navegador.
   Es por dispositivo: si usas Kobo en el móvil y en el portátil, se activa en cada uno.
2. **Probar** — manda un aviso ahora mismo. Si llega, el canal funciona.

Si más adelante bloqueas las notificaciones desde los ajustes del sistema, Kobo no puede volver a
pedirlas: hay que reactivarlas ahí y volver a este interruptor.

## Qué avisos quieres

Al contrario que el interruptor, estas preferencias son **de la cuenta**: valen para todos tus
dispositivos a la vez.

**Avisar de un gasto** — cuando un pago entra por el Atajo del iPhone:

| Opción | Cuándo avisa |
| --- | --- |
| **Nunca** | Silencio total. El gasto se registra igual. |
| **Sin clasificar** *(por defecto)* | Solo cuando ninguna regla supo a qué categoría iba, o sea cuando hace falta que hagas algo. |
| **Todos** | Cada pago. Útil los primeros días para comprobar que todo entra; se vuelve ruido si pagas a menudo. |

Al tocar el aviso de un gasto sin clasificar, Kobo abre **Gastos ya filtrado por «Por revisar»**.

**Recordatorio de fin de día** — un aviso a la hora que elijas (18:00 a 23:00) con el resumen de lo que
llevas apuntado hoy. Está pensado para lo que la automatización **no puede ver**: efectivo, pagos con la
tarjeta física y transferencias.

Llega también los días en que ya has apuntado cosas, porque justamente entonces es cuando suele faltar
alguno; el texto cambia según lo que lleves ("no has apuntado ningún gasto" / "llevas 3 gastos · 42,10 €").
Se envía **una sola vez al día**.

## Si algo no llega

- **En el iPhone, ¿abriste Kobo desde el icono de la pantalla de inicio?** Desde Safari no hay push.
- **¿El interruptor "En este dispositivo" está activado?** Se desactiva solo si desinstalas la PWA o el
  navegador rota la suscripción; en ese caso vuelve a activarlo.
- **Prueba con el botón "Enviar"**. Si tampoco llega, el problema es el permiso del sistema, no Kobo.
- El recordatorio necesita que el backend esté en marcha a esa hora. Si estaba caído, sale en cuanto
  vuelve (ese mismo día), no al día siguiente.

## Nota técnica

Las notificaciones necesitan un par de claves **VAPID** en el `.env` del servidor
(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, generadas con `npx web-push generate-vapid-keys`). Si faltan,
Kobo arranca igual y la pantalla de Ajustes lo dice en vez de fallar. La privada es un secreto: mismo
trato que el del JWT.
