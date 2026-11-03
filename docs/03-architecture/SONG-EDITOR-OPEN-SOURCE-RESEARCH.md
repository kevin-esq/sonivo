# Referencias open source para editar letras y acordes

**Fecha de revisión:** 2026-10-30
**Propósito:** contrastar los editores del documento adjunto con el flujo de edición de Arrangement en Sonivo y separar patrones útiles de afirmaciones que el código no confirma.
**Alcance:** inspección del código, API pública, documentación y cambios históricos ligados a edición de letras, sincronización, ChordPro, disposición de acordes, importación/exportación y experiencia móvil. No es una auditoría de todas las áreas de producto ni de cada commit de estos repositorios.

## Resumen ejecutivo

**Observado:** el documento adjunto presenta ocho referencias distintas como si fueran ocho editores web comparables. No lo son. LRC Studio, Lsync y LRC Maker son aplicaciones; ChordProject Editor y ChordBook Editor son paquetes de CodeMirror; softChord es una suite de editor de escritorio y visores; ChordPro es una implementación del formato y compositor; wavelyric es un editor de sincronía de una sola página.

**Observado:** Sonivo ya cuenta con editor dedicado de letra/acordes, player vinculado, sincronización por línea/palabra, edición de interludios, importación con revisión, búsqueda de acordes, snippets ChordPro, validación visible y exportación. Las rutas y controles viven en `ArrangementDetailPage`, `PracticePage` y `VisualChordEditor`; el formato se adapta con código propio.

**Observado:** Sonivo no tiene todavía equivalencia funcional completa con esos referentes. El editor visual modela slots de palabras, no anclas persistentes por carácter; no se observó una pila propia de undo/redo para los borradores visuales; y la colocación manual depende de seleccionar acorde y luego destino. La edición de origen sí conserva el undo nativo del textarea, pero eso no equivale a undo coordinado de letra, acordes y tiempos.

**Inferido:** copiar una aplicación completa no resolvería la integración. Los repositorios cumplen trabajos diferentes y varios gestionan cuentas, proyectos, datos o flujos externos que Sonivo no necesita. La transferencia útil es elegir patrones acotados: sincronizador primero, editor de origen segundo, preview contextual, preservar anclas y proteger borradores.

**Propuesto:** cerrar primero las brechas de preservación del trabajo y de colocación de acordes, manteniendo el editor de letra y el de acordes separados como pide Sonivo. No adoptar aplicaciones completas ni sustituir el contrato Arrangement/ChordPro.

## Método y límites

- Se revisaron README, manifiestos, interfaces públicas, componentes y utilidades directamente relacionados con autoría. Se inspeccionaron historiales de rutas de código seleccionadas y el diff de commits que introducen o corrigen comportamientos relevantes.
- Los SHA abajo fijan cada snapshot revisado; los enlaces GitHub no dependen de la rama actual.
- “La documentación dice” se distingue de “el código hace”. Un README por sí solo no prueba un caso de uso.
- El adjunto es una evaluación editorial, no fuente técnica primaria. Su ranking (“mejor”, “más completo”) no es una propiedad verificable del código.
- Esta revisión no recorrió todas las líneas de miles de commits ajenos al editor. ChordPro, por ejemplo, tiene más de cuatro mil commits; solo se consideran sus interfaces de edición/formato pertinentes.
- No se copiaron archivos ni se instalaron esos proyectos en Sonivo. Las referencias se usan para describir patrones; Sonivo los implementa con sus propias rutas, identidad e invariantes.

## Hallazgos por repositorio

### 1. LRC Studio — edición sincronizada con varios modos

**Snapshot:** `crimsonCarnival/lrc-studio-client` `6e73542`.

**Observado — estructura y flujo:** `Editor.tsx` coordina el estado de edición, player, modos de línea/palabra, paneles, acciones, búsqueda, contraparte y disposición móvil. No es un componente pequeño ni una biblioteca de editor: es la pantalla central de una aplicación mayor. `VirtualizedLineList.tsx` renderiza líneas con TanStack Virtual; su extractor conserva la línea activa aunque quede fuera del rango de viewport. `WordsFocus.tsx` separa navegación de líneas y timeline de palabras. `WordsModeColumn.tsx` mantiene las palabras como chips y usa un relleno CSS por palabra, en vez de actualizar React para cada porcentaje de progreso.

