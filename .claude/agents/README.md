# Agentes

Subagentes especializados del proyecto **Kobo**. Un archivo `.md` por agente.

Cada archivo lleva frontmatter:

```markdown
---
name: nombre-del-agente
description: cuándo usar este agente (lo lee el orquestador para decidir)
tools: Read, Edit, Bash   # opcional; por defecto hereda todas
---

Instrucciones / system prompt del agente.
```

Agentes actuales: `explorador` (solo lectura, investigación), `ejecutor` (implementa subtareas),
`revisor` (verifica adversarialmente).

> El despliegue de subagentes es la **excepción**, no la norma: por defecto se opera en **Modo
> Directo** con el protocolo del "botón rojo" (ver [CLAUDE.md](../../CLAUDE.md) §8).

Ideas de agentes para Kobo (crear cuando hagan falta):

- `revisor-diseno` — verifica que un PR de UI cumple [DESIGN.md](../../DESIGN.md) (solo tokens `--*`,
  funciona en Washi y Sumi, Shippori Mincho en cifras, radios/glass correctos, sin los anti-patrones del §0).
- `revisor-seguridad` — revisa el borde: auth JWT en todo endpoint privado, aislamiento por usuario
  (sin IDOR), validación con zod, y que ningún secreto/hash salga al cliente o a logs (ver [CLAUDE.md](../../CLAUDE.md) §11).
- `revisor-dinero` — audita la aritmética financiera: céntimos en vez de floats, porcentajes que cierran
  en 100 %, cálculo del "sin asignar", límites por categoría/subcategoría y presupuesto por mes.
