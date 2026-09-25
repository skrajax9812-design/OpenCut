import {
	type Clip,
	type MotionId,
	type TextAnimId,
	type TextLayer,
	type TextLoopId,
	type TransitionId,
	clamp,
	clipDuration,
} from "./types";

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

interface FrameState {
	alpha: number;
	dx: number;
	dy: number;
	scale: number;
	blur: number;
	rotate: number;
	/** null = no wipe, otherwise -1..1 reveal progress */
	wipe: number | null;
}

const NEUTRAL: FrameState = {
	alpha: 1,
	dx: 0,
	dy: 0,
	scale: 1,
	blur: 0,
	rotate: 0,
	wipe: null,
};

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const backOut = (p: number) => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/**
 * Owns every media element used by the timeline. Elements are created lazily,
 * kept in a hidden container, and their audio is routed through a WebAudio
 * graph so it can be monitored *and* recorded at the same time.
 */
export class MediaPool {
	private assets = new Map<string, { url: string; kind: string }>();
	private elements = new Map<string, HTMLMediaElement>();
	private images = new Map<string, HTMLImageElement>();
	private container: HTMLDivElement | null = null;
	private audioCtx: AudioContext | null = null;
	private monitorGain: GainNode | null = null;
	private recordBus: MediaStreamAudioDestinationNode | null = null;
	private clipGains = new Map<string, GainNode>();
	private sources = new Map<string, MediaElementAudioSourceNode>();

	register(asset: { id: string; url: string; kind: string }) {
		this.assets.set(asset.id, asset);
	}