**Observado — sincronía y protección de datos:** el timeline de palabras limita el arrastre entre marcas vecinas, mantiene una separación mínima de 20 ms y marca como sospechosas palabras menores de 80 ms. `useHistory.ts` agrupa cambios cercanos en una entrada y limita el historial. `useWordsMode.ts` cubre dividir/combinar palabras, lecturas, atribución de cantante y limpieza de marcas; al dividir una palabra no adivina dónde empieza su segunda parte.

**Observado — móvil:** `MobileEditorLayout.tsx` separa Sincronizar, Letra y Vista previa en pestañas; el flujo de sincronía conserva controles táctiles y una barra fija. Así reduce el panel simultáneo de escritorio sin quitar herramientas.

**Historial comprobado:** `e3e5ad8` rediseñó modos de letra/palabra y pestañas móviles en un cambio grande; `fedf893` extrajo la fila de enfoque de palabras para separar su medición/render; `5dd92e8` corrigió filas virtuales que conservaban alturas obsoletas tras borrar o editar. Esto es evidencia de que virtualizar sin volver a medir rompe el diseño, no una razón para virtualizar Sonivo automáticamente.

**Qué no es transferible:** cuenta con buscador/importadores, proyectos, colaboradores, contraparte/idiomas y asistencia de transcripción. El README documenta esas funciones, pero no son componentes reutilizables ni autorización para agregar esas capacidades a Sonivo. La asistencia automática queda fuera del alcance aceptado de Sonivo.

