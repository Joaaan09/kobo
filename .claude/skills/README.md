# Skills

Skills del proyecto **Kobo**: capacidades reutilizables que se invocan con `/<nombre-skill>`.

Cada skill es una carpeta con un `SKILL.md`:

```
.claude/skills/
  mi-skill/
    SKILL.md        # frontmatter (name, description) + instrucciones
    ...             # scripts/recursos auxiliares opcionales
```

Frontmatter mínimo de `SKILL.md`:

```markdown
---
name: mi-skill
description: qué hace y cuándo usarla
---

Pasos / instrucciones de la skill.
```

## Skills de diseño instaladas (craft)

Copiadas del arnés de referencia. Son **guía, no autoridad**: ante conflicto **manda
[DESIGN.md](../../DESIGN.md)**. En UI úsalas para motion, interacción y pulido.

- `design-taste-frontend` — criterio de diseño de frontend.
- `emil-design-eng` — ingeniería de diseño (detalle e interacción).
- `review-animations` — rúbrica para revisar animaciones (`STANDARDS.md`).

`skills-lock.json` (en la raíz) fija el origen/hash de `review-animations`.

## Ideas de skills para Kobo (crear cuando hagan falta)

- `nueva-vista` — scaffolding de una vista siguiendo el shell móvil, tokens y radios de
  [DESIGN.md](../../DESIGN.md) (Taller / Gastos / Meses / Yo).
- `checklist-pr-ui` — ejecuta el checklist final de DESIGN.md sobre el diff actual.
- `nuevo-endpoint` — scaffolding de un endpoint Express con auth JWT + validación zod + test.
