# Editor prototype

A working, browser-only video editor mounted at `/editor`. Nothing is uploaded —
every file stays in the tab and is decoded locally.

```
routes/editor.tsx                     → renders <VideoEditor /> (ssr: false)
components/editor/
  video-editor.tsx                    → app shell, state, import, export, shortcuts
  timeline.tsx                        → ruler, video / audio / text lanes, dragging, trimming
  inspector.tsx                       → selected clip & text properties
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
- **Text overlays**: content, size, colour, bold, background box, drag-to-position on the
  preview, and their own start/end on the timeline.
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

## Tests

```sh
bun run test   # vitest run --config vitest.config.ts
```
