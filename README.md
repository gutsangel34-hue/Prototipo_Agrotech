# AgroTech Guasca - Prototipo

Dashboard web de agricultura de precisión para fresa (Vereda La Trinidad, Sector San Francisco, Guasca).
**Todos los datos son simulados**: no hay sensores, servidor ni autenticación real.

## Cómo abrirlo
Doble clic en `index.html` (Chrome, Edge o Firefox actuales). No requiere instalación.
Funciona sin internet: Chart.js y los íconos están incluidos en el proyecto. Con internet
solo se cargan además las fuentes Geist; sin ellas se usa la fuente del sistema.

## Usuarios de prueba
| Rol | Usuario | Contraseña | Ve |
|---|---|---|---|
| Agricultor | `agricultor01` | `fresa2026` | Solo Parcela 01 |
| Agricultor | `agricultor02` | `fresa2026` | Solo Parcela 02 |
| Técnico | `tecnico01` | `agro2026` | Todas las parcelas + umbrales |

## Pantallas
| ID | Ruta | Pantalla |
|---|---|---|
| P01 | `#/login` | Inicio de sesión |
| P02 | `#/panel` | Dashboard (técnico: vista consolidada + detalle) |
| P03 | `#/recomendacion` | Recomendación de fertilización/riego |
| P04 | `#/historial` | Historial y gráficas |
| P05 | `#/parcela` | Perfil de la parcela |
| P06 | `#/umbrales` | Configuración de umbrales (solo técnico) |

## Archivos
- `js/data.js` - usuarios, parcelas, umbrales por defecto y generador de lecturas simuladas.
- `js/engine.js` - semáforo y motor de recomendaciones (RF03).
- `js/app.js` - navegación, pantallas, gráficas y simulación en tiempo real.
- `css/styles.css` - estilos (tokens de color para modo claro y oscuro).
- `js/vendor/chart.umd.min.js` - Chart.js 4.4.1 (licencia MIT), local para uso sin conexión.

## Dirección visual
Minimalismo utilitario pensado para leerse al sol desde el celular: fondo hueso, texto carbón,
bordes de 1 px y color solo con significado (verde, amarillo y rojo pastel para el estado del
cultivo; azul apagado para los datos). Sin gradientes ni sombras pesadas. Tipografía Geist,
íconos Phosphor (peso Bold, MIT) incrustados en `index.html`. En el celular la navegación es una
barra inferior de pestañas. Respeta el modo oscuro del sistema y la preferencia de movimiento reducido.

## Supuestos del prototipo
- Humedad ideal 40 a 60 %, N 25 a 45 ppm, P 15 a 30 ppm y K 20 a 40 ppm (solo el rango de pH 5,5 a 6,5 venía del proyecto). El técnico puede ajustarlos.
- Semáforo: verde = todo en rango; ámbar = alguna variable fuera por hasta el 25 % del ancho de su rango; rojo = más lejos.
- Las cantidades sugeridas (g de cal por 10 m², minutos de riego, g de abono por 10 plantas) salen de fórmulas ilustrativas y **no son agronómicamente validadas**.
- Llega una lectura nueva cada 5 s (acelerado para la demostración). El historial cubre los últimos 30 días, una lectura por hora.
- Las parcelas 02 y 03, los agricultores y las fechas de siembra son datos de prueba.
- Umbrales, recomendaciones marcadas como aplicadas y sesión se guardan en el navegador (`localStorage` / `sessionStorage`).
