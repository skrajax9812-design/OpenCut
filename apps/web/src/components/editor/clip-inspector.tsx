import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Slider } from "#/components/ui/slider";
import { Choices, Field, Section } from "./inspector-parts";
import {
	CLIP_EFFECT_DEFAULTS,
	FILTER_PRESETS,
	MOTIONS,
	TRANSITIONS,
	type Asset,
	type Clip,
	type FilterPresetId,
	type MotionId,
	type TransitionId,
	clamp,
	clipDuration,
	formatTimecode,
} from "./types";

const ROTATIONS = [0, 90, 180, 270];

export interface ClipInspectorProps {
	clip: Clip;
	asset: Asset | null;
	onPatch: (patch: Partial<Clip>) => void;
	onDelete: () => void;
	onDuplicate: () => void;
	onSplit: () => void;
}

export function ClipInspector({
	clip,
	asset,
	onPatch,
	onDelete,
	onDuplicate,
	onSplit,
}: ClipInspectorProps) {
	const sourceDuration = asset?.duration ?? 0;
	const isAudio = clip.track === 1;

	const number = (value: number) =>
		Number.isFinite(value) ? value.toFixed(2) : "0.00";

	const setNumber = (
		key: keyof Clip,
		raw: string,
		min: number,
		max: number,
	) => {
		const parsed = Number.parseFloat(raw);
		if (!Number.isFinite(parsed)) return;
		onPatch({ [key]: clamp(parsed, min, max) } as Partial<Clip>);
	};

	const slider = (
		label: string,
		key: keyof Clip,
		min: number,
		max: number,
		step: number,
		format?: (value: number) => string,
		extra?: Partial<Clip>,
	) => {
		const value = clip[key] as number;
		return (
			<Field label={label} value={format ? format(value) : value.toFixed(2)}>
				<Slider
					value={value}
					min={min}
					max={max}
					step={step}
					onValueChange={(next) => {
						const numeric = Array.isArray(next) ? next[0] : next;
						onPatch({ [key]: numeric, ...extra } as Partial<Clip>);
					}}
				/>
			</Field>
		);
	};

	const applyPreset = (id: FilterPresetId) => {
		const preset = FILTER_PRESETS.find((item) => item.id === id);
		if (!preset) return;
		onPatch({
			brightness: 1,
			contrast: 1,
			saturate: 1,
			hue: 0,
			sepia: 0,
			grayscale: 0,
			invert: 0,
			blur: 0,
			tint: "",
			vignette: 0,
			grain: 0,
			...preset.adjust,
			preset: id,
		});
	};

	const custom = { preset: "custom" as FilterPresetId };

	return (
		<div className="pb-6">
			<div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
				<div className="min-w-0">
					<p className="truncate text-xs font-semibold">
						{asset?.name ?? "Clip"}
					</p>
					<p className="text-[10px] text-muted-foreground">
						{clipDuration(clip).toFixed(2)}s · {asset?.kind ?? "clip"}
					</p>
				</div>
				<div className="flex shrink-0 gap-1">
					<Button size="xs" variant="outline" onClick={onSplit}>
						Split
					</Button>
					<Button size="xs" variant="outline" onClick={onDuplicate}>
						Copy
					</Button>
					<Button size="xs" variant="destructive" onClick={onDelete}>
						Del
					</Button>
				</div>
			</div>

			<Section title="Trim" defaultOpen>
				<div className="grid grid-cols-2 gap-2">
					<Field label="In (source s)">
						<Input
							type="number"
							step="0.05"
							value={number(clip.inPoint)}
							onChange={(event) =>
								setNumber("inPoint", event.target.value, 0, clip.outPoint - 0.1)
							}
						/>
					</Field>
					<Field label="Out (source s)">
						<Input
							type="number"
							step="0.05"
							value={number(clip.outPoint)}
							onChange={(event) =>
								setNumber(
									"outPoint",
									event.target.value,
									clip.inPoint + 0.1,
									sourceDuration || 1e6,
								)
							}
						/>
					</Field>
					<Field label="Timeline start (s)">
						<Input
							type="number"
							step="0.05"
							value={number(clip.start)}
							onChange={(event) =>
								setNumber("start", event.target.value, 0, 1e6)
							}
						/>
					</Field>
					<Field label="Length" value={formatTimecode(clipDuration(clip))}>
						<div className="flex h-7 items-center rounded-md border border-border bg-muted/40 px-2 text-[11px] tabular-nums">
							{clipDuration(clip).toFixed(2)}s
						</div>
					</Field>
				</div>
				<Field label="Speed" value={`${clip.speed.toFixed(2)}x`}>
					<Slider
						value={clip.speed}
						min={0.25}
						max={3}
						step={0.05}
						onValueChange={(next) =>
							onPatch({ speed: Array.isArray(next) ? next[0] : next })
						}
					/>
				</Field>
			</Section>

			{!isAudio ? (
				<Section title="Filters & effects" defaultOpen>
					<div className="grid grid-cols-4 gap-1">
						{FILTER_PRESETS.map((preset) => (
							<Button
								key={preset.id}
								size="xs"
								variant={clip.preset === preset.id ? "default" : "outline"}
								className="truncate px-1"
								onClick={() => applyPreset(preset.id)}
							>
								{preset.label}
							</Button>
						))}
					</div>

					{slider("Brightness", "brightness", 0.2, 2, 0.02, undefined, custom)}
					{slider("Contrast", "contrast", 0.2, 2, 0.02, undefined, custom)}
					{slider("Saturation", "saturate", 0, 3, 0.02, undefined, custom)}
					{slider(
						"Temperature",
						"hue",
						-45,
						45,
						1,
						(value) => `${value > 0 ? "+" : ""}${value.toFixed(0)}°`,
						custom,
					)}
					{slider(
						"Blur",
						"blur",
						0,
						20,
						0.5,
						(v) => `${v.toFixed(1)}px`,
						custom,
					)}
					{slider("Fade / sepia", "sepia", 0, 1, 0.02, undefined, custom)}
					{slider("Black & white", "grayscale", 0, 1, 0.02, undefined, custom)}
					{slider("Invert", "invert", 0, 1, 0.02, undefined, custom)}
					{slider("Vignette", "vignette", 0, 1, 0.02, undefined, custom)}
					{slider("Grain", "grain", 0, 1, 0.02, undefined, custom)}
					<Button
						size="xs"
						variant="outline"
						onClick={() => applyPreset("original")}
					>
						Reset effects
					</Button>
				</Section>
			) : null}

			{!isAudio ? (
				<Section title="Transform & motion">
					{slider("Zoom", "scale", 0.2, 3, 0.01)}
					<div className="grid grid-cols-2 gap-2">
						{slider("Move X", "offsetX", -0.5, 0.5, 0.005)}
						{slider("Move Y", "offsetY", -0.5, 0.5, 0.005)}
					</div>
					<div className="flex flex-wrap gap-1">
						{ROTATIONS.map((angle) => (
							<Button
								key={angle}
								size="xs"
								variant={clip.rotate === angle ? "default" : "outline"}
								onClick={() => onPatch({ rotate: angle })}
							>
								{angle}°
							</Button>
						))}
					</div>
					<div className="flex flex-wrap gap-1">
						<Button
							size="xs"
							variant={clip.flipH ? "default" : "outline"}
							onClick={() => onPatch({ flipH: !clip.flipH })}
						>
							Flip H
						</Button>
						<Button
							size="xs"
							variant={clip.flipV ? "default" : "outline"}
							onClick={() => onPatch({ flipV: !clip.flipV })}
						>
							Flip V
						</Button>
						<Button
							size="xs"
							variant="outline"
							onClick={() =>
								onPatch({
									scale: 1,
									offsetX: 0,
									offsetY: 0,
									rotate: 0,
									flipH: false,
									flipV: false,
								})
							}
						>
							Reset
						</Button>
					</div>
					{slider("Opacity", "opacity", 0, 1, 0.02)}
					<Field label="Ken Burns motion">
						<Choices
							options={MOTIONS}
							value={clip.motion}
							columns={3}
							onChange={(id: MotionId) => onPatch({ motion: id })}
						/>
					</Field>
				</Section>
			) : null}

			<Section title="Transitions">
				<Field label="Transition in">
					<Choices
						options={TRANSITIONS}
						value={clip.transitionIn.type}
						columns={4}
						onChange={(type: TransitionId) =>
							onPatch({ transitionIn: { ...clip.transitionIn, type } })
						}
					/>
				</Field>
				<Field
					label="In duration"
					value={`${clip.transitionIn.duration.toFixed(2)}s`}
				>
					<Slider
						value={clip.transitionIn.duration}
						min={0.1}
						max={2}
						step={0.05}
						onValueChange={(next) =>
							onPatch({
								transitionIn: {
									...clip.transitionIn,
									duration: Array.isArray(next) ? next[0] : next,
								},
							})
						}
					/>
				</Field>
				<Field label="Transition out">
					<Choices
						options={TRANSITIONS}
						value={clip.transitionOut.type}
						columns={4}
						onChange={(type: TransitionId) =>
							onPatch({ transitionOut: { ...clip.transitionOut, type } })
						}
					/>
				</Field>
				<Field
					label="Out duration"
					value={`${clip.transitionOut.duration.toFixed(2)}s`}
				>
					<Slider
						value={clip.transitionOut.duration}
						min={0.1}
						max={2}
						step={0.05}
						onValueChange={(next) =>
							onPatch({
								transitionOut: {
									...clip.transitionOut,
									duration: Array.isArray(next) ? next[0] : next,
								},
							})
						}
					/>
				</Field>
			</Section>

			<Section title="Audio">
				{slider(
					"Volume",
					"volume",
					0,
					2,
					0.05,
					(v) => `${Math.round(v * 100)}%`,
				)}
				{slider(
					"Fade in",
					"audioFadeIn",
					0,
					5,
					0.05,
					(v) => `${v.toFixed(2)}s`,
				)}
				{slider(
					"Fade out",
					"audioFadeOut",
					0,
					5,
					0.05,
					(v) => `${v.toFixed(2)}s`,
				)}
			</Section>

			<Section title="Reset everything">
				<Button
					size="xs"
					variant="outline"
					onClick={() =>
						onPatch({
							...CLIP_EFFECT_DEFAULTS,
							transitionIn: { type: "none", duration: 0.5 },
							transitionOut: { type: "none", duration: 0.5 },
						})
					}
				>
					Reset clip to defaults
				</Button>
			</Section>
		</div>
	);
}
