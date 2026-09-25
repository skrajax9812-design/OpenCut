import { useCallback, useEffect, useRef } from "react";

import { cn } from "#/lib/utils";
import {
	clamp,
	clipDuration,
	type Asset,
	type Clip,
	type TextLayer,
} from "./types";

const TICK_STEPS = [
	0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800,
];

function chooseTickStep(pxPerSec: number): number {
	return TICK_STEPS.find((step) => step * pxPerSec >= 64) ?? 3600;
}

function formatTick(seconds: number, step: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (step >= 60) return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
	return `${m}:${String(Number(s.toFixed(step < 1 ? 1 : 0))).padStart(2, "0")}`;
}

function snapValue(value: number, targets: number[], tolerance: number) {
	let best = value;
	let bestDelta = tolerance;
	for (const target of targets) {
		const delta = Math.abs(target - value);
		if (delta < bestDelta) {
			best = target;
			bestDelta = delta;
		}
	}
	return best;
}

export interface TimelineProps {
	clips: Clip[];
	texts: TextLayer[];
	assets: Map<string, Asset>;
	time: number;
	duration: number;
	pxPerSec: number;
	playing: boolean;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onSeek: (time: number) => void;
	onHistoryPush: () => void;
	setClips: (updater: (prev: Clip[]) => Clip[]) => void;
	setTexts: (updater: (prev: TextLayer[]) => TextLayer[]) => void;
}