Fuentes: [orquestación de Editor](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/core/Editor.tsx#L1-L54) · [medición/virtualización](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/core/VirtualizedLineList.tsx#L175-L265) · [límites del timeline](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/modes/WordsFocus.tsx#L9-L13) y [drag/intervalo](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/modes/WordsFocus.tsx#L90-L173) · [karaoke fill](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/modes/WordsModeColumn.tsx#L32-L77) · [historial](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/hooks/useHistory.ts#L19-L100) · [mobile tabs](https://github.com/crimsonCarnival/lrc-studio-client/blob/6e73542/src/features/editor/components/mobile/MobileEditorLayout.tsx#L39-L190) · [rediseño móvil](https://github.com/crimsonCarnival/lrc-studio-client/commit/e3e5ad8) · [re-medición tras borrar](https://github.com/crimsonCarnival/lrc-studio-client/commit/5dd92e8).

### 2. Lsync — flujo explícito de sincronía y retiming

**Snapshot:** `code4nigel/Lsync` `fbd3e86`.

**Observado:** es una SPA React. `TabSync.jsx` reúne selección de línea, marca de tiempo con teclado, seek, playback speed, latencia, loops A/B, marcas de pausa, final de línea y retimer. `useLrc.ts` mantiene un reducer para diferenciar línea seleccionada, línea activa y siguiente marca. El README describe sincronización lineal y por palabra, búsqueda LRCLIB, importación de enlaces de video y exportación LRC/eLRC/JSON/TXT/DOC. `lrcParser.js` contiene parse/serialize Enhanced LRC, pero el README no demuestra que cada fuente externa sea confiable ni que cada export retenga toda metadata.

**Observado — móvil:** el README describe dock táctil fijo. El historial contiene correcciones específicas: `f9750ec` reparó handlers de marcar/deshacer en móvil; `d123afe` separó el dock de sincronía y reservó espacio al final; `caa6fbe` corrigió tamaño de fuente y retorno de scroll. Esto respalda mantener controles a mano y probar el espacio reservado con scroll real.

**Qué no es:** no es un widget React publicado para integrar; es una aplicación completa. Incluye LRCLIB y fuentes de video externas, que no se adoptan por copiar su interfaz.

Fuentes: [README y flujos anunciados](https://github.com/code4nigel/Lsync/blob/fbd3e86/README.md#L14-L94) · [estado de TabSync](https://github.com/code4nigel/Lsync/blob/fbd3e86/src/components/TabSync.jsx#L21-L40) · [retimer](https://github.com/code4nigel/Lsync/blob/fbd3e86/src/components/TabSync.jsx#L89-L124) · [marca/ajustes por teclado](https://github.com/code4nigel/Lsync/blob/fbd3e86/src/components/TabSync.jsx#L85-L177) · [Enhanced LRC parser](https://github.com/code4nigel/Lsync/blob/fbd3e86/src/utils/lrcParser.js#L13-L114) · [arreglo de dock](https://github.com/code4nigel/Lsync/commit/d123afe) · [arreglo de acciones móvil](https://github.com/code4nigel/Lsync/commit/f9750ec).

### 3. LRC Maker — sincronización React con teclado y waveform opcional

**Snapshot:** `magic-akari/lrc-maker` `eeba3cc`.

**Observado:** es TypeScript/React y mantiene el documento en `useReducer` (`useLrc.ts`). `Synchronizer` distingue línea seleccionada de línea resaltada por audio, escucha el reloj por pub/sub, marca con `Space`, mueve selección con flechas, ajusta tiempo y bloquea shortcuts cuando el foco está en input. `audio.tsx` puede mostrar waveform WaveSurfer con seek arrastrable; el waveform es opcional para audio local. `editor.tsx` ofrece abrir/parsear, copiar, descargar y guardar a Gist.

**Historial comprobado:** `41caea9` añadió ajuste fino del timestamp seleccionado con `-`/`+`; `46572a6` extrajo shortcuts a un sistema configurable después de que estaban ligados a teclas fijas. El patrón útil es que el atajo sea visible/configurable y solo actúe cuando el foco no sea un campo.

**Corrección al adjunto:** el adjunto deja el soporte de sincronía por palabra como “No verificado”. El README actual presenta modo Words; el manifiesto declara paquete separado `@lrc-maker/lrc-parser`. Eso prueba que el editor tiene modo, no que el paquete parser por sí mismo sea una experiencia de edición.

**Qué no es:** la app no es un componente web embebible; el parser sí es un paquete separado. Auto Stamp, Gist y proveedores externos no son necesarios para editar una canción de Arrangement.

Fuentes: [README: modos](https://github.com/magic-akari/lrc-maker/blob/eeba3cc/README.md#L53-L75) · [sincronizador/selección](https://github.com/magic-akari/lrc-maker/blob/eeba3cc/src/components/synchronizer.tsx#L35-L94) · [foco y atajos](https://github.com/magic-akari/lrc-maker/blob/eeba3cc/src/components/synchronizer.tsx#L116-L177) · [waveform interactivo](https://github.com/magic-akari/lrc-maker/blob/eeba3cc/src/components/waveform.tsx#L16-L50) · [estado LRC](https://github.com/magic-akari/lrc-maker/blob/eeba3cc/src/hooks/useLrc.ts#L66-L155) · [ajuste de timestamps](https://github.com/magic-akari/lrc-maker/commit/41caea9) · [shortcuts configurables](https://github.com/magic-akari/lrc-maker/commit/46572a6).

### 4. ChordProject Editor — API embebible para el texto ChordPro

**Snapshot:** `chordproject/chordproject-editor` `25926e3`, paquete `@chordproject/editor`.

**Observado:** es la referencia más cercana a un editor reutilizable. `createChordProEditor(options)` crea CodeMirror 6 en un contenedor y devuelve controles `getValue/setValue`, cambio de tema, insertar acorde, abrir autocompletado/búsqueda, sugerir/normalizar nombres y destruir la instancia. El host suministra `onChange` y etiquetas localizadas. El autocompletado prioriza acordes ya usados y contexto de progresión. Snippets se expanden con Tab; folding entiende bloques; el linter separa errores de advertencias y puede insertar cierre faltante.

**Casos de fallo visibles en el historial:** `ccf1b99` añadió buscar/reemplazar y lenguaje; `aa984e0` añadió diagnóstico de sintaxis y normalización; `5a569ea` corrigió falsos avisos de sección sin cerrar cuando sí había un cierre posterior. El caso importa: un linter de ChordPro no debe tratar una sección válida como error solo porque analiza de manera local.

**Límite:** es un editor de origen, no una vista visual que ancla acordes a letras, ni editor de timing LRC, ni aplicación de arreglos. El manifiesto indica peer parser obligatorio. Su API demuestra una seam de integración clara; no demuestra que reemplazar el editor visual de Sonivo sea mejor para usuarios no técnicos.

Fuentes: [API y opciones](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/index.ts#L20-L58) · [composición y lifecycle](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/index.ts#L59-L122) · [prioridad de acordes](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/autocomplete/chords.ts#L17-L98) · [diagnósticos](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/linting.ts#L83-L188) · [folding](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/folding.ts#L16-L40) · [search/replace UI](https://github.com/chordproject/chordproject-editor/blob/25926e3/src/search-panel.ts#L43-L80) · [falso positivo corregido](https://github.com/chordproject/chordproject-editor/commit/5a569ea).

### 5. ChordBook Editor — CodeMirror mínimo

**Snapshot:** `chordbook/editor` `50788ad`, paquete `@chordbook/editor`.

**Observado:** `createEditor(config)` construye CodeMirror con lenguaje ChordPro, autocompletado, snippets, history, lint y tema oscuro. Su alcance declarado es más estrecho que ChordProject Editor: resaltar sintaxis, completar acordes ya usados y reportar errores del parser. El historial muestra `919d7bd` para completar; `bd3830e` añadió linter básico, cuyo mensaje de error es genérico por limitación del árbol de sintaxis; `cba580f` ajustó scroll para que el contenedor del editor, y no su padre, sea quien desplaza.

**Qué no ofrece:** su README no documenta sincronización con audio, importación/exportación de archivos o edición visual del ancla. La afirmación del adjunto de que la API es “sencilla” está respaldada por `createEditor`; “Excelente” como integración es valoración, no resultado del código.

Fuentes: [README y contrato declarado](https://github.com/chordbook/editor/blob/50788ad/README.md#L1-L35) · [API](https://github.com/chordbook/editor/blob/50788ad/src/index.ts#L1-L20) · [extensiones](https://github.com/chordbook/editor/blob/50788ad/src/extensions/index.ts#L1-L52) · [linter genérico](https://github.com/chordbook/editor/blob/bd3830e/src/extensions/linter.ts#L1-L28) · [cambio de scroll](https://github.com/chordbook/editor/commit/cba580f).

### 6. softChord — posición de acorde ligada a carácter

**Snapshot:** `matvey83/softChord` `2735f0b`.

**Observado:** es la referencia más útil para la pregunta “¿qué pasa si cambia la letra?”. Un acorde se guarda como índice de carácter del texto; los diffs conservan prefijo/sufijo, desplazan acordes después del tramo editado y sueltan anclas sobre texto borrado. Undo restaura texto y acordes como una unidad. La web dibuja acordes sobre el mismo documento editable, reservando altura para no mover líneas al aparecer un acorde. Edit Text y Edit Chords son modos separados con guardar/descartar. En modo chord se puede mover con pointer/teclas; el drag cancelado revierte, y el gesto es una acción de undo. Los documentos registran límites Unicode, IME, drag-touch, chords inválidos y scroll al abrir/cerrar.

**Historial comprobado:** `c052986` incorporó edición de letra sobre la hoja con 2,422 líneas añadidas entre implementación, pruebas y documentación; `3dd3339` sacó el espacio visual de acordes del historial de edición para que Undo no revierta layout en lugar del texto; `8c5c101` corrigió acordes sin letra que rompían copiar/pintar. El equipo documenta explícitamente límites y estado no implementado: selección múltiple/marquee y Alt-drag-copy no están construidos.

**Límite:** es un songbook local multiapp, no backend colaborativo multiusuario ni un paquete React. La web declara que cambios se pierden al salir. Su algoritmo de anclas es una referencia semántica, pero Sonivo debe conservar su modelo ChordPro y límites de Arrangement.

Fuentes: [README: comportamiento](https://github.com/matvey83/softChord/blob/2735f0b/README.md#L1-L55) · [reglas de reanclaje](https://github.com/matvey83/softChord/blob/2735f0b/docs/lyric_editing.md#L1-L42) · [teclas/drag/cancel](https://github.com/matvey83/softChord/blob/2735f0b/docs/chord_editing.md#L18-L67) · [layout de carácter](https://github.com/matvey83/softChord/blob/2735f0b/src/softchord_layout.py#L229-L258) · [parser/transpose de acordes](https://github.com/matvey83/softChord/blob/2735f0b/src/softchord_chords.py#L291-L351) · [nueva edición web](https://github.com/matvey83/softChord/commit/c052986) · [layout fuera de undo](https://github.com/matvey83/softChord/commit/3dd3339).

### 7. ChordPro oficial — gramática, interpretación y salida

**Snapshot:** `ChordPro/chordpro` `4b25408d`.

**Observado:** es la implementación de referencia en Perl del lenguaje ChordPro 6. Convierte archivos de letra/acorde en hojas imprimibles y expone CLI, GUI y opciones de composición. Su valor para Sonivo es la semántica del formato: directivas, metadatos, acorde, comentarios, bloques y salida. No es un editor React ni una biblioteca pequeña para montar dentro de un modal. No se debe reducir el formato a “texto con corchetes” si se quiere preservar directivas desconocidas.

**Límite:** que el proyecto acepte un archivo o lo renderice no significa que Sonivo deba imitar su GUI de escritorio. Sonivo usa ChordPro como uno de sus textos de Arrangement y exporta la hoja desde su propia UI.

Fuentes: [README: producto, lenguaje y licencia](https://github.com/ChordPro/chordpro/blob/4b25408d/README.md#L1-L36) · [índice de documentación](https://github.com/ChordPro/chordpro/blob/4b25408d/docs/README.md).

### 8. wavelyric — waveform canvas y marcas manuales

**Snapshot:** `SyntaxBlitz/wavelyric` `2e528b6`.

**Observado:** app AngularJS de 2016, no React ni componente. `MarkerEditor` dibuja waveform/markers/cursor con Canvas y `requestAnimationFrame`; permite zoom centrado en el puntero, scroll, drag de marcas y seek. El controlador asocia marcas a filas y evita que dos se acerquen menos de 50 ms; hotkeys recorren línea, seek y marca. Exporta karaoke LRC para Steno Hero y puede exportar audio Ogg.

**Límite:** su UI antigua y alcance acotado no cubren edición moderna accesible/táctil ni colaboración. Es útil como referencia de interacción de timeline y límites de marcas, no como diseño visual a copiar.

Fuentes: [README: alcance/export](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/README.md#L1-L12) · [constructor/listeners de markers](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/markerEditor.js#L32-L162) · [límite de distancia y drag](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/markerEditor.js#L53-L83) y [reordenamiento al mover](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/markerEditor.js#L217-L255) · [waveform canvas](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/waveform.js#L161-L190) · [atajos/marcas](https://github.com/SyntaxBlitz/wavelyric/blob/2e528b6/index.js#L63-L113) · [manejo de archivo no-audio](https://github.com/SyntaxBlitz/wavelyric/commit/48272be).

## Comparación con Sonivo actual

| Capacidad | Sonivo observado | Referencia técnica | Diferencia accionable |
|---|---|---|---|
| Edición separada de letra/acordes | Rutas/modal y modo por sección en `ArrangementDetailPage.tsx`; modo reproducir abre el mismo modal desde `PracticePage.tsx` | softChord separa modos; LRC Studio separa tabs de tarea en móvil | Mantener la separación y asegurar que entrada/salida preserve origen y borrador |
| Sincronía con audio | `VisualChordEditor.tsx` usa PracticePlayer, marcas de línea/palabra y teclas | LRC Maker y Lsync | Mostrar atajos cercanos al control y mantenerlos fuera de campos editables |
| Timeline manipulable | Hay marcar/cerrar palabra/interludio y ajuste global de tiempo; el texto visual marca palabra activa | LRC Studio tiene bloques de palabra drag/nudge; wavelyric timeline canvas | Sonivo no expone actualmente el mismo timeline de segmentos por palabra para arrastrar extremos |
| Edición ChordPro | `ChordProSourceEditor.tsx`: resaltado, snippets, find/replace, sugerencias y validación propia | ChordProject Editor / ChordBook | Confirmar cursor/selección y presentar errores accionables sin duplicar feedback |
| Colocación visual | `chordProDigitizer.ts` modela slots por fragmento/palabra; selección de acorde y click de destino | softChord liga a carácter; ChordProject trabaja sobre origen | **Brecha principal:** cambios de letra pueden reanclar por índice de slot; no hay el modelo por carácter de softChord |
| Undo/redo coordinado | El textarea conserva historial nativo; el formulario usa borrador, guardar y confirmar descarte | LRC Studio agrupa undo; softChord agrupa movimiento y letra/acordes | **Brecha:** no se observó undo/redo propio que agrupe texto, colocación y marcas como una acción |
| Protección al editar | Confirmación al descartar y conflicto de versión en guardar | softChord hace draft/Save/Discard; LRC Studio history | Revisar cancel, conflicto, cambio de sección y recuperación tras error con datos reales |
| Móvil | El editor visual refluye a una columna; controles conservan targets táctiles | LRC Studio y Lsync usan modos/dock específicos | Validar que la tarea primaria no quede enterrada tras audio/importación/retimer |

Las rutas Sonivo citadas describen implementación actual en este worktree: [`VisualChordEditor.tsx`](../../web/apps/app/src/repertoire/VisualChordEditor.tsx#L181), [`ChordProSourceEditor.tsx`](../../web/apps/app/src/repertoire/ChordProSourceEditor.tsx#L67), [`chordProDigitizer.ts`](../../web/apps/app/src/repertoire/chordProDigitizer.ts#L6), [`ArrangementDetailPage.tsx`](../../web/apps/app/src/repertoire/ArrangementDetailPage.tsx#L67) y [`PracticePage.tsx`](../../web/apps/app/src/repertoire/PracticePage.tsx#L133).

## Decisiones de implementación para Sonivo

**Observado — límites vinculantes:** ADR-0028 mantiene ChordPro dentro de Arrangement; ADR-0096 define word timing manual; ADR-0100/0101 admiten importación/exportación rica sin inventar tiempo. ADR-0096 prohíbe copiar código y agregar dependencias GPL/AGPL. Estos límites ya autorizan desarrollar editor propio, no alterar el backend por estética.

**Propuesto — orden por riesgo de usuario:**

1. **Undo/redo del borrador** para cambio de letra/acorde/tiempo; tratar una acción de arrastre como una sola entrada; no meter cambios de layout en historial.
2. **Preservación de acordes al editar letra:** sustituir el alineamiento ciego por índice por un mapeo probado de segmentos retenidos, con reglas explícitas para inserción, borrado, duplicados y Unicode. Si un ancla cae sobre texto borrado, marcarla como huérfana o pedir revisión; no moverla silenciosamente a otra palabra.
3. **Timeline de palabras** con límites visibles, nudge por teclado, clamp entre vecinas, indicador de marcas cortas/superpuestas y seek desde el timeline. Mantener precisión de `ChordTimingJson` y sus validaciones actuales.
4. **Chords de origen:** mantener CodeMirror solo si los usuarios realmente necesitan editar ChordPro crudo. Mejorar descubribilidad de snippets, sugerencias y diagnóstico; nunca reemplazar la edición visual por un textarea técnico.
5. **Móvil por tareas:** flujo Sincronizar / Letra / Vista previa cuando la prueba de uso muestre necesidad; conservar controles sticky sin tapar última línea ni teclado virtual.
6. **Playwright:** probar edición móvil y desktop, save/cancel/conflicto, mover/acoplar acordes tras editar texto, marcas por línea/palabra, línea instrumental, teclado y retorno al punto de origen.

El punto 2 cambia la semántica del anclaje de acordes. Antes de implementarlo se debe fijar contrato y reglas en la spec activa; no se debe introducir como “refactor visual” porque puede alterar datos guardados.

## Validación de esta investigación

- Clones locales temporales, sin instalación de dependencias, sin cambios en sus repositorios.
- Verificados snapshots, README/manifiestos y rutas de código nombradas; historiales consultados en rutas relacionadas, no commits ajenos al editor.
- Sonivo revisado por lectura de fuentes y decisiones. Esta nota no afirma que los ocho proyectos se hayan reproducido visualmente en navegador ni que se haya completado el rediseño de Sonivo.
- No se corrieron pruebas de la aplicación durante esta investigación.
