# Nexo Web

PWA para consultar una fuente M3U propia y abrir o copiar enlaces AceStream.

**Nexo Web no incluye ni proporciona listas, canales, enlaces ni contenido.**
El usuario configura la URL de una lista M3U propia o autorizada. La fuente se
guarda en `localStorage` y se usa en cada actualización.

Proyecto personal archivado. Sin soporte ni distribución de APK.

## Demo

GitHub Pages:

```
https://pu7073845.github.io/nexo-web/
```

## Funciones

- Configurar y cambiar la URL de la fuente M3U.
- Guardar la fuente y la última lista válida en `localStorage`.
- Botón de recarga para volver a descargar la fuente.
- Pestaña **Eventos**: tarjetas agrupadas por evento y hora.
- Pestaña **Canales**: canales sueltos agrupados por categoría, con buscador.
- Cada enlace ofrece **Abrir en Ace Stream** y **Copiar**.
- Aviso si falla la descarga; se mantiene la última lista válida.
- Diseño oscuro responsive, adaptado a móvil y escritorio.
- Manifest y service worker para instalarla como PWA por HTTPS.

## Primera ejecución

Al abrir la app sin una fuente configurada se muestra una pantalla para pegar la
URL de la lista M3U. Ejemplo de formato:

```
https://ejemplo.com/lista.m3u
```

La URL debe empezar por `http://` o `https://`. La app no trae ninguna fuente por
defecto.

## Limitaciones

- **CORS**: el navegador solo puede descargar la fuente si el servidor permite
  CORS. Si no lo permite, la app muestra un error y no puede saltarse esa
  restricción.
- **HTTPS**: si Nexo Web se sirve por HTTPS, la fuente debe usar HTTPS. Una URL
  HTTP se bloquea por contenido mixto.
- **Reproducción**: Nexo Web no reproduce vídeo. Solo abre el enlace
  `acestream://` en una app compatible o lo copia al portapapeles.
- **Disponibilidad**: la lista y los enlaces son de terceros y pueden dejar de
  funcionar.

## Horas

La app aplica un desfase de −6 horas a las horas de la lista de origen y asigna
el día correcto cuando la lista cruza medianoche. El valor está centralizado en
`js/time.js`:

```js
export const DISPLAY_OFFSET_HOURS = -6;
```

## Ejecutar en local

No hay build ni dependencias de producción. Solo necesitas Python 3 o cualquier
servidor estático:

```bash
cd nexo-web
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

También puedes usar:

```bash
npm run dev
```

## Usar desde el móvil

En la misma red Wi-Fi que el ordenador:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Averigua la IP local del ordenador y abre en el móvil:

```
http://IP_DEL_ORDENADOR:8080
```

Para instalar la PWA y tener service worker/offline completo se necesita HTTPS
o `localhost`.

## Tests

```bash
npm test
```

Los tests cubren:

- Validación de la URL de la fuente.
- Lectura de la cabecera `Last Updated`.
- Horas `6h00`, `0h00`, etc.
- Nombres con números y acentos.
- Canales con números.
- Banderas.
- Agrupación de fuentes por evento y cambio de día.
- Desfase de −6 horas y etiquetas `Hoy` / `Mañana`.

Comprobación de sintaxis:

```bash
npm run check
```

## Estructura

```
nexo-web/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js          # UI, fuente, pestañas, refresh y acciones
│   ├── parser.js       # parser M3U y agrupación de eventos
│   ├── source.js       # validación de la URL de la fuente
│   ├── time.js         # fechas, desfase −6 h y etiquetas
│   └── storage.js      # fuente y caché en localStorage
├── icons/              # iconos de la PWA
├── manifest.webmanifest
├── sw.js
├── tests/
│   ├── parser.test.js
│   ├── source.test.js
│   └── fixtures/tricky.m3u
├── LICENSE
├── DISCLAIMER.md
└── package.json
```

## Formato que interpreta

Cada entrada de la lista tiene esta forma:

```
#EXTINF:-1 group-title="Directos" tvg-logo="...",19h30 EQUIPO C vs EQUIPO D 2 CANAL 1 🇵🇹
acestream://36cad67fed5a739757a9db844a551aa845a8d51b
```

El parser obtiene:

- `19h30` → hora original.
- `EQUIPO C vs EQUIPO D` → nombre del evento.
- `2` → número de la fuente (no se muestra).
- `CANAL 1 🇵🇹` → nombre del canal/emisión.

Las entradas sin hora o sin `vs` se muestran en la pestaña **Canales**. La entrada
de agradecimiento `Thanks for upload...` se descarta porque no es una emisión real.

## Licencia y aviso legal

El código original de este repositorio está bajo licencia MIT. Consulta
[LICENSE](LICENSE).

Nexo Web no aloja ni distribuye contenido audiovisual y no está afiliado a
Ace Stream, emisoras, ligas o proveedores de contenido. El uso de fuentes y
enlaces de terceros es responsabilidad del usuario. Consulta
[DISCLAIMER.md](DISCLAIMER.md).
