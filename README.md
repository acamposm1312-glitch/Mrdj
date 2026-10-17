# MrDj 🎧

Consola de DJ profesional para iPhone, iPad, Android y web. Hecha con Expo / React Native.

Todo funciona **en el teléfono**: sin servidor, sin API de pago y sin costos mensuales.

## Funciones

| Área | Incluye |
|---|---|
| **Decks** | 2 o 4 decks (capas A/C y B/D), jog wheel táctil (scratch en modo vinilo, pitch bend en el anillo), CUE estilo CDJ, play/pausa, búsqueda tocando la forma de onda |
| **Tempo** | Pitch fader ±6/10/16/50 %, key lock (tempo sin cambiar el tono), reset, tap tempo, BPM ÷2 / ×2, ajuste de beat grid |
| **Sync** | SYNC de tempo y fase, deck MASTER, half/double time automático (87 ↔ 174) |
| **Cues y loops** | 8 hot cues por pista (se guardan), quantize, auto-loop 1–8 beats, ÷2 / ×2, loop manual IN/OUT, reloop, beat jump |
| **Mixer** | Gain, EQ de 3 bandas con kill, filtro HPF/LPF con resonancia, fader de canal, VU meters, crossfader suave o de corte (scratch), asignación A/THRU/B, master con limitador |
| **Efectos** | Eco, reverb, flanger, filtro con LFO y bitcrusher, sincronizados al beat (¼ a 4), con dry/wet |
| **Pre-escucha** | CUE por canal y *split cue*: master por la izquierda y pre-escucha por la derecha (con un cable divisor), mezcla CUE/MST |
| **Análisis** | BPM, beat grid, tonalidad (notación Camelot), forma de onda a color (graves / medios / agudos), sugerencia armónica |
| **Biblioteca** | Importa MP3/WAV/AAC/FLAC, búsqueda por título, artista, BPM o tono, listas |
| **Spotify** | Importa tus playlists y "Canciones que te gustan" como listas y las cruza con tus archivos |
| **Grabación** | Graba la mezcla del master y la comparte (WAV en móvil, WebM en web) |
| **MIDI** | MIDI learn para cualquier controladora: USB y Bluetooth en iPhone/iPad (CoreMIDI), USB en Android y Web MIDI en Chrome/Edge (PC) |
| **Idiomas** | Español (por defecto) e inglés |
| **Pantalla** | Vertical y horizontal, teléfono, tablet y PC; vista 3D tipo controladora sobre la mesa |
| **PC** | Atajos de teclado e instalable como app desde Chrome/Edge (PWA, funciona sin conexión) |

### ¿Por qué Spotify solo importa listas?
Los términos de Spotify para desarrolladores prohíben mezclar su audio en apps de DJ. Además, su SDK móvil no entrega el audio a la app. Por eso MrDj usa Spotify solo para **leer tus playlists** (título y artista) y las vincula con los archivos de tu biblioteca. Las canciones que no tengas aparecen como "Falta archivo" y puedes vincularlas con el botón *Vincular archivo*.

**Configurar Spotify (gratis):**
1. Entra a <https://developer.spotify.com/dashboard> → *Create app*.
2. En *Redirect URIs* agrega `mrdj://spotify-auth` (y para web `http://localhost:8081/spotify-auth`).
3. Copia el *Client ID* en MrDj → Ajustes → Spotify.

## Desarrollo

```bash
npm install
npm test              # pruebas del análisis de BPM y tonalidad
npm run typecheck
npx expo start --web  # probar en el navegador
```

El motor de audio (`react-native-audio-api`) es código nativo y **no funciona en Expo Go**. Para probar en el teléfono hace falta un *development build*:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # o ios
npx expo start --dev-client
```

## Atajos de teclado (PC)

| Deck izquierdo | Deck derecho | Acción |
|---|---|---|
| Z | M | CUE |
| X | , | PLAY / PAUSA |
| C | . | SYNC |
| 1-4 | 7-0 | Hot cues 1-4 |
| A | J | Loop 4 beats |
| S / D | K / L | Loop ÷2 / ×2 |
| Q / W | O / P | Nudge − / + |
| ← → ↓ | | Crossfader (↓ centra) |

## Versión de prueba en el teléfono (EAS)

1. Crea una cuenta gratis en <https://expo.dev> y un proyecto llamado `mrdj`.
2. En el proyecto: *Settings → GitHub* → conecta el repositorio `Mrdj`.
3. Agrega en `app.json` → `expo.extra.eas.projectId` el ID del proyecto y `expo.owner` con tu usuario de Expo.
4. Android (APK instalable directo): perfil `preview`. iPhone: necesita una cuenta de Apple Developer.

## Versión web / PC

`vercel.json` ya está listo: al importar el repositorio en Vercel se compila con `npx expo export --platform web` y se publica `dist/`.

## Publicar (cuando llegue el momento)

1. Cuentas: Apple Developer (USD 99 al año) y Google Play Console (USD 25, pago único).
2. Cambia `ios.bundleIdentifier` y `android.package` en `app.json` si quieres otro identificador (hoy `cl.mrdj.app`).
3. `npx eas-cli@latest build --profile production --platform all`
4. `npx eas-cli@latest submit --platform ios` / `--platform android`

Para cobrar más adelante, la opción recomendada es RevenueCat (`react-native-purchases`) con un plan *freemium*.

## Estructura

```
src/
  app/            pantallas (expo-router): consola, ajustes, Spotify
  audio/          motor: Deck, MixerEngine, efectos, análisis BPM/tono, grabadora
  library/        biblioteca, almacenamiento (archivos nativos / IndexedDB en web)
  spotify/        OAuth PKCE + lectura de playlists + cruce con archivos
  midi/           MIDI learn compartido (core) + entrada web y nativa
modules/mrdj-midi/  módulo nativo MIDI (Swift CoreMIDI / Kotlin android.media.midi)
public/         index.html, manifest y service worker de la PWA
  ui/             decks, mixer, jog wheel, formas de onda, controles táctiles
  i18n/           español / inglés
test/             pruebas del análisis
```
