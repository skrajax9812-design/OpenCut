import { beforeAll, describe, expect, it, vi } from "vitest";

import { CompositionEngine, MediaPool } from "./engine";
import {
	CLIP_EFFECT_DEFAULTS,
	FILTER_PRESETS,
	MOTIONS,
	TEXT_ANIMATIONS,
	TEXT_DEFAULTS,
	TEXT_LOOPS,
	TRANSITIONS,
	type Clip,
	type TextLayer,
} from "./types";

function recordingContext() {
	const calls: Record<string, number> = {};
	const bump = (name: string) => {
		calls[name] = (calls[name] ?? 0) + 1;
	};
	const ctx = {
		filter: "none",
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		fillStyle: "#000",
		strokeStyle: "#000",
		lineWidth: 1,
		lineJoin: "miter",
		font: "",
		textAlign: "center",
		textBaseline: "middle",
		shadowColor: "",
		shadowBlur: 0,
		shadowOffsetY: 0,
		save: () => bump("save"),
		restore: () => bump("restore"),
		setTransform: () => bump("setTransform"),
		fillRect: () => bump("fillRect"),
		drawImage: () => bump("drawImage"),
		fillText: () => bump("fillText"),
		strokeText: () => bump("strokeText"),
		beginPath: () => bump("beginPath"),
		rect: () => bump("rect"),
		clip: () => bump("clip"),
		translate: () => bump("translate"),
		rotate: () => bump("rotate"),
		scale: () => bump("scale"),
		roundRect: () => bump("roundRect"),
		fill: () => bump("fill"),
		putImageData: () => bump("putImageData"),
		measureText: () => ({ width: 50 }),
		createRadialGradient: () => ({ addColorStop: () => undefined }),
		createPattern: () => ({}),
		createImageData: (w: number, h: number) => ({
			data: new Uint8ClampedArray(w * h * 4),
		}),
	} as unknown as CanvasRenderingContext2D;
	return { ctx, calls };
}

let ctx: CanvasRenderingContext2D;
let calls: Record<string, number>;

beforeAll(() => {
	const recording = recordingContext();
	ctx = recording.ctx;
	calls = recording.calls;
	HTMLCanvasElement.prototype.getContext = vi.fn(
		() => ctx,
	) as unknown as HTMLCanvasElement["getContext"];
	for (const [key, value] of [
		["readyState", 2],
		["paused", true],
	] as const) {
		Object.defineProperty(HTMLMediaElement.prototype, key, {
			configurable: true,
			get: () => value,
		});
	}
	// jsdom defines these on HTMLVideoElement, which shadows the media prototype
	for (const [key, value] of [
		["videoWidth", 640],
		["videoHeight", 360],
	] as const) {
		Object.defineProperty(HTMLVideoElement.prototype, key, {
			configurable: true,
			get: () => value,
		});
	}
	Object.defineProperty(HTMLMediaElement.prototype, "play", {
		configurable: true,
		value: vi.fn(() => Promise.resolve()),
	});
	Object.defineProperty(HTMLMediaElement.prototype, "pause", {
		configurable: true,
		value: vi.fn(),
	});
});

function makeClip(patch: Partial<Clip> = {}): Clip {
	return {
		id: "clip_1",
		assetId: "asset_1",
		track: 0,
		start: 0,
		inPoint: 0,
		outPoint: 10,
		...CLIP_EFFECT_DEFAULTS,
		transitionIn: { type: "none", duration: 0.5 },
		transitionOut: { type: "none", duration: 0.5 },
		...patch,
	};
}

function makeText(patch: Partial<TextLayer> = {}): TextLayer {
	return {
		id: "text_1",
		text: "hello",
		start: 0,
		end: 4,
		x: 0.5,
		y: 0.5,
		size: 64,
		color: "#fff",
		bold: true,
		background: true,
		...TEXT_DEFAULTS,
		...patch,
	};
}

function render(clips: Clip[], texts: TextLayer[], time: number) {
	const canvas = document.createElement("canvas");
	const pool = new MediaPool();
	pool.register({ id: "asset_1", url: "blob:test", kind: "video" });
	const engine = new CompositionEngine(canvas, pool);
	engine.update({
		clips,
		texts,
		duration: Math.max(10, ...clips.map((c) => c.start + c.outPoint)),
		width: 1280,
		height: 720,
	});
	engine.seek(time);
	return engine;
}

describe("CompositionEngine effects", () => {
	it("draws a plain clip", () => {
		render([makeClip()], [], 1);
		expect((calls.drawImage ?? 0) > 0).toBe(true);
	});

	it("renders every filter preset", () => {
		for (const preset of FILTER_PRESETS) {
			const clip = makeClip({ preset: preset.id, ...preset.adjust });
			expect(() => render([clip], [], 1)).not.toThrow();
		}
	});

	it("renders every motion preset", () => {
		for (const motion of MOTIONS) {
			expect(() =>
				render([makeClip({ motion: motion.id })], [], 5),
			).not.toThrow();
		}
	});

	it("renders every transition at its start and end", () => {
		for (const transition of TRANSITIONS) {
			const clip = makeClip({
				transitionIn: { type: transition.id, duration: 1 },
				transitionOut: { type: transition.id, duration: 1 },
			});
			expect(() => render([clip], [], 0.5)).not.toThrow();
			expect(() => render([clip], [], 9.5)).not.toThrow();
		}
	});

	it("crossfades between two clips", () => {
		const first = makeClip({ id: "a", assetId: "asset_1", outPoint: 5 });
		const second = makeClip({
			id: "b",
			assetId: "asset_1",
			start: 5,
			inPoint: 0,
			outPoint: 10,
			transitionIn: { type: "crossfade", duration: 1 },
		});
		expect(() => render([first, second], [], 5.5)).not.toThrow();
	});

	it("renders text with every in/out/loop animation", () => {
		for (const anim of TEXT_ANIMATIONS) {
			expect(() =>
				render(
					[makeClip()],
					[makeText({ animIn: anim.id, animOut: anim.id })],
					0.2,
				),
			).not.toThrow();
		}
		for (const loop of TEXT_LOOPS) {
			expect(() =>
				render([makeClip()], [makeText({ loop: loop.id })], 2),
			).not.toThrow();
		}
	});

	it("draws text glyphs when the layer is visible", () => {
		const before = calls.fillText ?? 0;
		render([makeClip()], [makeText()], 2);
		expect((calls.fillText ?? 0) > before).toBe(true);
	});

	it("skips drawing outside the clip range", () => {
		const before = calls.drawImage ?? 0;
		render([makeClip({ start: 20, outPoint: 30 })], [], 1);
		expect(calls.drawImage ?? 0).toBe(before);
	});
});