	asset(id: string) {
		return this.assets.get(id);
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
	private grain: CanvasPattern | null = null;

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
		if (data.width !== this.data.width || data.height !== this.data.height) {
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

	// ── media sync ─────────────────────────────────────────────────────────

	private sync(clip: Clip, localOverride?: number) {
		const el = this.pool.media(clip.assetId);
		if (!el) return;
		const length = clipDuration(clip);
		const local = clamp(localOverride ?? this.time - clip.start, 0, length);
		const expected = clip.inPoint + local * (clip.speed || 1);
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

		// volume + fade in / fade out
		let gain = clip.volume;
		if (clip.audioFadeIn > 0 && local < clip.audioFadeIn) {
			gain *= clamp(local / clip.audioFadeIn, 0, 1);
		}
		const remaining = length - local;
		if (clip.audioFadeOut > 0 && remaining < clip.audioFadeOut) {
			gain *= clamp(remaining / clip.audioFadeOut, 0, 1);
		}
		this.pool.setClipGain(clip.assetId, this.muted ? 0 : gain);
	}

	// ── effects helpers ────────────────────────────────────────────────────

	private transitionState(
		clip: Clip,
		local: number,
		length: number,
		W: number,
		H: number,
	): FrameState {
		const state: FrameState = { ...NEUTRAL };
		const tin = clip.transitionIn;
		if (
			tin &&
			tin.type !== "none" &&
			tin.duration > 0 &&
			local < tin.duration
		) {
			this.applyTransition(
				state,
				tin.type,
				clamp(local / tin.duration, 0, 1),
				W,
				H,
			);
		}
		const remaining = length - local;
		const tout = clip.transitionOut;
		if (
			tout &&
			tout.type !== "none" &&
			tout.duration > 0 &&
			remaining < tout.duration
		) {
			this.applyTransition(
				state,
				tout.type,
				clamp(remaining / tout.duration, 0, 1),
				W,
				H,
			);
		}
		return state;
	}

	/** p: 0 = fully "away", 1 = fully visible */
	private applyTransition(
		state: FrameState,
		type: TransitionId,
		p: number,
		W: number,
		H: number,
	) {
		const eased = easeOutCubic(p);
		switch (type) {
			case "fade":
				state.alpha *= eased;
				break;
			case "crossfade":
				// handled by the compositor (the outgoing clip is drawn underneath)
				break;
			case "slide-left":
				state.dx += -W * (1 - eased);
				break;
			case "slide-right":
				state.dx += W * (1 - eased);
				break;
			case "slide-up":
				state.dy += H * (1 - eased);
				break;
			case "slide-down":
				state.dy += -H * (1 - eased);
				break;
			case "zoom-in":
				state.scale *= 0.55 + 0.45 * eased;
				state.alpha *= Math.min(1, p * 1.6);
				break;
			case "zoom-out":
				state.scale *= 1.5 - 0.5 * eased;
				state.alpha *= Math.min(1, p * 1.6);
				break;
			case "blur":
				state.blur += 16 * (1 - eased);
				state.alpha *= Math.min(1, p * 1.8);
				break;
			case "wipe-right":
				state.wipe = eased;
				break;
			case "wipe-left":
				state.wipe = -eased;
				break;
			default:
				break;
		}
	}

	private motion(clip: Clip, progress: number, W: number, H: number) {
		if (clip.motion === "none") return { scale: 1, dx: 0, dy: 0 };
		const p = clamp(progress, 0, 1);
		const spanX = 0.12 * W;
		const spanY = 0.12 * H;
		switch (clip.motion satisfies MotionId) {
			case "zoom-in":
				return { scale: 1 + 0.18 * p, dx: 0, dy: 0 };
			case "zoom-out":
				return { scale: 1.18 - 0.18 * p, dx: 0, dy: 0 };
			case "pan-left":
				return { scale: 1.06, dx: (0.5 - p) * spanX, dy: 0 };
			case "pan-right":
				return { scale: 1.06, dx: -(0.5 - p) * spanX, dy: 0 };
			case "pan-up":
				return { scale: 1.06, dx: 0, dy: (0.5 - p) * spanY };
			case "pan-down":
				return { scale: 1.06, dx: 0, dy: -(0.5 - p) * spanY };
			default:
				return { scale: 1, dx: 0, dy: 0 };
		}
	}

	private animState(
		type: TextAnimId,
		p: number,
		W: number,
		H: number,
	): FrameState {
		const state: FrameState = { ...NEUTRAL };
		if (type === "none") return state;
		const eased = easeOutCubic(p);
		switch (type) {
			case "fade":
				state.alpha = eased;
				break;
			case "slide-up":
				state.dy = H * 0.25 * (1 - eased);
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "slide-down":
				state.dy = -H * 0.25 * (1 - eased);
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "slide-left":
				state.dx = -W * 0.3 * (1 - eased);
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "slide-right":
				state.dx = W * 0.3 * (1 - eased);
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "zoom-in":
				state.scale = 0.45 + 0.55 * eased;
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "zoom-out":
				state.scale = 1.7 - 0.7 * eased;
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "pop":
				state.scale = 0.3 + 0.7 * backOut(p);
				state.alpha = Math.min(1, p * 2);
				break;
			case "blur":
				state.blur = 18 * (1 - eased);
				state.alpha = Math.min(1, p * 1.4);
				break;
			case "spin":
				state.rotate = (1 - eased) * -Math.PI;
				state.scale = 0.6 + 0.4 * eased;
				state.alpha = Math.min(1, p * 1.6);
				break;
			case "drop":
				state.dy = -H * 0.6 * (1 - eased);
				state.alpha = Math.min(1, p * 1.4);
				break;
			default:
				break;
		}
		return state;
	}

	private loopState(
		type: TextLoopId,
		local: number,
		W: number,
		H: number,
	): FrameState {
		const state: FrameState = { ...NEUTRAL };
		if (type === "none") return state;
		const phase = local * Math.PI * 2;
		switch (type) {
			case "pulse":
				state.scale = 1 + 0.055 * Math.sin(phase);
				break;
			case "bounce":
				state.dy = -Math.abs(Math.sin(phase)) * H * 0.045;
				break;
			case "shake":
				state.dx = Math.sin(local * Math.PI * 7) * W * 0.008;
				break;
			case "blink":
				state.alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase));
				break;
			case "heartbeat":
				state.scale = 1 + 0.08 * Math.max(0, Math.sin(phase)) ** 4;
				break;
			case "swing":
				state.rotate = ((Math.sin(phase) * 5) / 180) * Math.PI;
				break;
			default:
				break;
		}
		return state;
	}

