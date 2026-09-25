export type AssetKind = "video" | "audio" | "image";

export interface Asset {
	id: string;
	name: string;
	kind: AssetKind;
	url: string;
	/** duration in seconds (images get a default clip length) */
	duration: number;
	width: number;
	height: number;
	size: number;
	thumbnail?: string;
}

export type FilterPresetId =
	| "custom"
	| "original"
	| "vivid"
	| "mono"
	| "noir"
	| "fade"
	| "cool"
	| "warm"
	| "vintage"
	| "cyberpunk"
	| "dramatic"
	| "dreamy";

export type MotionId =
	| "none"
	| "zoom-in"
	| "zoom-out"
	| "pan-left"
	| "pan-right"
	| "pan-up"
	| "pan-down";

export type TransitionId =
	| "none"
	| "fade"
	| "crossfade"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "zoom-in"
	| "zoom-out"
	| "blur"
	| "wipe-right"
	| "wipe-left";

export type TextAnimId =
	| "none"
	| "fade"
	| "slide-up"
	| "slide-down"
	| "slide-left"
	| "slide-right"
	| "zoom-in"
	| "zoom-out"
	| "pop"
	| "blur"
	| "spin"
	| "drop";

export type TextLoopId =
	| "none"
	| "pulse"
	| "bounce"
	| "shake"
	| "blink"
	| "heartbeat"
	| "swing";

export interface Transition {
	type: TransitionId;
	/** seconds */
	duration: number;
}

export interface Clip {
	id: string;
	assetId: string;
	/** 0 = video track, 1 = audio track */
	track: number;
	/** position of the clip on the timeline (seconds) */
	start: number;
	/** trim in-point inside the source media (seconds) */
	inPoint: number;
	/** trim out-point inside the source media (seconds) */
	outPoint: number;
	/** playback speed multiplier */
	speed: number;
	/** 0..1+ clip volume (video clips carry their own audio) */
	volume: number;
	audioFadeIn: number;
	audioFadeOut: number;

	// ── colour ────────────────────────────────────────────────────────────
	brightness: number;
	contrast: number;
	saturate: number;
	blur: number;
	hue: number;
	sepia: number;
	grayscale: number;
	invert: number;
	/** rgba() overlay, "" for none */
	tint: string;
	/** 0..1 radial darkening at the edges */
	vignette: number;
	/** 0..1 film grain */
	grain: number;
	preset: FilterPresetId;

	// ── transform / motion ────────────────────────────────────────────────
	/** 0.2 .. 3 */
	scale: number;
	/** -0.5 .. 0.5 of the canvas size */
	offsetX: number;
	offsetY: number;
	/** 0 | 90 | 180 | 270 */
	rotate: number;
	flipH: boolean;
	flipV: boolean;
	/** 0..1 */
	opacity: number;
	motion: MotionId;

	// ── transitions ───────────────────────────────────────────────────────
	transitionIn: Transition;
	transitionOut: Transition;
}

export interface TextLayer {
	id: string;
	text: string;
	start: number;
	end: number;
	/** normalized position on the canvas (0..1) */
	x: number;
	y: number;
	/** font size in px at 1080p */
	size: number;
	color: string;
	bold: boolean;
	background: boolean;
	shadow: boolean;
	/** stroke width in px at 1080p, 0 = off */
	stroke: number;
	strokeColor: string;
	/** degrees */
	rotation: number;
	animIn: TextAnimId;
	animInDuration: number;
	animOut: TextAnimId;
	animOutDuration: number;
	loop: TextLoopId;
}

export interface ProjectSnapshot {
	clips: Clip[];
	texts: TextLayer[];
}

export const DEFAULT_IMAGE_DURATION = 5;

export const FILTER_PRESETS: {
	id: FilterPresetId;
	label: string;
	adjust: Partial<Clip>;
}[] = [
	{ id: "original", label: "Original", adjust: {} },
	{
		id: "vivid",
		label: "Vivid",
		adjust: { saturate: 1.4, contrast: 1.12, brightness: 1.05, vignette: 0.1 },
	},
	{ id: "mono", label: "Mono", adjust: { saturate: 0 } },
	{
		id: "noir",
		label: "Noir",
		adjust: { saturate: 0, contrast: 1.45, brightness: 0.9, vignette: 0.45 },
	},
	{
		id: "fade",
		label: "Fade",
		adjust: {
			saturate: 0.72,
			contrast: 0.92,
			brightness: 1.07,
			tint: "rgba(255,238,214,0.10)",
		},
	},
	{
		id: "cool",
		label: "Cool",
		adjust: { hue: -14, saturate: 1.12, tint: "rgba(70,140,255,0.10)" },
	},
	{
		id: "warm",
		label: "Warm",
		adjust: { hue: 12, saturate: 1.15, tint: "rgba(255,150,60,0.12)" },
	},
	{
		id: "vintage",
		label: "Vintage",
		adjust: {
			sepia: 0.38,
			saturate: 0.85,
			contrast: 1.06,
			vignette: 0.38,
			grain: 0.35,
		},
	},
	{
		id: "cyberpunk",
		label: "Cyber",
		adjust: {
			saturate: 1.55,
			contrast: 1.22,
			hue: -22,
			tint: "rgba(130,0,255,0.14)",
			vignette: 0.3,
		},
	},
	{
		id: "dramatic",
		label: "Dramatic",
		adjust: { contrast: 1.4, saturate: 0.8, brightness: 0.94, vignette: 0.5 },
	},
	{
		id: "dreamy",
		label: "Dreamy",
		adjust: {
			brightness: 1.08,
			saturate: 1.18,
			blur: 0.6,
			tint: "rgba(255,190,255,0.12)",
		},
	},
];