export function Timeline({
	clips,
	texts,
	assets,
	time,
	duration,
	pxPerSec,
	playing,
	selectedId,
	onSelect,
	onSeek,
	onHistoryPush,
	setClips,
	setTexts,
}: TimelineProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const scrubbing = useRef(false);
	const contentWidth = Math.max(duration * pxPerSec + 400, 800);
	const tickStep = chooseTickStep(pxPerSec);

	const seekFromEvent = useCallback(
		(clientX: number) => {
			const el = contentRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			onSeek(clamp((clientX - rect.left) / pxPerSec, 0, Math.max(duration, 0)));
		},
		[duration, onSeek, pxPerSec],
	);

	useEffect(() => {
		if (!playing) return;
		const container = scrollRef.current;
		if (!container) return;
		const x = time * pxPerSec;
		const left = container.scrollLeft;
		const right = left + container.clientWidth;
		if (x < left + 40 || x > right - 80) {
			container.scrollTo({
				left: Math.max(0, x - container.clientWidth * 0.3),
			});
		}
	}, [time, playing, pxPerSec]);

	const startScrub = (event: React.PointerEvent) => {
		event.preventDefault();
		scrubbing.current = true;
		seekFromEvent(event.clientX);
		const move = (e: PointerEvent) => seekFromEvent(e.clientX);
		const up = () => {
			scrubbing.current = false;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const dragClip = (
		event: React.PointerEvent,
		clip: Clip,
		mode: "move" | "trim-start" | "trim-end",
	) => {
		event.stopPropagation();
		event.preventDefault();
		onSelect(clip.id);
		onHistoryPush();
		const startX = event.clientX;
		const origin = { ...clip };
		const asset = assets.get(clip.assetId);
		const sourceDuration = asset?.duration ?? clip.outPoint;
		const originLength = clipDuration(origin);
		const others = clips.filter(
			(c) => c.track === clip.track && c.id !== clip.id,
		);

		const move = (e: PointerEvent) => {
			const delta = (e.clientX - startX) / pxPerSec;
			setClips((prev) =>
				prev.map((c) => {
					if (c.id !== clip.id) return c;
					if (mode === "move") {
						const targets = [0, time];
						for (const other of others) {
							targets.push(other.start, other.start + clipDuration(other));
						}
						const raw = clamp(origin.start + delta, 0, 1e6);
						const snapped = snapValue(raw, targets, 8 / pxPerSec);
						return { ...c, start: Math.max(0, snapped) };
					}
					if (mode === "trim-start") {
						const maxShift = originLength - 0.1;
						const shift = clamp(delta, -(origin.inPoint ?? 0), maxShift);
						const targets = [time, 0, origin.start];
						const snappedShift = snapValue(
							shift,
							targets.map((t) => t - origin.start),
							8 / pxPerSec,
						);
						return {
							...c,
							start: Math.max(0, origin.start + snappedShift),
							inPoint: Math.max(0, origin.inPoint + snappedShift),
						};
					}
					const raw = clamp(
						origin.outPoint + delta,
						origin.inPoint + 0.1,
						sourceDuration,
					);
					const targets = [time, sourceDuration];
					const snapped = snapValue(raw, targets, 8 / pxPerSec);
					return { ...c, outPoint: snapped };
				}),
			);
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const dragText = (
		event: React.PointerEvent,
		layer: TextLayer,
		mode: "move" | "trim-start" | "trim-end",
	) => {
		event.stopPropagation();
		event.preventDefault();
		onSelect(layer.id);
		onHistoryPush();
		const startX = event.clientX;
		const origin = { ...layer };
		const move = (e: PointerEvent) => {
			const delta = (e.clientX - startX) / pxPerSec;
			setTexts((prev) =>
				prev.map((t) => {
					if (t.id !== layer.id) return t;
					if (mode === "move") {
						return {
							...t,
							start: Math.max(0, origin.start + delta),
							end: Math.max(0.1, origin.end + delta),
						};
					}
					if (mode === "trim-start") {
						const start = clamp(origin.start + delta, 0, origin.end - 0.1);
						return { ...t, start };
					}
					const end = clamp(origin.end + delta, origin.start + 0.1, 1e6);
					return { ...t, end };
				}),
			);
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const ticks: number[] = [];
	for (let t = 0; t <= duration + 1; t += tickStep) ticks.push(t);

	const renderClip = (clip: Clip) => {
		const asset = assets.get(clip.assetId);
		const width = clipDuration(clip) * pxPerSec;
		const selected = selectedId === clip.id;
		const isVideoTrack = clip.track === 0;
		return (
			<div
				key={clip.id}
				className={cn(
					"group absolute top-1.5 bottom-1.5 flex select-none overflow-hidden rounded-md border text-[10px] shadow-sm transition-colors",
					isVideoTrack
						? "border-sky-400/60 bg-sky-500/25 hover:bg-sky-500/35"
						: "border-emerald-400/60 bg-emerald-500/25 hover:bg-emerald-500/35",
					selected && "ring-2 ring-white/90",
				)}
				style={{ left: clip.start * pxPerSec, width: Math.max(12, width) }}
				onPointerDown={(event) => dragClip(event, clip, "move")}
				title={`${asset?.name ?? "clip"} — ${clipDuration(clip).toFixed(2)}s`}
			>
				<div
					className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/20 opacity-0 transition-opacity group-hover:opacity-100"
					onPointerDown={(event) => dragClip(event, clip, "trim-start")}
				/>
				<div className="pointer-events-none flex flex-col justify-center px-2 leading-tight">
					<span className="truncate font-medium text-white/90">
						{asset?.name ?? "clip"}
					</span>
					<span className="truncate text-white/55">
						{clipDuration(clip).toFixed(1)}s
						{clip.speed !== 1 ? ` · ${clip.speed}x` : ""}
						{clip.volume !== 1 ? ` · ${Math.round(clip.volume * 100)}%` : ""}
					</span>
				</div>
				<div
					className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/20 opacity-0 transition-opacity group-hover:opacity-100"
					onPointerDown={(event) => dragClip(event, clip, "trim-end")}
				/>
			</div>
		);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col border-t border-border bg-card/40">
			<div className="flex min-h-0 flex-1">
				<div className="w-24 shrink-0 border-r border-border bg-background/60 text-[10px] uppercase tracking-wide">
					<div className="h-7 border-b border-border" />
					<div className="flex h-16 items-center px-2 font-semibold text-sky-400">
						Video
					</div>
					<div className="flex h-16 items-center border-t border-border/60 px-2 font-semibold text-emerald-400">
						Audio
					</div>
					<div className="flex h-11 items-center border-t border-border/60 px-2 font-semibold text-amber-400">
						Text
					</div>
				</div>
				<div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
					<div
						ref={contentRef}
						className="relative select-none"
						style={{ width: contentWidth }}
					>
						<div
							className="relative h-7 cursor-ew-resize border-b border-border bg-background/60"
							onPointerDown={startScrub}
						>
							{ticks.map((tick) => (
								<div
									key={tick}
									className="absolute top-0 h-full border-l border-border/70 pl-1 text-[10px] text-muted-foreground"
									style={{ left: tick * pxPerSec }}
								>
									{formatTick(tick, tickStep)}
								</div>
							))}
						</div>

						{[0, 1].map((track) => (
							<div
								key={track}
								className="relative h-16 border-b border-border/60 bg-background/30"
								onPointerDown={(event) => {
									if (event.target === event.currentTarget) onSelect(null);
								}}
							>
								{clips
									.filter((clip) => clip.track === track)
									.map((clip) => renderClip(clip))}
							</div>
						))}

						<div
							className="relative h-11 border-b border-border/60 bg-background/20"
							onPointerDown={(event) => {
								if (event.target === event.currentTarget) onSelect(null);
							}}
						>
							{texts.map((layer) => {
								const selected = selectedId === layer.id;
								return (
									<div
										key={layer.id}
										className={cn(
											"group absolute top-1.5 bottom-1.5 flex select-none items-center overflow-hidden rounded-md border border-amber-400/60 bg-amber-500/25 px-2 text-[10px] hover:bg-amber-500/35",
											selected && "ring-2 ring-white/90",
										)}
										style={{
											left: layer.start * pxPerSec,
											width: Math.max(12, (layer.end - layer.start) * pxPerSec),
										}}
										onPointerDown={(event) => dragText(event, layer, "move")}
									>
										<span className="pointer-events-none truncate text-white/85">
											{layer.text.split("\n")[0] || "Text"}
										</span>
										<div
											className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100"
											onPointerDown={(event) =>
												dragText(event, layer, "trim-start")
											}
										/>
										<div
											className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100"
											onPointerDown={(event) =>
												dragText(event, layer, "trim-end")
											}
										/>
									</div>
								);
							})}
						</div>

						<div
							className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
							style={{ left: time * pxPerSec }}
						>
							<div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 bg-red-500" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