	private grainPattern(): CanvasPattern | null {
		if (this.grain) return this.grain;
		try {
			const size = 128;
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			const image = ctx.createImageData(size, size);
			for (let i = 0; i < image.data.length; i += 4) {
				const value = 90 + Math.random() * 76;
				image.data[i] = value;
				image.data[i + 1] = value;
				image.data[i + 2] = value;
				image.data[i + 3] = 255;
			}
			ctx.putImageData(image, 0, 0);
			this.grain = this.ctx.createPattern(canvas, "repeat");
			return this.grain;
		} catch {
			return null;
		}
	}

	// ── drawing ────────────────────────────────────────────────────────────

	private filterString(clip: Clip, extraBlur: number): string {
		const parts = [
			`brightness(${clip.brightness})`,
			`contrast(${clip.contrast})`,
			`saturate(${clip.saturate})`,
		];
		if (clip.hue) parts.push(`hue-rotate(${clip.hue}deg)`);
		if (clip.sepia > 0) parts.push(`sepia(${clip.sepia})`);
		if (clip.grayscale > 0) parts.push(`grayscale(${clip.grayscale})`);
		if (clip.invert > 0) parts.push(`invert(${clip.invert})`);
		const blur = clip.blur + extraBlur;
		if (blur > 0) parts.push(`blur(${blur}px)`);
		return parts.join(" ");
	}

	private drawClip(
		clip: Clip,
		W: number,
		H: number,
		localOverride?: number,
		alphaOverride?: number,
	) {
		const asset = this.pool.asset(clip.assetId);
		if (!asset) return;

		let source: CanvasImageSource | null = null;
		let sw = 0;
		let sh = 0;
		if (asset.kind === "image") {
			const img = this.pool.image(clip.assetId);
			if (img?.complete && img.naturalWidth) {
				source = img;
				sw = img.naturalWidth;
				sh = img.naturalHeight;
			}
		} else {
			this.sync(clip, localOverride);
			const el = this.pool.media(clip.assetId) as HTMLVideoElement | null;
			if (el && el.readyState >= 2 && el.videoWidth) {
				source = el;
				sw = el.videoWidth;
				sh = el.videoHeight;
			}
		}
		if (!source || !sw || !sh) return;

		const length = clipDuration(clip);
		const local = clamp(localOverride ?? this.time - clip.start, 0, length);
		const progress = length > 0 ? local / length : 0;
		const transition = this.transitionState(clip, local, length, W, H);
		const motion = this.motion(clip, progress, W, H);

		const rotated = clip.rotate === 90 || clip.rotate === 270;
		const fit = rotated ? Math.min(W / sh, H / sw) : Math.min(W / sw, H / sh);
		const baseW = sw * fit;
		const baseH = sh * fit;
		const scale = clip.scale * motion.scale * transition.scale;
		const dx = clip.offsetX * W + motion.dx + transition.dx;
		const dy = clip.offsetY * H + motion.dy + transition.dy;
		const alpha = clamp(
			clip.opacity * transition.alpha * (alphaOverride ?? 1),
			0,
			1,
		);
		if (alpha <= 0.002) return;

		const ctx = this.ctx;
		ctx.save();
		ctx.globalAlpha = alpha;
		if (transition.wipe !== null) {
			const width = Math.abs(transition.wipe) * W;
			ctx.beginPath();
			if (transition.wipe >= 0) ctx.rect(0, 0, width, H);
			else ctx.rect(W - width, 0, width, H);
			ctx.clip();
		}
		ctx.filter = this.filterString(clip, transition.blur);
		ctx.translate(W / 2 + dx, H / 2 + dy);
		ctx.rotate((clip.rotate * Math.PI) / 180 + transition.rotate);
		ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
		ctx.drawImage(
			source,
			(-baseW * scale) / 2,
			(-baseH * scale) / 2,
			baseW * scale,
			baseH * scale,
		);
		ctx.restore();

		this.drawOverlays(clip, W, H, alpha);
	}

