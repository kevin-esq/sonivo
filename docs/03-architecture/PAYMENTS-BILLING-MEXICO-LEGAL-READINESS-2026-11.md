# Revisión legal inicial: pagos de Sonivo en México

**Fecha:** 2026-11-06
**Estado:** revisión técnica preliminar; no es dictamen legal ni fiscal.
**Mercado actual:** México. Estados Unidos y Brasil son expansiones futuras y no forman parte de esta revisión.

**Titular declarado:** persona física. RFC y domicilio siguen pendientes de confirmación; son pendientes de lanzamiento, no bloquean el trabajo técnico local.
**Clientes previstos:** consumidores individuales y organizaciones musicales que contraten para sus integrantes. El comprador contractual puede ser persona física o persona moral. La LFPC incluye algunas personas morales como consumidoras; cuándo aplica depende del uso y los requisitos legales, así que abogado debe revisar este modelo mixto.
**Reclamaciones:** el titular solicita atenderlas dentro de Sonivo. El Help existente contiene guías y preguntas frecuentes; no se encontró recepción ni seguimiento de reclamaciones. El canal dentro de Sonivo puede ser un medio adicional, pero la LFPC exige informar antes de contratar domicilio físico, números telefónicos y medios para reclamar/aclarar. “Solo dentro de la plataforma” no cubre por sí solo ese texto legal. El canal digital también debe seguir accesible si la cuenta no puede iniciar sesión.

## Conclusión

**Sonivo no debe habilitar cobros Live todavía.** El flujo ya pide y registra consentimiento expreso para cobros recurrentes, pero no demuestra la fecha exacta del cargo ni un aviso de renovación enviado al menos cinco días naturales antes. También faltan decisiones y evidencia fiscal, de privacidad y de conservación. Los indicadores Live (`AllowLiveCharges`, `FiscalReady` y `FinancialRlsReady`) deben permanecer desactivados.

La aplicación puede ofrecer cancelación de renovación desde Membresía. El Owner confirma la acción y el servidor programa la cancelación inmediata de la renovación, conservando el servicio hasta el fin del periodo pagado. La interpretación de ese acceso hasta fin de periodo frente al requisito legal de cancelar «de manera inmediata» debe confirmarse con asesoría mexicana antes de Live.

## Evidencia del código

| Requisito o control | Evidencia observada | Estado |
| --- | --- | --- |
| Precio y periodicidad claros | `BillingPanel` muestra el precio mensual y el texto localizado declara el cargo mensual recurrente. | Parcial: falta mostrar una fecha concreta de cobro. |
| Consentimiento expreso | El usuario debe marcar la casilla; la API rechaza `recurringConsent=false`; el servicio vuelve a validarlo. | Implementado. |
| Evidencia de consentimiento | `BillingAudit` registra actor, fecha y acción `recurring-consent-v1` con plan, intervalo, importe en centavos y moneda. | Implementado; conservar la versión y significado del texto asociado. |
| Aviso previo de renovación | No se encontró proceso de avisos de facturación ni manejo de `invoice.upcoming`; el worker no crea ni envía avisos de renovación. | Pendiente; bloquea Live. |
| Cancelación desde el producto | Membresía ofrece cancelar renovación; API envía `cancel_at_period_end=true` y conserva acceso hasta el vencimiento. | Implementado; interpretación jurídica y copy final requieren revisión. |
| Datos fiscales | El runbook mantiene `FiscalReady=false`; el sistema de administración se limita a recibir registros contables y no hay emisión CFDI integrada. | Pendiente; confirmar obligaciones del contribuyente y flujo de CFDI. |
| Privacidad | La búsqueda de rutas y páginas del producto no encontró aviso de privacidad integral ni mecanismo ARCO enlazado desde el flujo de pago. | Pendiente; requiere identidad y domicilio del responsable y datos reales del tratamiento. |
| Retención y purga | La retención/purga de espacio a 90 días y papelera de Group a 30 días no están implementadas; tampoco la purga de archivos y la prevención de resurrección por respaldos. | Pendiente; separar registros financieros con obligación de conservación. |
| Aislamiento financiero en PostgreSQL | Las políticas RLS financieras y sus pruebas negativas no están listas. | Pendiente; bloquea Live. |

Fuentes de código: `web/apps/app/src/plans/BillingPanel.tsx`, `web/apps/app/src/i18n/locales/es.ts`, `src/Sonivo.Api/Billing/BillingEndpoints.cs`, `src/Sonivo.Infrastructure/Payments/StripeBillingService.cs`, `src/Sonivo.Infrastructure/Payments/BillingWorker.cs`, `docs/03-architecture/STRIPE-BILLING-RUNBOOK.md` y `docs/03-architecture/STRIPE-BILLING-SECURITY-REVIEW.md`.

## Obligaciones mexicanas revisadas

### Renovación y cancelación

La versión de la **Ley Federal de Protección al Consumidor (LFPC)** publicada por la Cámara de Diputados refleja reforma al 12-12-2025. El artículo 76 Bis, fracción VIII, exige información clara, destacada y accesible sobre periodicidad, monto y fecha de cobros recurrentes, y consentimiento expreso e informado. Si hay renovación automática, exige avisar al menos cinco días naturales antes y permitir cancelación sin penalización. La fracción IX exige un mecanismo para cancelar de manera inmediata.

Aplicación a Sonivo: el texto y la casilla cubren parcialmente la divulgación y el consentimiento. Falta mostrar la fecha de cargo y evidenciar el aviso previo. La cancelación desde Membresía detiene la renovación sin asistencia humana, pero el servicio sigue disponible hasta fin del periodo. Un abogado debe confirmar si esa modalidad cumple la exigencia para la relación de consumo y revisar términos, reembolsos y renovaciones.

