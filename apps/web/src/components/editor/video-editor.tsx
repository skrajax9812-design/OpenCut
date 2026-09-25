import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { cn } from "#/lib/utils";
import {
	CompositionEngine,
	MediaPool,
	extensionFor,
	pickMimeType,
} from "./engine";
import { Inspector } from "./inspector";
import { Timeline } from "./timeline";
import type {
	Asset,
	AssetKind,
	Clip,
	ProjectSnapshot,
	TextLayer,
} from "./types";
import {
	DEFAULT_IMAGE_DURATION,
	clamp,
	clipDuration,
	formatTimecode,
	uid,
} from "./types";

function detectKind(file: File): AssetKind | null {
	if (file.type.startsWith("video/")) return "video";
	if (file.type.startsWith("audio/")) return "audio";
	if (file.type.startsWith("image/")) return "image";
	const name = file.name.toLowerCase();
	if (/\.(mp4|webm|mov|m4v|mkv|avi)$/.test(name)) return "video";
	if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return "audio";
	if (/\.(png|jpe?g|gif|webp|bmp|avif)$/.test(name)) return "image";
	return null;
}

function readMediaMeta(
	url: string,
	kind: AssetKind,
): Promise<{ duration: number; width: number; height: number }> {
	const el: HTMLMediaElement =
		kind === "audio"
			? document.createElement("audio")
			: document.createElement("video");
	return new Promise((resolve, reject) => {
		const done = (duration: number) => {
			const video = el as HTMLVideoElement;
			resolve({
				duration,
				width: video.videoWidth || 0,
				height: video.videoHeight || 0,
			});
			el.removeAttribute("src");
			el.load();
		};
		const onError = () => {
			el.removeAttribute("src");
			reject(new Error("Could not read this media file"));
		};
		el.addEventListener("error", onError, { once: true });
		el.preload = "metadata";
		el.addEventListener(
			"loadedmetadata",
			() => {
				if (Number.isFinite(el.duration) && el.duration > 0) {
					done(el.duration);
					return;
				}
				// some containers report Infinity until you seek to the end
				const onDuration = () => {
					if (Number.isFinite(el.duration) && el.duration > 0)
						done(el.duration);
				};
				el.addEventListener("durationchange", onDuration);
				el.addEventListener("timeupdate", onDuration);
				try {
					el.currentTime = 1e6;
				} catch {
					done(0);
				}
				window.setTimeout(
					() => done(Number.isFinite(el.duration) ? el.duration : 0),
					2500,
				);
			},
			{ once: true },
		);
		el.src = url;
	});
}

function readImageMeta(
	url: string,
): Promise<{ duration: number; width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () =>
			resolve({
				duration: DEFAULT_IMAGE_DURATION,
				width: img.naturalWidth,
				height: img.naturalHeight,
			});
		img.onerror = () => reject(new Error("Could not read this image"));
		img.src = url;
	});
}

async function makeThumbnail(
	url: string,
	kind: AssetKind,
): Promise<string | undefined> {
	if (kind === "audio") return undefined;
	try {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return undefined;
		if (kind === "image") {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("image"));
				img.src = url;
			});
			const scale = 160 / Math.max(img.naturalWidth, img.naturalHeight);
			canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
			canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL("image/jpeg", 0.6);
		}
		const video = document.createElement("video");
		video.preload = "metadata";
		video.muted = true;
		video.src = url;
		await new Promise<void>((resolve, reject) => {
			video.addEventListener("loadeddata", () => resolve(), { once: true });
			video.addEventListener("error", () => reject(new Error("video")), {
				once: true,
			});
		});
		const target = Math.min(1, (video.duration || 1) / 2);
		await new Promise<void>((resolve) => {
			video.addEventListener("seeked", () => resolve(), { once: true });
			try {
				video.currentTime = target;
			} catch {
				resolve();
			}
		});
		const scale = 160 / Math.max(video.videoWidth, video.videoHeight);
		canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
		canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", 0.6);
	} catch {
		return undefined;
	}
}

