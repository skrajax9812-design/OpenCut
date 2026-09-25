import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Slider } from "#/components/ui/slider";
import {
	clamp,
	clipDuration,
	formatTimecode,
	type Asset,
	type Clip,
	type TextLayer,
} from "./types";

function Field({
	label,
	value,
	children,
}: {
	label: string;
	value?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-[11px] text-muted-foreground">
				<span>{label}</span>
				{value ? (
					<span className="tabular-nums text-foreground/80">{value}</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

const COLOR_SWATCHES = [
	"#ffffff",
	"#000000",
	"#ffd400",
	"#ff4d4d",
	"#31d158",
	"#4da3ff",
];

export interface InspectorProps {
	clip: Clip | null;
	text: TextLayer | null;
	asset: Asset | null;
	duration: number;
	onPatchClip: (patch: Partial<Clip>) => void;
	onPatchText: (patch: Partial<TextLayer>) => void;
	onDelete: () => void;
	onDuplicate: () => void;
	onSplit: () => void;
}

export function Inspector({
	clip,
	text,
	asset,
	duration,
	onPatchClip,
	onPatchText,
	onDelete,
	onDuplicate,
	onSplit,
}: InspectorProps) {
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
		onPatchClip({ [key]: clamp(parsed, min, max) } as Partial<Clip>);
	};

	if (!clip && !text) {
		return (
			<div className="space-y-2 p-3 text-xs text-muted-foreground">
				<p className="font-medium text-foreground/80">Inspector</p>
				<p>
					Koi clip ya text select karo — trimming, speed, volume, filters yahin
					milenge.
				</p>
				<ul className="list-disc space-y-1 pl-4">
					<li>Timeline par clip khinch kar move karo</li>
					<li>Clip ke kinaare (handles) se trim karo</li>
					<li>
						<kbd className="rounded bg-muted px-1">S</kbd> se playhead par
						split, <kbd className="rounded bg-muted px-1">Del</kbd> se delete
					</li>
				</ul>
			</div>
		);
	}

	if (text) {
		return (
			<div className="space-y-4 p-3">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold">Text layer</p>
					<div className="flex gap-1">
						<Button size="xs" variant="outline" onClick={onDuplicate}>
							Duplicate
						</Button>
						<Button size="xs" variant="destructive" onClick={onDelete}>
							Delete
						</Button>
					</div>
				</div>

				<Field label="Text">
					<textarea
						className="min-h-16 w-full resize-y rounded-md border border-border bg-input/40 p-2 text-xs outline-none focus:border-ring"
						value={text.text}
						onChange={(event) => onPatchText({ text: event.target.value })}
					/>
				</Field>

				<div className="grid grid-cols-2 gap-2">
					<Field label="Start (s)">
						<Input
							type="number"
							step="0.1"
							value={number(text.start)}
							onChange={(event) =>
								onPatchText({
									start: clamp(
										Number.parseFloat(event.target.value) || 0,
										0,
										text.end - 0.1,
									),
								})
							}
						/>
					</Field>
					<Field label="End (s)">
						<Input
							type="number"
							step="0.1"
							value={number(text.end)}
							onChange={(event) =>
								onPatchText({
									end: clamp(
										Number.parseFloat(event.target.value) || 0.1,
										text.start + 0.1,
										Math.max(duration, text.start + 0.2),
									),
								})
							}
						/>
					</Field>
				</div>

				<Field label="Font size" value={`${Math.round(text.size)}px`}>
					<Slider
						value={text.size}
						min={12}
						max={220}
						step={1}
						onValueChange={(value) =>
							onPatchText({ size: Array.isArray(value) ? value[0] : value })
						}
					/>
				</Field>

				<div className="grid grid-cols-2 gap-2">
					<Field label="Position X" value={text.x.toFixed(2)}>
						<Slider
							value={text.x}
							min={0}
							max={1}
							step={0.01}
							onValueChange={(value) =>
								onPatchText({ x: Array.isArray(value) ? value[0] : value })
							}
						/>
					</Field>
					<Field label="Position Y" value={text.y.toFixed(2)}>
						<Slider
							value={text.y}
							min={0}
							max={1}
							step={0.01}
							onValueChange={(value) =>
								onPatchText({ y: Array.isArray(value) ? value[0] : value })
							}
						/>
					</Field>
				</div>
				<p className="text-[11px] text-muted-foreground">
					Preview par drag karke bhi text move ho sakta hai.
				</p>

				<Field label="Colour">
					<div className="flex flex-wrap items-center gap-1.5">
						{COLOR_SWATCHES.map((color) => (
							<button
								key={color}
								type="button"
								className={`size-6 rounded-md border ${text.color === color ? "border-white" : "border-border"}`}
								style={{ background: color }}
								onClick={() => onPatchText({ color })}
							/>
						))}
						<input
							type="color"
							className="size-6 rounded-md border border-border bg-transparent"
							value={text.color}
							onChange={(event) => onPatchText({ color: event.target.value })}
						/>
					</div>
				</Field>

				<div className="flex gap-2">
					<Button
						size="xs"
						variant={text.bold ? "default" : "outline"}
						onClick={() => onPatchText({ bold: !text.bold })}
					>
						Bold
					</Button>
					<Button
						size="xs"
						variant={text.background ? "default" : "outline"}
						onClick={() => onPatchText({ background: !text.background })}
					>
						Background
					</Button>
				</div>
			</div>
		);
	}

	const sourceDuration = asset?.duration ?? 0;

	return (
		<div className="space-y-4 p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate text-xs font-semibold">
						{asset?.name ?? "Clip"}
					</p>
					<p className="text-[11px] text-muted-foreground">
						{clipDuration(clip!).toFixed(2)}s · {asset?.kind}
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
						Delete
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Field label="In (source s)">
					<Input
						type="number"
						step="0.05"
						value={number(clip!.inPoint)}
						onChange={(event) =>
							setNumber("inPoint", event.target.value, 0, clip!.outPoint - 0.1)
						}
					/>
				</Field>
				<Field label="Out (source s)">
					<Input
						type="number"
						step="0.05"
						value={number(clip!.outPoint)}
						onChange={(event) =>
							setNumber(
								"outPoint",
								event.target.value,
								clip!.inPoint + 0.1,
								sourceDuration || 1e6,
							)
						}
					/>
				</Field>
				<Field label="Timeline start (s)">
					<Input
						type="number"
						step="0.05"
						value={number(clip!.start)}
						onChange={(event) => setNumber("start", event.target.value, 0, 1e6)}
					/>
				</Field>
				<Field label="Length (s)" value={clipDuration(clip!).toFixed(2)}>
					<div className="flex h-7 items-center rounded-md border border-border bg-muted/40 px-2 text-xs tabular-nums">
						{formatTimecode(clipDuration(clip!))}
					</div>
				</Field>
			</div>

			<Field label="Speed" value={`${clip!.speed.toFixed(2)}x`}>
				<Slider
					value={clip!.speed}
					min={0.25}
					max={3}
					step={0.05}
					onValueChange={(value) =>
						onPatchClip({ speed: Array.isArray(value) ? value[0] : value })
					}
				/>
			</Field>

			<Field label="Volume" value={`${Math.round(clip!.volume * 100)}%`}>
				<Slider
					value={clip!.volume}
					min={0}
					max={2}
					step={0.05}
					onValueChange={(value) =>
						onPatchClip({ volume: Array.isArray(value) ? value[0] : value })
					}
				/>
			</Field>

			<div className="space-y-3 rounded-md border border-border/70 p-2">
				<p className="text-[11px] font-medium text-muted-foreground">
					Colour adjust
				</p>
				<Field label="Brightness" value={clip!.brightness.toFixed(2)}>
					<Slider
						value={clip!.brightness}
						min={0.2}
						max={2}
						step={0.02}
						onValueChange={(value) =>
							onPatchClip({
								brightness: Array.isArray(value) ? value[0] : value,
							})
						}
					/>
				</Field>
				<Field label="Contrast" value={clip!.contrast.toFixed(2)}>
					<Slider
						value={clip!.contrast}
						min={0.2}
						max={2}
						step={0.02}
						onValueChange={(value) =>
							onPatchClip({ contrast: Array.isArray(value) ? value[0] : value })
						}
					/>
				</Field>
				<Field label="Saturation" value={clip!.saturate.toFixed(2)}>
					<Slider
						value={clip!.saturate}
						min={0}
						max={3}
						step={0.02}
						onValueChange={(value) =>
							onPatchClip({ saturate: Array.isArray(value) ? value[0] : value })
						}
					/>
				</Field>
				<Field label="Blur" value={`${clip!.blur.toFixed(1)}px`}>
					<Slider
						value={clip!.blur}
						min={0}
						max={20}
						step={0.5}
						onValueChange={(value) =>
							onPatchClip({ blur: Array.isArray(value) ? value[0] : value })
						}
					/>
				</Field>
				<Button
					size="xs"
					variant="outline"
					onClick={() =>
						onPatchClip({ brightness: 1, contrast: 1, saturate: 1, blur: 0 })
					}
				>
					Reset colour
				</Button>
			</div>
		</div>
	);
}