Fuente oficial: [LFPC, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf), artículo 76 Bis, fracciones VIII–IX.

El artículo 76 Bis, fracción III, también pide informar antes de contratar el domicilio físico, números telefónicos y otros medios para reclamaciones o aclaraciones. El artículo 2 incluye personas físicas y morales que compran como destinatarias finales; para ciertos usos empresariales limita la condición de consumidor a microempresas/microindustrias acreditadas. Por eso, permitir que una empresa pague no resuelve por sí solo qué régimen aplica: se debe revisar el uso y el comprador contractual. El formulario de Sonivo debe identificar si paga una persona física o moral y capturar sus datos fiscales cuando corresponda.

### Datos personales

La **LFPDPPP**, con última reforma indicada al 14-11-2025, requiere un aviso de privacidad con identidad y domicilio del responsable, datos tratados, finalidades, opciones para limitar uso/divulgación, mecanismo ARCO y medios para informar cambios (artículos 14–16). Requiere medidas administrativas, técnicas y físicas acordes con el riesgo (artículo 18) y notificación inmediata a titulares de vulneraciones que afecten significativamente sus derechos (artículo 19). También prevé supresión cuando los datos dejan de ser necesarios, después del bloqueo que corresponda (artículo 10).

La política aprobada de purga a 90 días puede coexistir con conservación selectiva cuando exista una obligación vigente, pero la implementación debe separar datos del producto, datos personales y comprobantes/registros fiscales. No se debe conservar todo indefinidamente por comodidad ni borrar registros fiscales requeridos junto con los Groups.

Fuente oficial: [LFPDPPP, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), artículos 10, 14–19 y 24.

### CFDI y conservación fiscal

El artículo 29 del **Código Fiscal de la Federación (CFF)** exige CFDI cuando las disposiciones fiscales aplicables obliguen a expedir comprobantes; el artículo 30 regula conservación de contabilidad y documentación fiscal, generalmente por cinco años con cómputos y excepciones legales. No puede concluirse desde este repositorio cuál entidad es contribuyente, qué régimen aplica ni el tratamiento fiscal concreto de las suscripciones.

Un recibo del proveedor de pagos y la fila propia de historial no prueban que se emitió un CFDI. El contrato actual no emite CFDI desde Sonivo. Un contador/asesor fiscal debe definir quién factura, impuestos, moneda, datos que se solicitarán al cliente, cancelación/sustitución de CFDI y conservación antes de activar `FiscalReady`.

Fuentes oficiales: [CFF, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf), artículos 29 y 30; [SAT: genera facturas para tu empresa](https://wwwmat.sat.gob.mx/tramites/84057/genera-facturas-para-tu-empresa).

## Cierre previo a Live

1. Confirmar con abogado mexicano el contrato para personas físicas y morales, y cómo se aplica cancelación inmediata cuando el acceso ya pagado continúa hasta el fin del periodo.
2. Mostrar en el checkout importe, periodicidad, fecha del primer cargo y fecha de renovación; conservar evidencia de la versión completa del consentimiento y de su aceptación.
3. Implementar un aviso transaccional durable y localizado, programado con al menos cinco días naturales de anticipación. Registrar destinatario, periodo, monto/fecha, aceptación del transporte y fallos; definir reintentos y supervisión. Una llamada SMTP aceptada no demuestra por sí sola lectura o entrega final.
4. Confirmar nombre legal, RFC y domicilio del responsable persona física. Publicar aviso de privacidad y términos con esos datos, finalidades, ARCO, proveedores, transferencias y retención reales.
5. Implementar el canal de reclamaciones dentro de Sonivo con folio, estado, historial y acceso alterno cuando el usuario no pueda entrar a su cuenta. Además, publicar los datos de contacto exigidos por la LFPC antes de contratar. Definir responsable y plazo de respuesta; no presentar la sección Help actual como canal de reclamaciones.
6. Obtener validación contable/fiscal de CFDI, IVA y conservación. Mantener comprobantes aparte de la purga de contenido.
7. Completar RLS financiero, lifecycle/purge idempotente, eliminación de archivos y prueba de tombstones tras restauración de respaldo.
8. Probar en Stripe sandbox un ciclo autenticado de compra, renovación, aviso, cancelación, webhook duplicado/fuera de orden y recuperación de pago; después obtener revisión legal/fiscal y autorización separada para Live.

## Decisiones necesarias del responsable

- Domicilio y RFC del responsable persona física; el titular ya confirmó su forma de operación y aportó su nombre, pero no se verificaron documentalmente.
- Datos fiscales que se solicitarán cuando el cliente pagador sea persona física o moral; asesoría debe definir cuándo la LFPC trata a una persona moral como consumidora.
- Domicilio físico y números telefónicos para publicar junto al canal de reclamaciones de Sonivo; “solo dentro de la plataforma” no cubre por sí solo la información exigida por LFPC.
- Responsable y tiempos del canal de reclamaciones dentro de Sonivo, además del acceso cuando la cuenta esté bloqueada o cerrada.
- Política y lenguaje contractual para fecha de cobro, cancelación y fin de acceso.
- Proceso real de CFDI, tratamiento de IVA y responsable fiscal.
- Plazos de conservación por categoría y quién autoriza solicitudes ARCO.

No se revisaron Estados Unidos ni Brasil; son mercados futuros y requieren una revisión separada antes de vender allí. Esta nota no certifica cumplimiento normativo.
