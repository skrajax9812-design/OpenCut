# Editor prototype

A working, browser-only video editor mounted at `/editor`. Nothing is uploaded —
every file stays in the tab and is decoded locally.

```
routes/editor.tsx                     → renders <VideoEditor /> (ssr: false)
components/editor/
  video-editor.tsx                    → app shell, state, import, export, shortcuts
  timeline.tsx                        → ruler, video / audio / text lanes, dragging, trimming
  inspector.tsx                       → dispatches to the clip or text inspector
  clip-inspector.tsx                  → filters, transform, motion, transitions, audio
  text-inspector.tsx                  → text style, in/out animations, loop animations
  inspector-parts.tsx                 → Section / Field / Choices building blocks
  engine.ts                           → MediaPool (media elements + WebAudio graph) and
                                        CompositionEngine (canvas renderer, playback, export)
  types.ts                            → Asset / Clip / TextLayer models
```

## What it can do

- **Import** video, audio and image files (click or drag & drop) — each one becomes an
  asset plus a clip on the matching lane.
- **Trim** by dragging a clip's edges, **move** clips along the timeline, **split** at the
  playhead (`S`), **duplicate**, **delete** (`Del`), **undo** (`Ctrl/Cmd + Z`).
- **Per-clip controls**: speed (0.25x–3x), volume, brightness, contrast, saturation, blur,
  and numeric in/out points.
- **Filters & effects**: 11 presets (Vivid, Mono, Noir, Fade, Cool, Warm, Vintage, Cyber,
  Dramatic, Dreamy) plus sliders for brightness, contrast, saturation, temperature, blur,
  sepia, black & white, invert, vignette and film grain.
- **Transform & motion**: zoom, move, rotate (0/90/180/270), flip H/V, opacity and
  Ken Burns style motion (zoom in/out, pan in four directions).
- **Transitions**: fade, crossfade, slide, zoom, blur and wipe — separate in/out types with
  their own durations. Crossfade composites the outgoing clip underneath the incoming one.
- **Text overlays**: content, size, colour, bold, box, shadow, outline, rotation,
  drag-to-position, 12 in/out animations (fade, slide, zoom, pop, blur, spin, drop) and
  7 loop animations (pulse, bounce, shake, blink, heartbeat, swing).
- **Audio**: per-clip volume plus fade-in / fade-out ramps driven by the WebAudio graph.
- **Audio** is routed through a WebAudio graph so it is monitored through the speakers *and*
  captured by the recorder.
- **Export** with `MediaRecorder` (MP4 or WebM, 24/30/60 fps, 5–48 Mbps) at the composition's
  native resolution.

Shortcuts: `Space` play/pause · `←/→` step a frame (`Shift` = one second) · `Home/End` ·
`S` split · `Del` delete · `Ctrl/Cmd + Z` undo.

## Known limitations

- Export runs in **real time** (a 60s timeline takes ~60s) because it records the preview
  canvas. Keep the tab visible and focused while it runs, otherwise `requestAnimationFrame`
  gets throttled and the export stalls.
- MP4 recording depends on the browser (`MediaRecorder.isTypeSupported`); WebM is the
  fallback and Safari may not record at all.
- Only one visual clip is composited at a time — crossfades/transitions and picture-in-picture
  need the Rust renderer that the rewrite is heading towards.
- Rendering the composition is CPU bound in the browser tab; 4K sources are downscaled to
  1920px on the long edge for the canvas.

## Single-file offline build

```sh
bun run build:standalone   # → standalone/editor.html
```

Produces one self-contained `editor.html` (~780 kB, JS + CSS inlined). Double-click it or
open it with `file://` in Chrome/Edge — no server, no sandbox token, no uploads. Handy for
testing on a real machine or sharing the prototype; rebuild after changing the source.

## Layout

The shell measures itself with a `ResizeObserver`. Below ~1180px the effects panel and below
~980px the media panel float over the preview instead of being hidden, so every control stays
reachable in a narrow frame. `Media` / `Fx` toggle them, `Focus` hides both, and the timeline
height tracks the viewport height.

## Tests

```sh
bun run test   # vitest run --config vitest.config.ts
```