	private drawOverlays(clip: Clip, W: number, H: number, alpha: number) {
		const ctx = this.ctx;
		if (clip.tint) {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.globalCompositeOperation = "soft-light";
			ctx.fillStyle = clip.tint;
			ctx.fillRect(0, 0, W, H);
			ctx.restore();
		}
		if (clip.vignette > 0) {
			ctx.save();
			ctx.globalAlpha = alpha;
			const radius = Math.max(W, H) * 0.78;
			const gradient = ctx.createRadialGradient(
				W / 2,
				H / 2,
				radius * 0.32,
				W / 2,
				H / 2,
				radius,
			);
			gradient.addColorStop(0, "rgba(0,0,0,0)");
			gradient.addColorStop(1, `rgba(0,0,0,${clamp(clip.vignette, 0, 1)})`);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, W, H);
			ctx.restore();
		}
		if (clip.grain > 0) {
			const pattern = this.grainPattern();
			if (pattern) {
				ctx.save();
				ctx.globalAlpha = clamp(clip.grain, 0, 1) * 0.16 * alpha;
				ctx.globalCompositeOperation = "overlay";
				ctx.fillStyle = pattern;
				ctx.fillRect(0, 0, W, H);
				ctx.restore();
			}
		}
	}

	private drawTextLayer(layer: TextLayer) {
		const { width: W, height: H } = this.data;
		const ctx = this.ctx;
		const scale = W / 1920;
		const length = Math.max(0.01, layer.end - layer.start);
		const local = clamp(this.time - layer.start, 0, length);

		const inDuration =
			layer.animIn !== "none" ? clamp(layer.animInDuration, 0.05, length) : 0;
		const outDuration =
			layer.animOut !== "none" ? clamp(layer.animOutDuration, 0.05, length) : 0;
		const inP = inDuration > 0 ? clamp(local / inDuration, 0, 1) : 1;
		const outP =
			outDuration > 0 ? clamp((length - local) / outDuration, 0, 1) : 1;

		const enter = this.animState(layer.animIn, inP, W, H);
		const exit = this.animState(layer.animOut, outP, W, H);
		const loop = this.loopState(layer.loop, local, W, H);

		const alpha = enter.alpha * exit.alpha * loop.alpha;
		if (alpha <= 0.002) return;

		const dx = enter.dx + exit.dx + loop.dx;
		const dy = enter.dy + exit.dy + loop.dy;
		const size = enter.scale * exit.scale * loop.scale;
		const rotation =
			(layer.rotation * Math.PI) / 180 +
			enter.rotate +
			exit.rotate +
			loop.rotate;
		const blur = enter.blur + exit.blur;

		const fontSize = Math.max(8, layer.size * scale);
		const lines = layer.text.split("\n");
		ctx.save();
		ctx.globalAlpha = clamp(alpha, 0, 1);
		if (blur > 0) ctx.filter = `blur(${blur}px)`;
		ctx.translate(layer.x * W + dx, layer.y * H + dy);
		ctx.rotate(rotation);
		ctx.scale(size, size);
		ctx.font = `${layer.bold ? "700" : "500"} ${fontSize}px "Inter Variable", Inter, system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const lineHeight = fontSize * 1.25;
		const boxWidth = Math.max(
			...lines.map((line) => ctx.measureText(line).width),
			0,
		);
		const boxHeight = lineHeight * lines.length;

		if (layer.background) {
			const padX = fontSize * 0.5;
			const padY = fontSize * 0.35;
			ctx.fillStyle = "rgba(0,0,0,0.55)";
			ctx.beginPath();
			ctx.roundRect(
				-boxWidth / 2 - padX,
				-boxHeight / 2 - padY,
				boxWidth + padX * 2,
				boxHeight + padY * 2,
				fontSize * 0.25,
			);
			ctx.fill();
		}

		if (layer.shadow) {
			ctx.shadowColor = "rgba(0,0,0,0.65)";
			ctx.shadowBlur = fontSize * 0.35;
			ctx.shadowOffsetY = fontSize * 0.08;
		}

		lines.forEach((line, index) => {
			const lineY = -boxHeight / 2 + lineHeight * (index + 0.5);
			if (layer.stroke > 0) {
				ctx.lineWidth = layer.stroke * scale * 2;
				ctx.strokeStyle = layer.strokeColor;
				ctx.lineJoin = "round";
				ctx.strokeText(line, 0, lineY);
			}
			ctx.fillStyle = layer.color;
			ctx.fillText(line, 0, lineY);
		});
		ctx.restore();
	}

	draw() {
		const { clips, texts, width: W, height: H } = this.data;
		const ctx = this.ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.filter = "none";
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, W, H);

		const activeAssetIds = new Set<string>();
		const visual = clips
			.filter((clip) => clip.track === 0)
			.sort((a, b) => a.start - b.start);

		let current: Clip | null = null;
		let index = -1;
		for (let i = 0; i < visual.length; i += 1) {
			const clip = visual[i];
			if (
				this.time >= clip.start - 1e-4 &&
				this.time < clip.start + clipDuration(clip)
			) {
				current = clip;
				index = i;
			}
		}

		if (current) {
			activeAssetIds.add(current.assetId);
			const local = this.time - current.start;
			const tin = current.transitionIn;
			const previous = index > 0 ? visual[index - 1] : null;
			const canCrossfade =
				tin?.type === "crossfade" &&
				previous &&
				tin.duration > 0 &&
				local < tin.duration &&
				previous.assetId !== current.assetId;

			if (canCrossfade && previous) {
				const previousLength = clipDuration(previous);
				const remaining = tin.duration - local;
				const previousLocal = Math.max(0, previousLength - remaining);
				activeAssetIds.add(previous.assetId);
				this.drawClip(previous, W, H, previousLocal, 1);
				this.drawClip(
					current,
					W,
					H,
					undefined,
					clamp(local / tin.duration, 0, 1),
				);
			} else if (
				tin?.type === "crossfade" &&
				tin.duration > 0 &&
				local < tin.duration
			) {
				this.drawClip(
					current,
					W,
					H,
					undefined,
					clamp(local / tin.duration, 0, 1),
				);
			} else {
				this.drawClip(current, W, H);
			}
		}

		for (const clip of clips) {
			if (clip.track !== 1) continue;
			if (
				this.time < clip.start ||
				this.time >= clip.start + clipDuration(clip)
			) {
				continue;
			}
			activeAssetIds.add(clip.assetId);
			this.sync(clip);
		}

		this.pool.pauseExcept(activeAssetIds);

		for (const layer of texts) {
			if (this.time >= layer.start && this.time < layer.end) {
				this.drawTextLayer(layer);
			}
		}

		ctx.globalAlpha = 1;
		ctx.filter = "none";
		ctx.globalCompositeOperation = "source-over";
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
		this.recorder = recorder;
		const chunks: Blob[] = [];
		recorder.addEventListener("dataavailable", (event) => {
			if (event.data && event.data.size > 0) chunks.push(event.data);
		});

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
	const ordered =
		prefer === "mp4" ? MIME_CANDIDATES : [...MIME_CANDIDATES].reverse();
	for (const candidate of ordered) {
		if (MediaRecorder.isTypeSupported(candidate)) return candidate;
	}
	return null;
}

export function extensionFor(mimeType: string): string {
	return mimeType.includes("mp4") ? "mp4" : "webm";
}
