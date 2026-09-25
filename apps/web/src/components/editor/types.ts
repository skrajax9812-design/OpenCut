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
	brightness: number;
	contrast: number;
	saturate: number;
	blur: number;
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
}

export interface ProjectSnapshot {
	clips: Clip[];
	texts: TextLayer[];
}

export const DEFAULT_IMAGE_DURATION = 5;
export const MAX_SOURCE_DURATION = 4 * 60 * 60;

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
