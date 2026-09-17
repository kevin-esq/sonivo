# SONIVO — Gate B UI/UX design brief

**Status:** **ACCEPTED / CLOSED** 2026-09-17 (Kevin Esquivel). Implemented as T-GATE-B-01–05 on `develop`.  
**Binding visual board:** [`assets/gate-b-ui-reference.jpg`](assets/gate-b-ui-reference.jpg)  
**Implementation contract (ADRs + tickets):** [`../03-architecture/PHASE-GATE-B-UI-SPEC.md`](../03-architecture/PHASE-GATE-B-UI-SPEC.md)

If this brief and an ACCEPTED ADR conflict, **the ADR wins**. If this brief and the board conflict on chrome, **the board wins**. If the board invents a feature (Google login, Event notes, file artwork), **the spec prohibitions win**.

---

Diseña la interfaz y el sistema visual de **Sonivo**, una plataforma SaaS para organizar proyectos musicales.

Sonivo NO es Spotify.  
Sonivo NO es un DAW.  
Sonivo NO es un software de iglesia.  
Sonivo NO es un ERP.  
Sonivo NO es un gestor de tareas genérico.

Sonivo es la capa de organización alrededor de un proyecto musical:

**Idea → canción → arreglo → ensayo → setlist → evento → interpretación**

Puede ser utilizada por bandas, grupos de covers, artistas independientes, coros, ensambles, pequeños grupos musicales, proyectos colaborativos, ministerios musicales y pequeñas orquestas.

La interfaz debe hacer que el usuario sienta que está entrando a un espacio de trabajo dedicado a su música, no a otro SaaS administrativo genérico.

---

## 1. Principio de diseño

La regla principal es:

> **Music-first, software-second.**

La aplicación debe sentirse como una herramienta profesional para músicos, pero conservar la claridad, consistencia y ergonomía de un SaaS moderno.

Debe transmitir: creatividad, organización, colaboración, preparación, confianza, profesionalismo, energía, simplicidad.

No debe transmitir: software corporativo aburrido, dashboard financiero, CRM, software contable, aplicación excesivamente gamer, landing page llena de efectos, interfaz genérica generada por IA.

El diseño debe ser suficientemente distintivo para que Sonivo tenga identidad propia.

---

## 2. Referencias visuales y recursos

### Base del sistema — shadcn/ui

Usar como base conceptual para buttons, inputs, dialogs, dropdowns, cards, tabs, sheets, tooltips, navigation, forms, tables, toasts, empty states, sidebar.

No utilizar shadcn sin personalización. La interfaz final debe sentirse como Sonivo, no como una instalación vanilla de shadcn.

### Iconografía

- **Lucide** — lenguaje principal.
- **Reicon** — solo si Lucide no alcanza; no mezclar estilos en una misma pantalla.
- **Morphicons** — selectivo para iconos que cambian de estado (menu↔close, play↔pause). Respuestas físicas, no decoración.

---

## 3. Animación

**subtle + useful + musical.** Nunca espectáculo.

Preferencia:

1. CSS/Tailwind para microinteracciones simples.
2. Motion para interacciones React (reorder, layout, drag).
3. Morphicons para transformación de iconos.
4. Anime.js **no** se instala en Gate B.

Respetar `prefers-reduced-motion`.

Hover 120–180ms · small 150–250ms · layout/reorder 200–350ms · important 300–450ms.

---

## 4. Componentes visuales avanzados

Aceternity, Magic UI, Eldora, Rare UI, 21st.dev, Origin UI: **inspiración puntual**, no dependencias. Si se copia un patrón: adaptarlo al sistema Sonivo (color, radius, type, iconos, a11y) hasta que no parezca un componente copiado.

---

## 5. Filosofía visual

**Dark / musical / modern / elegant / focused.**

No: cyberpunk, neon overload, glassmorphism extremo, gradients en todo, partículas, blobs, 3D, sombras exageradas, cards flotando sin jerarquía.

Sí: profundidad sutil, contraste elegante, superficies oscuras, acentos luminosos controlados, cards limpias, whitespace, jerarquía, pequeños detalles musicales.

---

## 6. Color system (board)

Ver tabla hex en el spec. Tokens Tailwind: background azul-negro / charcoal; surface elevado; text primary blanco suave; secondary gris azulado; accent violeta/indigo `#8366F1`. Gradientes excepcionales, no de fondo en cada componente.

---

## 7. Branding

Logo: waveform / pulso / sincronización — no una nota musical genérica como marca principal.  
Wordmark: **Sonivo**. Tagline: **Plan. Play. Together.**

---

## 8. Layout

Desktop: sidebar persistente. Orden del tablero (el tablero gana sobre la lista Inicio→Biblioteca del borrador): **Inicio, Setlists, Eventos, Biblioteca**, luego **Miembros** (desktop) + grupo actual + avatar.  
Mobile: bottom nav **Inicio, Setlists, Eventos, Biblioteca** + drawer para Miembros/cuenta. Acciones frecuentes fáciles de tocar en ensayo.

---

## 9–30. Product screens (summary)

- **Inicio:** centro de preparación, no KPIs financieros. Próximo evento, setlists recientes, recuento de biblioteca. Componer APIs existentes.
- **Biblioteca:** colección musical (título, Original/Cover/Other, nº de arreglos), no tabla admin.
- **Song → Arrangements → Resources** visible.
- **Setlist:** numeración, reorder físico, add/save. Plan de Event **no** es una vista viva del Setlist (copy-on-apply).
- **Apply:** confirmación destructiva si ya hay plan (`confirmReplace`).
- **Member:** experiencia enfocada de lectura/preparación, no “versión limitada”.
- Empty states musicales y útiles. Toasts para guardado / 409 humano.
- Accessibility first-class (teclado, focus, labels, contraste, touch, alternativa a drag).

Jerarquía: primitives (shadcn restyled) → product components (SongCard, SetlistItem, EventPlanItem, …) → page compositions.

---

## 31. MVP vs brief original

El brief largo listaba invite/RSVP como futuro. **En este repositorio ya están shipped.** Gate B los rediseña. File upload, player avanzado, stems, álbumes **no**.

---

## 32. Test de pantalla

Antes de dar una pantalla por cerrada: ¿la entiende un músico sin docs? ¿Acción primaria obvia? ¿Contexto musical? ¿Jerarquía? ¿Velocidad de ensayo? ¿Mobile? ¿Un solo producto? ¿Animación útil? ¿Cards de más? ¿Se ve Sonivo y no un SaaS genérico de IA?
