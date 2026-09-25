import type { Asset, Clip, TextLayer } from "./types";
import { clamp } from "./types";

export interface CompositionData {
  clips: Clip[];
  texts: TextLayer[];
  duration: number;
  width: number;
  height: number;
}

const DRIFT_PLAYING = 0.22;
const DRIFT_PAUSED = 0.03;
const MIN_PLAY = 0.05;

/**
 * Owns every media element used by the timeline. Elements are created lazily,
 * kept in a hidden container, and their audio is routed through a WebAudio
 * graph so it can be monitored *and* recorded at the same time.
 */
export class MediaPool {
  private assets = new Map<string, Asset>();
  private elements = new Map<string, HTMLMediaElement>();
  private images = new Map<string, HTMLImageElement>();
  private container: HTMLDivElement | null = null;
  private audioCtx: AudioContext | null = null;
  private monitorGain: GainNode | null = null;
  private recordBus: MediaStreamAudioDestinationNode | null = null;
  private clipGains = new Map<string, GainNode>();
  private sources = new Map<string, MediaElementAudioSourceNode>();

  register(asset: Asset) {
    this.assets.set(asset.id, asset);
  }

  asset(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  unregister(id: string) {
    const el = this.elements.get(id);
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
    this.elements.delete(id);
    this.images.delete(id);
    this.assets.delete(id);
    this.clipGains.delete(id);
    this.sources.delete(id);
  }

  private ensureContainer(): HTMLDivElement {
    if (!this.container) {
      const div = document.createElement("div");
      div.setAttribute("data-opencut-media-pool", "");
      div.style.cssText =
        "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:-1;";
      document.body.appendChild(div);
      this.container = div;
    }
    return this.container;
  }

  /** Lazily build the audio graph. Must be called from a user gesture. */
  private ensureAudio(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const monitor = ctx.createGain();
    monitor.gain.value = 1;
    monitor.connect(ctx.destination);
    const bus = ctx.createMediaStreamDestination();
    this.audioCtx = ctx;
    this.monitorGain = monitor;
    this.recordBus = bus;
    return ctx;
  }

  resumeAudio() {
    const ctx = this.ensureAudio();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  audioTrack(): MediaStreamTrack | null {
    const ctx = this.ensureAudio();
    if (!ctx) return null;
    return this.recordBus?.stream.getAudioTracks()[0] ?? null;
  }

  setMonitor(level: number) {
    if (this.monitorGain) this.monitorGain.gain.value = clamp(level, 0, 2);
  }

  setClipGain(assetId: string, level: number) {
    if (!this.ensureAudio()) return;
    let gain = this.clipGains.get(assetId);
    if (!gain) {
      gain = this.audioCtx!.createGain();
      // clip volume feeds both the speakers and the recorder
      gain.connect(this.monitorGain!);
      gain.connect(this.recordBus!);
      this.clipGains.set(assetId, gain);
    }
    gain.gain.value = clamp(level, 0, 2);
  }

  private attachAudio(el: HTMLMediaElement, assetId: string) {
    const ctx = this.ensureAudio();
    if (!ctx || this.sources.has(assetId)) return;
    try {
      const source = ctx.createMediaElementSource(el);
      let gain = this.clipGains.get(assetId);
      if (!gain) {
        gain = ctx.createGain();
        gain.connect(this.monitorGain!);
        gain.connect(this.recordBus!);
        this.clipGains.set(assetId, gain);
      }
      source.connect(gain);
      this.sources.set(assetId, source);
    } catch {
      /* element already routed or unsupported */
    }
  }

  media(id: string): HTMLMediaElement | null {
    const asset = this.assets.get(id);
    if (!asset || asset.kind === "image") return null;
    const existing = this.elements.get(id);
    if (existing) return existing;

    const el: HTMLMediaElement =
      asset.kind === "audio"
        ? document.createElement("audio")
        : document.createElement("video");
    el.src = asset.url;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.muted = false;
    }
    this.ensureContainer().appendChild(el);
    this.elements.set(id, el);
    this.attachAudio(el, id);
    return el;
  }

  image(id: string): HTMLImageElement | null {
    const asset = this.assets.get(id);
    if (!asset || asset.kind !== "image") return null;
    const existing = this.images.get(id);
    if (existing) return existing;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = asset.url;
    this.images.set(id, img);
    return img;
  }

  pauseExcept(activeAssetIds: Set<string>) {
    for (const [id, el] of this.elements) {
      if (activeAssetIds.has(id)) continue;
      if (!el.paused) el.pause();
    }
  }

  pauseAll() {
    this.pauseExcept(new Set());
  }

  dispose() {
    this.pauseAll();
    for (const el of this.elements.values()) {
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
    this.elements.clear();
    this.images.clear();
    this.assets.clear();
    this.container?.remove();
    this.container = null;
    void this.audioCtx?.close();
    this.audioCtx = null;
  }
}

export interface ExportOptions {
  fps: number;
  mimeType: string;
  videoBitsPerSecond?: number;
}

/**
 * Timeline player + canvas renderer + MediaRecorder based exporter.
 * Rendering runs at real time: a 30s timeline takes ~30s to export.
 */
export class CompositionEngine {
  private ctx: CanvasRenderingContext2D;
  private data: CompositionData = {
    clips: [],
    texts: [],
    duration: 0,
    width: 1920,
    height: 1080,
  };
  private raf = 0;
  private lastTs = 0;
  private playingFlag = false;
  private activeClipByAsset = new Map<string, string>();
  private exporting = false;
  private cancelled = false;
  private recorder: MediaRecorder | null = null;

  time = 0;
  masterVolume = 1;
  muted = false;
  onTime?: (time: number) => void;
  onEnded?: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private pool: MediaPool,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas is not available in this browser");
    this.ctx = ctx;
  }

  get duration() {
    return this.data.duration;
  }

  get isPlaying() {
    return this.playingFlag;
  }

  get isExporting() {
    return this.exporting;
  }

  update(data: CompositionData) {
    if (
      data.width !== this.data.width ||
      data.height !== this.data.height
    ) {
      this.canvas.width = Math.max(2, Math.round(data.width));
      this.canvas.height = Math.max(2, Math.round(data.height));
    }
    this.data = data;
    if (this.time > data.duration) this.time = Math.max(0, data.duration);
    if (!this.playingFlag) this.draw();
  }

  seek(time: number) {
    this.time = clamp(time, 0, this.data.duration);
    this.activeClipByAsset.clear();
    if (!this.playingFlag) this.draw();
    this.onTime?.(this.time);
  }

  setAudio(volume: number, muted: boolean) {
    this.masterVolume = volume;
    this.muted = muted;
    this.pool.setMonitor(muted ? 0 : volume);
  }

  play() {
    if (this.playingFlag) return;
    if (this.time >= this.data.duration - 0.02) this.time = 0;
    this.playingFlag = true;
    this.activeClipByAsset.clear();
    this.pool.resumeAudio();
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  pause() {
    this.playingFlag = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pool.pauseAll();
    this.activeClipByAsset.clear();
  }

  dispose() {
    this.pause();
  }

  private loop = (ts: number) => {
    if (!this.playingFlag) return;
    const delta = Math.min(0.25, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.time += delta;
    if (this.time >= this.data.duration) {
      this.time = this.data.duration;
      this.draw();
      this.onTime?.(this.time);
      this.pause();
      this.onEnded?.();
      return;
    }
    this.draw();
    this.onTime?.(this.time);
    this.raf = requestAnimationFrame(this.loop);
  };

  private isActive(clip: Clip): boolean {
    return (
      this.time >= clip.start - 1e-4 &&
      this.time < clip.start + (clip.outPoint - clip.inPoint) / (clip.speed || 1)
    );
  }

  private sync(clip: Clip) {
    const el = this.pool.media(clip.assetId);
    if (!el) return;
    const expected =
      clip.inPoint + (this.time - clip.start) * (clip.speed || 1);
    el.playbackRate = clip.speed || 1;

    const seen = this.activeClipByAsset.get(clip.assetId);
    if (seen !== clip.id) {
      this.activeClipByAsset.set(clip.assetId, clip.id);
      try {
        el.currentTime = expected;
      } catch {
        /* not seekable yet */
      }
    }

    const drift = el.currentTime - expected;
    if (this.playingFlag) {
      if (Math.abs(drift) > DRIFT_PLAYING) {
        try {
          el.currentTime = expected;
        } catch {
          /* ignore */
        }
      }
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(drift) > DRIFT_PAUSED) {
        try {
          el.currentTime = expected;
        } catch {
          /* ignore */
        }
      }
    }
    this.pool.setClipGain(clip.assetId, this.muted ? 0 : clip.volume);
  }

  private drawMedia(
    source: HTMLVideoElement | HTMLImageElement,
    sw: number,
    sh: number,
    clip: Clip,
  ) {
    const { width: W, height: H } = this.data;
    if (!sw || !sh) return;
    const scale = Math.min(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    const parts = [
      `brightness(${clip.brightness})`,
      `contrast(${clip.contrast})`,
      `saturate(${clip.saturate})`,
    ];
    if (clip.blur > 0) parts.push(`blur(${clip.blur}px)`);
    this.ctx.filter = parts.join(" ");
    this.ctx.drawImage(source, dx, dy, dw, dh);
    this.ctx.filter = "none";
  }

  private drawText(layer: TextLayer) {
    const { width: W, height: H } = this.data;
    const scale = W / 1920;
    const lines = layer.text.split("\n");
    const fontSize = Math.max(8, layer.size * scale);
    this.ctx.filter = "none";
    this.ctx.font = `${layer.bold ? "700" : "500"} ${fontSize}px "Inter Variable", Inter, system-ui, sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const x = layer.x * W;
    const y = layer.y * H;
    const lineHeight = fontSize * 1.25;
    const widths = lines.map((line) => this.ctx.measureText(line).width);
    const boxWidth = Math.max(...widths, 0);
    const boxHeight = lineHeight * lines.length;

    if (layer.background) {
      const padX = fontSize * 0.5;
      const padY = fontSize * 0.35;
      this.ctx.fillStyle = "rgba(0,0,0,0.55)";
      const bx = x - boxWidth / 2 - padX;
      const by = y - boxHeight / 2 - padY;
      const bw = boxWidth + padX * 2;
      const bh = boxHeight + padY * 2;
      const r = fontSize * 0.25;
      this.ctx.beginPath();
      this.ctx.roundRect(bx, by, bw, bh, r);
      this.ctx.fill();
    }

    this.ctx.fillStyle = layer.color;
    lines.forEach((line, index) => {
      const ly = y - boxHeight / 2 + lineHeight * (index + 0.5);
      this.ctx.fillText(line, x, ly);
    });
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
  }

  draw() {
    const { clips, texts, width: W, height: H } = this.data;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const activeAssetIds = new Set<string>();

    let visual: Clip | null = null;
    for (const clip of clips) {
      if (clip.track !== 0) continue;
      if (!this.isActive(clip)) continue;
      if (!visual || clip.start >= visual.start) visual = clip;
    }

    if (visual) {
      activeAssetIds.add(visual.assetId);
      const asset = this.pool.asset(visual.assetId);
      if (asset) {
        if (asset.kind === "image") {
          const img = this.pool.image(asset.id);
          if (img?.complete && img.naturalWidth) {
            this.drawMedia(img, img.naturalWidth, img.naturalHeight, visual);
          }
        } else {
          this.sync(visual);
          const el = this.pool.media(asset.id) as HTMLVideoElement | null;
          if (el && el.readyState >= 2 && el.videoWidth) {
            this.drawMedia(el, el.videoWidth, el.videoHeight, visual);
          }
        }
      }
    }

    for (const clip of clips) {
      if (clip.track !== 1) continue;
      if (!this.isActive(clip)) continue;
      activeAssetIds.add(clip.assetId);
      this.sync(clip);
    }

    this.pool.pauseExcept(activeAssetIds);

    for (const layer of texts) {
      if (this.time >= layer.start && this.time < layer.end) {
        this.drawText(layer);
      }
    }
  }

  async export(options: ExportOptions): Promise<Blob> {
    if (this.exporting) throw new Error("An export is already running");
    if (this.data.duration <= MIN_PLAY) {
      throw new Error("Timeline is empty — add a clip before exporting");
    }
    this.exporting = true;
    this.cancelled = false;
    this.pool.resumeAudio();

    const stream = this.canvas.captureStream(options.fps);
    const audio = this.pool.audioTrack();
    if (audio) stream.addTrack(audio);

    const recorder = new MediaRecorder(stream, {
      mimeType: options.mimeType,
      ...(options.videoBitsPerSecond
        ? { videoBitsPerSecond: options.videoBitsPerSecond }
        : {}),
    });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    this.recorder = recorder;
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("stop", () => {
        this.exporting = false;
        if (this.recorder === recorder) this.recorder = null;
        if (this.cancelled) {
          reject(new Error("Export cancelled"));
          return;
        }
        for (const track of stream.getTracks()) {
          if (track.kind === "audio" && track === audio) continue;
          track.stop();
        }
        resolve(new Blob(chunks, { type: options.mimeType }));
      });
      recorder.addEventListener("error", () => {
        this.exporting = false;
        reject(new Error("Recording failed"));
      });
    });

    const previousEnded = this.onEnded;
    this.onEnded = () => {
      this.onEnded = previousEnded;
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 350);
    };

    this.seek(0);
    recorder.start(250);
    this.play();
    return finished;
  }

  cancelExport() {
    this.cancelled = true;
    this.onEnded = undefined;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    this.pause();
    this.exporting = false;
  }
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(prefer: "mp4" | "webm"): string | null {
  const ordered = prefer === "mp4" ? MIME_CANDIDATES : [...MIME_CANDIDATES].reverse();
  for (const candidate of ordered) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

export function extensionFor(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}