export const MOTIONS: { id: MotionId; label: string }[] = [
	{ id: "none", label: "Static" },
	{ id: "zoom-in", label: "Zoom in" },
	{ id: "zoom-out", label: "Zoom out" },
	{ id: "pan-left", label: "Pan left" },
	{ id: "pan-right", label: "Pan right" },
	{ id: "pan-up", label: "Pan up" },
	{ id: "pan-down", label: "Pan down" },
];

export const TRANSITIONS: { id: TransitionId; label: string }[] = [
	{ id: "none", label: "None" },
	{ id: "fade", label: "Fade" },
	{ id: "crossfade", label: "Crossfade" },
	{ id: "slide-left", label: "Slide ◀" },
	{ id: "slide-right", label: "Slide ▶" },
	{ id: "slide-up", label: "Slide ▲" },
	{ id: "slide-down", label: "Slide ▼" },
	{ id: "zoom-in", label: "Zoom in" },
	{ id: "zoom-out", label: "Zoom out" },
	{ id: "blur", label: "Blur" },
	{ id: "wipe-right", label: "Wipe ▶" },
	{ id: "wipe-left", label: "Wipe ◀" },
];

export const TEXT_ANIMATIONS: { id: TextAnimId; label: string }[] = [
	{ id: "none", label: "None" },
	{ id: "fade", label: "Fade" },
	{ id: "slide-up", label: "Slide up" },
	{ id: "slide-down", label: "Slide down" },
	{ id: "slide-left", label: "Slide left" },
	{ id: "slide-right", label: "Slide right" },
	{ id: "zoom-in", label: "Zoom in" },
	{ id: "zoom-out", label: "Zoom out" },
	{ id: "pop", label: "Pop" },
	{ id: "blur", label: "Blur" },
	{ id: "spin", label: "Spin" },
	{ id: "drop", label: "Drop" },
];

export const TEXT_LOOPS: { id: TextLoopId; label: string }[] = [
	{ id: "none", label: "None" },
	{ id: "pulse", label: "Pulse" },
	{ id: "bounce", label: "Bounce" },
	{ id: "shake", label: "Shake" },
	{ id: "blink", label: "Blink" },
	{ id: "heartbeat", label: "Heartbeat" },
	{ id: "swing", label: "Swing" },
];

export const CLIP_EFFECT_DEFAULTS = {
	speed: 1,
	volume: 1,
	audioFadeIn: 0,
	audioFadeOut: 0,
	brightness: 1,
	contrast: 1,
	saturate: 1,
	blur: 0,
	hue: 0,
	sepia: 0,
	grayscale: 0,
	invert: 0,
	tint: "",
	vignette: 0,
	grain: 0,
	preset: "original" as FilterPresetId,
	scale: 1,
	offsetX: 0,
	offsetY: 0,
	rotate: 0,
	flipH: false,
	flipV: false,
	opacity: 1,
	motion: "none" as MotionId,
	transitionIn: { type: "none" as TransitionId, duration: 0.5 },
	transitionOut: { type: "none" as TransitionId, duration: 0.5 },
};

export const TEXT_DEFAULTS = {
	shadow: false,
	stroke: 0,
	strokeColor: "#000000",
	rotation: 0,
	animIn: "fade" as TextAnimId,
	animInDuration: 0.4,
	animOut: "none" as TextAnimId,
	animOutDuration: 0.4,
	loop: "none" as TextLoopId,
};

export function clipDuration(clip: Clip): number {
	return Math.max(0.05, (clip.outPoint - clip.inPoint) / (clip.speed || 1));
}

export function clipEnd(clip: Clip): number {
	return clip.start + clipDuration(clip);
}

export function uid(prefix = "id"): string {
	const rand =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	return `${prefix}_${rand.slice(0, 8)}`;
}

export function formatTimecode(seconds: number, withFrames = false): string {
	const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
	const h = Math.floor(safe / 3600);
	const m = Math.floor((safe % 3600) / 60);
	const s = Math.floor(safe % 60);
	const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	const head = h > 0 ? `${String(h).padStart(2, "0")}:` : "";
	if (!withFrames) return `${head}${base}`;
	const frames = Math.floor((safe % 1) * 30);
	return `${head}${base}.${String(frames).padStart(2, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