const BITRATES = [
	{ label: "Low · 5 Mbps", value: 5 },
	{ label: "Good · 12 Mbps", value: 12 },
	{ label: "High · 24 Mbps", value: 24 },
	{ label: "Max · 48 Mbps", value: 48 },
];

export function VideoEditor() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const poolRef = useRef<MediaPool | null>(null);
	const engineRef = useRef<CompositionEngine | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const historyRef = useRef<ProjectSnapshot[]>([]);
	const clipsRef = useRef<Clip[]>([]);
	const objectUrlsRef = useRef<string[]>([]);

	const [assets, setAssets] = useState<Asset[]>([]);
	const [clips, setClips] = useState<Clip[]>([]);
	const [texts, setTexts] = useState<TextLayer[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [pxPerSec, setPxPerSec] = useState(60);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [lastExport, setLastExport] = useState<{
		url: string;
		name: string;
		size: number;
	} | null>(null);
	const [settings, setSettings] = useState({
		format: "mp4" as "mp4" | "webm",
		fps: 30,
		bitrate: 12,
	});
	const [historyDepth, setHistoryDepth] = useState(0);
	const [panels, setPanels] = useState(() => {
		if (typeof window === "undefined") return { media: true, inspector: true };
		return {
			media: window.innerWidth >= 1024,
			inspector: window.innerWidth >= 1280,
		};
	});

	clipsRef.current = clips;

	const assetsById = useMemo(
		() => new Map(assets.map((a) => [a.id, a])),
		[assets],
	);

	const duration = useMemo(() => {
		const ends = [
			...clips.map((clip) => clip.start + clipDuration(clip)),
			...texts.map((layer) => layer.end),
		];
		return ends.length ? Math.max(0.1, ...ends) : 0;
	}, [clips, texts]);

	const compositionSize = useMemo(() => {
		const firstVisual = clips
			.filter((clip) => clip.track === 0)
			.sort((a, b) => a.start - b.start)[0];
		const asset = firstVisual ? assetsById.get(firstVisual.assetId) : undefined;
		const rawWidth = asset?.width || 1920;
		const rawHeight = asset?.height || 1080;
		const scale = Math.min(1, 1920 / Math.max(rawWidth, rawHeight));
		const width = Math.round((rawWidth * scale) / 2) * 2;
		const height = Math.round((rawHeight * scale) / 2) * 2;
		return { width: Math.max(2, width), height: Math.max(2, height) };
	}, [clips, assetsById]);

	// engine lifecycle
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const pool = new MediaPool();
		const engine = new CompositionEngine(canvas, pool);
		engine.onTime = (value) => setTime(value);
		engine.onEnded = () => setPlaying(false);
		poolRef.current = pool;
		engineRef.current = engine;
		return () => {
			engine.dispose();
			pool.dispose();
			poolRef.current = null;
			engineRef.current = null;
			for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
			objectUrlsRef.current = [];
		};
	}, []);

	useEffect(() => {
		const pool = poolRef.current;
		if (!pool) return;
		for (const asset of assets) pool.register(asset);
	}, [assets]);

	useEffect(() => {
		engineRef.current?.update({ clips, texts, duration, ...compositionSize });
	}, [clips, texts, duration, compositionSize]);

	useEffect(() => {
		engineRef.current?.setAudio(volume, muted);
	}, [volume, muted]);

	const pushHistory = useCallback(() => {
		historyRef.current = [
			...historyRef.current.slice(-49),
			{ clips: clipsRef.current, texts },
		];
		setHistoryDepth(historyRef.current.length);
	}, [texts]);

	const undo = useCallback(() => {
		const previous = historyRef.current.pop();
		if (!previous) return;
		setClips(previous.clips);
		setTexts(previous.texts);
		setSelectedId(null);
		setHistoryDepth(historyRef.current.length);
	}, []);

	const seek = useCallback(
		(value: number) => {
			engineRef.current?.seek(clamp(value, 0, duration));
		},
		[duration],
	);

	const togglePlay = useCallback(() => {
		const engine = engineRef.current;
		if (!engine || duration <= 0) return;
		if (engine.isPlaying) {
			engine.pause();
			setPlaying(false);
		} else {
			engine.play();
			setPlaying(true);
		}
	}, [duration]);

	const addClip = useCallback((asset: Asset, track: number) => {
		setClips((prev) => {
			const endOfTrack = prev
				.filter((clip) => clip.track === track)
				.reduce(
					(max, clip) => Math.max(max, clip.start + clipDuration(clip)),
					0,
				);
			const sourceDuration =
				asset.duration > 0 ? asset.duration : DEFAULT_IMAGE_DURATION;
			const clip: Clip = {
				id: uid("clip"),
				assetId: asset.id,
				track,
				start: endOfTrack,
				inPoint: 0,
				outPoint: sourceDuration,
				speed: 1,
				volume: 1,
				brightness: 1,
				contrast: 1,
				saturate: 1,
				blur: 0,
			};
			return [...prev, clip];
		});
	}, []);

	const importFiles = useCallback(
		async (files: File[]) => {
			const usable = files.filter((file) => detectKind(file));
			if (!usable.length) {
				setError("Only video, audio or image files are supported.");
				return;
			}
			setImporting(true);
			setError(null);
			for (const file of usable) {
				const kind = detectKind(file)!;
				const url = URL.createObjectURL(file);
				objectUrlsRef.current.push(url);
				try {
					const meta =
						kind === "image"
							? await readImageMeta(url)
							: await readMediaMeta(url, kind);
					const thumbnail = await makeThumbnail(url, kind);
					const asset: Asset = {
						id: uid("asset"),
						name: file.name,
						kind,
						url,
						duration:
							kind === "image" ? DEFAULT_IMAGE_DURATION : meta.duration || 1,
						width: meta.width,
						height: meta.height,
						size: file.size,
						thumbnail,
					};
					setAssets((prev) => [...prev, asset]);
					addClip(asset, kind === "audio" ? 1 : 0);
				} catch {
					setError(`${file.name} could not be read by this browser.`);
					URL.revokeObjectURL(url);
				}
			}
			setImporting(false);
			setStatus(null);
		},
		[addClip],
	);

	const selectedClip = useMemo(
		() => clips.find((clip) => clip.id === selectedId) ?? null,
		[clips, selectedId],
	);
	const selectedText = useMemo(
		() => texts.find((layer) => layer.id === selectedId) ?? null,
		[texts, selectedId],
	);

	const patchClip = useCallback(
		(patch: Partial<Clip>) => {
			if (!selectedId) return;
			setClips((prev) =>
				prev.map((clip) =>
					clip.id === selectedId ? { ...clip, ...patch } : clip,
				),
			);
		},
		[selectedId],
	);

	const patchText = useCallback(
		(patch: Partial<TextLayer>) => {
			if (!selectedId) return;
			setTexts((prev) =>
				prev.map((layer) =>
					layer.id === selectedId ? { ...layer, ...patch } : layer,
				),
			);
		},
		[selectedId],
	);

	const deleteSelected = useCallback(() => {
		if (!selectedId) return;
		pushHistory();
		setClips((prev) => prev.filter((clip) => clip.id !== selectedId));
		setTexts((prev) => prev.filter((layer) => layer.id !== selectedId));
		setSelectedId(null);
	}, [pushHistory, selectedId]);

	const duplicateSelected = useCallback(() => {
		const clip = clipsRef.current.find((item) => item.id === selectedId);
		if (clip) {
			pushHistory();
			const copy: Clip = {
				...clip,
				id: uid("clip"),
				start: clip.start + clipDuration(clip),
			};
			setClips((prev) => [...prev, copy]);
			setSelectedId(copy.id);
			return;
		}
		const layer = texts.find((item) => item.id === selectedId);
		if (layer) {
			pushHistory();
			const copy: TextLayer = { ...layer, id: uid("text") };
			setTexts((prev) => [...prev, copy]);
			setSelectedId(copy.id);
		}
	}, [pushHistory, selectedId, texts]);

	const splitAtPlayhead = useCallback(() => {
		const clip = clipsRef.current.find((item) => item.id === selectedId);
		if (!clip) return;
		const length = clipDuration(clip);
		if (time <= clip.start + 0.08 || time >= clip.start + length - 0.08) return;
		pushHistory();
		const sourceSplit = clip.inPoint + (time - clip.start) * clip.speed;
		const left: Clip = { ...clip, outPoint: sourceSplit };
		const right: Clip = {
			...clip,
			id: uid("clip"),
			start: time,
			inPoint: sourceSplit,
		};
		setClips((prev) =>
			prev.flatMap((item) => (item.id === clip.id ? [left, right] : [item])),
		);
	}, [pushHistory, selectedId, time]);

	const addTextLayer = useCallback(() => {
		pushHistory();
		const start =
			duration > 0 ? Math.min(time, Math.max(0, duration - 0.2)) : 0;
		const end =
			start + (duration > 0 ? Math.min(4, Math.max(0.5, duration - start)) : 4);
		const layer: TextLayer = {
			id: uid("text"),
			text: "Your text here",
			start,
			end,
			x: 0.5,
			y: 0.85,
			size: 64,
			color: "#ffffff",
			bold: true,
			background: true,
		};
		setTexts((prev) => [...prev, layer]);
		setSelectedId(layer.id);
	}, [duration, pushHistory, time]);

	const removeAsset = useCallback(
		(assetId: string) => {
			pushHistory();
			setAssets((prev) => {
				const asset = prev.find((item) => item.id === assetId);
				if (asset) {
					URL.revokeObjectURL(asset.url);
					objectUrlsRef.current = objectUrlsRef.current.filter(
						(url) => url !== asset.url,
					);
				}
				return prev.filter((item) => item.id !== assetId);
			});
			setClips((prev) => prev.filter((clip) => clip.assetId !== assetId));
			poolRef.current?.unregister(assetId);
			setSelectedId(null);
		},
		[pushHistory],
	);

	// keyboard shortcuts
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);
			if (typing) return;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				undo();
				return;
			}
			switch (event.key) {
				case " ":
					event.preventDefault();
					togglePlay();
					break;
				case "s":
				case "S":
					splitAtPlayhead();
					break;
				case "Delete":
				case "Backspace":
					event.preventDefault();
					deleteSelected();
					break;
				case "ArrowLeft":
					event.preventDefault();
					seek(time - (event.shiftKey ? 1 : 1 / 30));
					break;
				case "ArrowRight":
					event.preventDefault();
					seek(time + (event.shiftKey ? 1 : 1 / 30));
					break;
				case "Home":
					seek(0);
					break;
				case "End":
					seek(duration);
					break;
				default:
					break;
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [deleteSelected, duration, seek, splitAtPlayhead, time, togglePlay, undo]);

	// drag text layers around the preview
	const onCanvasPointerDown = (
		event: React.PointerEvent<HTMLCanvasElement>,
	) => {
		const layer = texts.find((item) => item.id === selectedId);
		if (!layer) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const apply = (clientX: number, clientY: number) => {
			patchText({
				x: clamp((clientX - rect.left) / rect.width, 0, 1),
				y: clamp((clientY - rect.top) / rect.height, 0, 1),
			});
		};
		apply(event.clientX, event.clientY);
		const move = (e: PointerEvent) => apply(e.clientX, e.clientY);
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const runExport = async () => {
		const engine = engineRef.current;
		if (!engine || duration <= 0) return;
		setError(null);
		if (typeof MediaRecorder === "undefined") {
			setError(
				"This browser has no MediaRecorder support — try Chrome or Edge.",
			);
			return;
		}
		const mimeType = pickMimeType(settings.format);
		if (!mimeType) {
			setError(
				`${settings.format.toUpperCase()} recording is not supported here — try the other format.`,
			);
			return;
		}
		setExporting(true);
		setExportOpen(false);
		try {
			const blob = await engine.export({
				fps: settings.fps,
				mimeType,
				videoBitsPerSecond: settings.bitrate * 1_000_000,
			});
			if (lastExport) URL.revokeObjectURL(lastExport.url);
			const url = URL.createObjectURL(blob);
			const name = `opencut-export-${Date.now()}.${extensionFor(mimeType)}`;
			setLastExport({ url, name, size: blob.size });
			const link = document.createElement("a");
			link.href = url;
			link.download = name;
			link.click();
		} catch (exportError) {
			const message =
				exportError instanceof Error
					? exportError.message
					: "Export failed. Please try again.";
			if (!message.toLowerCase().includes("cancel")) setError(message);
		} finally {
			setExporting(false);
			setPlaying(false);
		}
	};

	const progress = duration > 0 ? clamp(time / duration, 0, 1) : 0;

	return (
		<div
			className="relative flex h-dvh flex-col bg-background text-foreground"
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				void importFiles(Array.from(event.dataTransfer.files));
			}}
		>
			<header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold tracking-tight">OpenCut</span>
					<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
						editor
					</span>
				</div>
				<div className="ml-auto flex items-center gap-1.5">
					<Button
						size="xs"
						variant={panels.media ? "secondary" : "ghost"}
						onClick={() =>
							setPanels((prev) => ({ ...prev, media: !prev.media }))
						}
						title="Toggle media panel"
					>
						Media
					</Button>
					<Button
						size="xs"
						variant={panels.inspector ? "secondary" : "ghost"}
						onClick={() =>
							setPanels((prev) => ({ ...prev, inspector: !prev.inspector }))
						}
						title="Toggle inspector panel"
					>
						Inspector
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						disabled={importing}
					>
						{importing ? "Importing…" : "Import media"}
					</Button>
					<Button size="sm" variant="outline" onClick={addTextLayer}>
						Add text
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={undo}
						disabled={historyDepth === 0}
					>
						Undo
					</Button>
					<Button
						size="sm"
						onClick={() => setExportOpen(true)}
						disabled={duration <= 0 || exporting}
					>
						Export
					</Button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				{panels.media ? (
					<aside className="w-52 shrink-0 overflow-y-auto border-r border-border bg-background/60 p-2">
						<div className="mb-2 flex items-center justify-between px-1">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Media
							</p>
							<Button
								size="icon-xs"
								variant="ghost"
								onClick={() => fileInputRef.current?.click()}
							>
								+
							</Button>
						</div>
						{assets.length === 0 ? (
							<p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
								Abhi kuch import nahi hua. Video/audio/image yahan drop karo.
							</p>
						) : (
							<ul className="space-y-1.5">
								{assets.map((asset) => (
									<li
										key={asset.id}
										className="group rounded-md border border-border/70 bg-card/60 p-1.5"
									>
										<div className="flex gap-2">
											<div className="size-14 shrink-0 overflow-hidden rounded bg-black">
												{asset.thumbnail ? (
													<img
														src={asset.thumbnail}
														alt=""
														className="size-full object-contain"
													/>
												) : (
													<div className="grid size-full place-items-center text-[9px] uppercase text-white/50">
														{asset.kind}
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-xs">{asset.name}</p>
												<p className="text-[10px] text-muted-foreground">
													{asset.kind === "image"
														? `${asset.width}×${asset.height}`
														: formatTimecode(asset.duration)}
												</p>
												<div className="mt-1 flex gap-1">
													<Button
														size="xs"
														variant="secondary"
														onClick={() =>
															addClip(asset, asset.kind === "audio" ? 1 : 0)
														}
													>
														Add
													</Button>
													<Button
														size="xs"
														variant="ghost"
														className="text-destructive"
														onClick={() => removeAsset(asset.id)}
													>
														Remove
													</Button>
												</div>
											</div>
										</div>
									</li>
								))}
							</ul>
						)}
					</aside>
				) : null}

				<main className="flex min-h-0 flex-1 flex-col">
					<div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/85 p-4">
						<canvas
							ref={canvasRef}
							width={compositionSize.width}
							height={compositionSize.height}
							className={cn(
								"max-h-full max-w-full rounded-md bg-black shadow-2xl",
								selectedText && "cursor-move",
								clips.length === 0 && texts.length === 0 && "opacity-0",
							)}
							style={{
								aspectRatio: `${compositionSize.width} / ${compositionSize.height}`,
							}}
							onPointerDown={onCanvasPointerDown}
						/>
						{clips.length === 0 && texts.length === 0 ? (
							<div className="absolute max-w-sm rounded-lg border border-dashed border-border bg-background/80 p-8 text-center">
								<p className="text-sm font-medium">
									Kuch import karke editing shuru karo
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Video, audio ya image drop karo — sab browser me hi rehta hai,
									koi upload nahi.
								</p>
								<Button
									className="mt-4"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
								>
									Choose files
								</Button>
							</div>
						) : null}
					</div>

					<div className="flex h-14 shrink-0 items-center gap-2 border-t border-border px-3">
						<Button
							size="icon"
							variant="ghost"
							onClick={() => seek(0)}
							title="Start"
						>
							⏮
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={() => seek(time - 1)}
							title="-1s"
						>
							◀◀
						</Button>
						<Button
							size="icon"
							variant="default"
							onClick={togglePlay}
							title="Play / pause (space)"
						>
							{playing ? "❚❚" : "▶"}
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={() => seek(time + 1)}
							title="+1s"
						>
							▶▶
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={() => seek(duration)}
							title="End"
						>
							⏭
						</Button>
						<div className="ml-2 font-mono text-xs tabular-nums">
							{formatTimecode(time, true)}{" "}
							<span className="text-muted-foreground">
								/ {formatTimecode(duration)}
							</span>
						</div>
						<div className="ml-auto flex items-center gap-2">
							<div className="flex items-center gap-1">
								<Button
									size="xs"
									variant="outline"
									onClick={() =>
										setPxPerSec((value) => clamp(value / 1.4, 4, 400))
									}
								>
									−
								</Button>
								<span className="w-14 text-center text-[10px] text-muted-foreground">
									{Math.round(pxPerSec)} px/s
								</span>
								<Button
									size="xs"
									variant="outline"
									onClick={() =>
										setPxPerSec((value) => clamp(value * 1.4, 4, 400))
									}
								>
									+
								</Button>
							</div>
							<Button
								size="xs"
								variant={muted ? "secondary" : "ghost"}
								onClick={() => setMuted((value) => !value)}
							>
								{muted ? "Unmute" : "Mute"}
							</Button>
							<div className="w-24">
								<Slider
									value={volume}
									min={0}
									max={1.5}
									step={0.05}
									onValueChange={(value) =>
										setVolume(Array.isArray(value) ? value[0] : value)
									}
								/>
							</div>
						</div>
					</div>

					<div className="flex h-[248px] shrink-0 flex-col overflow-hidden">
						<Timeline
							clips={clips}
							texts={texts}
							assets={assetsById}
							time={time}
							duration={duration}
							pxPerSec={pxPerSec}
							playing={playing}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onSeek={seek}
							onHistoryPush={pushHistory}
							setClips={setClips}
							setTexts={setTexts}
						/>
					</div>
				</main>

				{panels.inspector ? (
					<aside className="w-64 shrink-0 overflow-y-auto border-l border-border bg-background/60">
						<Inspector
							clip={selectedClip}
							text={selectedText}
							asset={
								selectedClip
									? (assetsById.get(selectedClip.assetId) ?? null)
									: null
							}
							duration={duration}
							onPatchClip={patchClip}
							onPatchText={patchText}
							onDelete={deleteSelected}
							onDuplicate={duplicateSelected}
							onSplit={splitAtPlayhead}
						/>
					</aside>
				) : null}
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="video/*,audio/*,image/*"
				multiple
				className="hidden"
				onChange={(event) => {
					void importFiles(Array.from(event.target.files ?? []));
					event.target.value = "";
				}}
			/>

			{dragging ? (
				<div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
					<div className="rounded-lg border-2 border-dashed border-primary px-8 py-6 text-sm">
						Drop to import
					</div>
				</div>
			) : null}

			{exporting ? (
				<div className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
					<div className="w-80 space-y-3 rounded-lg border border-border bg-card p-5">
						<p className="text-sm font-semibold">Exporting…</p>
						<div className="h-2 overflow-hidden rounded bg-muted">
							<div
								className="h-full bg-primary transition-[width] duration-100"
								style={{ width: `${progress * 100}%` }}
							/>
						</div>
						<p className="text-[11px] text-muted-foreground">
							{formatTimecode(time)} / {formatTimecode(duration)} · real time,
							is tab ko visible rakho.
						</p>
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								engineRef.current?.cancelExport();
								setExporting(false);
								setPlaying(false);
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : null}

			{exportOpen ? (
				<div className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
					<div className="w-96 space-y-4 rounded-lg border border-border bg-card p-5">
						<div>
							<p className="text-sm font-semibold">Export timeline</p>
							<p className="text-[11px] text-muted-foreground">
								{formatTimecode(duration)} · {compositionSize.width}×
								{compositionSize.height}
							</p>
						</div>
						<div className="space-y-1.5">
							<p className="text-[11px] text-muted-foreground">Format</p>
							<div className="flex gap-1.5">
								{(["mp4", "webm"] as const).map((format) => (
									<Button
										key={format}
										size="sm"
										variant={settings.format === format ? "default" : "outline"}
										onClick={() => setSettings((prev) => ({ ...prev, format }))}
									>
										{format.toUpperCase()}
									</Button>
								))}
							</div>
						</div>
						<div className="space-y-1.5">
							<p className="text-[11px] text-muted-foreground">Frame rate</p>
							<div className="flex gap-1.5">
								{[24, 30, 60].map((fps) => (
									<Button
										key={fps}
										size="sm"
										variant={settings.fps === fps ? "default" : "outline"}
										onClick={() => setSettings((prev) => ({ ...prev, fps }))}
									>
										{fps} fps
									</Button>
								))}
							</div>
						</div>
						<div className="space-y-1.5">
							<p className="text-[11px] text-muted-foreground">Quality</p>
							<div className="grid grid-cols-2 gap-1.5">
								{BITRATES.map((bitrate) => (
									<Button
										key={bitrate.value}
										size="sm"
										variant={
											settings.bitrate === bitrate.value ? "default" : "outline"
										}
										onClick={() =>
											setSettings((prev) => ({
												...prev,
												bitrate: bitrate.value,
											}))
										}
									>
										{bitrate.label}
									</Button>
								))}
							</div>
						</div>
						{lastExport ? (
							<a
								href={lastExport.url}
								download={lastExport.name}
								className="block text-[11px] text-primary underline"
							>
								Previous export download karo (
								{(lastExport.size / 1e6).toFixed(1)} MB)
							</a>
						) : null}
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => setExportOpen(false)}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={() => void runExport()}>
								Start export
							</Button>
						</div>
					</div>
				</div>
			) : null}

			{error ? (
				<div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground">
					{error}
					<button className="ml-2 underline" onClick={() => setError(null)}>
						dismiss
					</button>
				</div>
			) : null}

			{status ? (
				<div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-xs">
					{status}
				</div>
			) : null}
		</div>
	);
}
