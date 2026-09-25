import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Slider } from "#/components/ui/slider";
import { Choices, Field, Section } from "./inspector-parts";
import {
	TEXT_ANIMATIONS,
	TEXT_DEFAULTS,
	TEXT_LOOPS,
	type TextAnimId,
	type TextLayer,
	type TextLoopId,
	clamp,
} from "./types";

const COLOR_SWATCHES = [
	"#ffffff",
	"#000000",
	"#ffd400",
	"#ff4d4d",
	"#31d158",
	"#4da3ff",
];

export interface TextInspectorProps {
	layer: TextLayer;
	duration: number;
	onPatch: (patch: Partial<TextLayer>) => void;
	onDelete: () => void;
	onDuplicate: () => void;
}

export function TextInspector({
	layer,
	duration,
	onPatch,
	onDelete,
	onDuplicate,
}: TextInspectorProps) {
	const number = (value: number) =>
		Number.isFinite(value) ? value.toFixed(2) : "0.00";

	return (
		<div className="pb-6">
			<div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
				<p className="text-xs font-semibold">Text layer</p>
				<div className="flex shrink-0 gap-1">
					<Button size="xs" variant="outline" onClick={onDuplicate}>
						Copy
					</Button>
					<Button size="xs" variant="destructive" onClick={onDelete}>
						Del
					</Button>
				</div>
			</div>

			<Section title="Text" defaultOpen>
				<textarea
					className="min-h-16 w-full resize-y rounded-md border border-border bg-input/40 p-2 text-xs outline-none focus:border-ring"
					value={layer.text}
					onChange={(event) => onPatch({ text: event.target.value })}
				/>
				<div className="grid grid-cols-2 gap-2">
					<Field label="Start (s)">
						<Input
							type="number"
							step="0.1"
							value={number(layer.start)}
							onChange={(event) =>
								onPatch({
									start: clamp(
										Number.parseFloat(event.target.value) || 0,
										0,
										layer.end - 0.1,
									),
								})
							}
						/>
					</Field>
					<Field label="End (s)">
						<Input
							type="number"
							step="0.1"
							value={number(layer.end)}
							onChange={(event) =>
								onPatch({
									end: clamp(
										Number.parseFloat(event.target.value) || 0.1,
										layer.start + 0.1,
										Math.max(duration, layer.start + 0.2),
									),
								})
							}
						/>
					</Field>
				</div>
			</Section>

			<Section title="Animation" defaultOpen>
				<Field label="Animate in">
					<Choices
						options={TEXT_ANIMATIONS}
						value={layer.animIn}
						columns={4}
						onChange={(animIn: TextAnimId) => onPatch({ animIn })}
					/>
				</Field>
				{layer.animIn !== "none" ? (
					<Field
						label="In duration"
						value={`${layer.animInDuration.toFixed(2)}s`}
					>
						<Slider
							value={layer.animInDuration}
							min={0.1}
							max={3}
							step={0.05}
							onValueChange={(next) =>
								onPatch({
									animInDuration: Array.isArray(next) ? next[0] : next,
								})
							}
						/>
					</Field>
				) : null}

				<Field label="Animate out">
					<Choices
						options={TEXT_ANIMATIONS}
						value={layer.animOut}
						columns={4}
						onChange={(animOut: TextAnimId) => onPatch({ animOut })}
					/>
				</Field>
				{layer.animOut !== "none" ? (
					<Field
						label="Out duration"
						value={`${layer.animOutDuration.toFixed(2)}s`}
					>
						<Slider
							value={layer.animOutDuration}
							min={0.1}
							max={3}
							step={0.05}
							onValueChange={(next) =>
								onPatch({
									animOutDuration: Array.isArray(next) ? next[0] : next,
								})
							}
						/>
					</Field>
				) : null}

				<Field label="Loop animation">
					<Choices
						options={TEXT_LOOPS}
						value={layer.loop}
						columns={4}
						onChange={(loop: TextLoopId) => onPatch({ loop })}
					/>
				</Field>
				<p className="text-[10px] text-muted-foreground">
					Loop animation chalti rehti hai jab tak layer on-screen hai.
				</p>
			</Section>

			<Section title="Style">
				<Field label="Font size" value={`${Math.round(layer.size)}px`}>
					<Slider
						value={layer.size}
						min={12}
						max={220}
						step={1}
						onValueChange={(next) =>
							onPatch({ size: Array.isArray(next) ? next[0] : next })
						}
					/>
				</Field>
				<Field label="Colour">
					<div className="flex flex-wrap items-center gap-1.5">
						{COLOR_SWATCHES.map((color) => (
							<button
								key={color}
								type="button"
								className={`size-6 rounded-md border ${layer.color === color ? "border-white" : "border-border"}`}
								style={{ background: color }}
								onClick={() => onPatch({ color })}
							/>
						))}
						<input
							type="color"
							className="size-6 rounded-md border border-border bg-transparent"
							value={layer.color}
							onChange={(event) => onPatch({ color: event.target.value })}
						/>
					</div>
				</Field>
				<div className="flex flex-wrap gap-1">
					<Button
						size="xs"
						variant={layer.bold ? "default" : "outline"}
						onClick={() => onPatch({ bold: !layer.bold })}
					>
						Bold
					</Button>
					<Button
						size="xs"
						variant={layer.background ? "default" : "outline"}
						onClick={() => onPatch({ background: !layer.background })}
					>
						Box
					</Button>
					<Button
						size="xs"
						variant={layer.shadow ? "default" : "outline"}
						onClick={() => onPatch({ shadow: !layer.shadow })}
					>
						Shadow
					</Button>
				</div>
				<Field label="Outline" value={`${layer.stroke.toFixed(1)}px`}>
					<Slider
						value={layer.stroke}
						min={0}
						max={12}
						step={0.5}
						onValueChange={(next) =>
							onPatch({ stroke: Array.isArray(next) ? next[0] : next })
						}
					/>
				</Field>
				{layer.stroke > 0 ? (
					<Field label="Outline colour">
						<input
							type="color"
							className="h-7 w-12 rounded-md border border-border bg-transparent"
							value={layer.strokeColor}
							onChange={(event) => onPatch({ strokeColor: event.target.value })}
						/>
					</Field>
				) : null}
				<Field label="Rotation" value={`${Math.round(layer.rotation)}°`}>
					<Slider
						value={layer.rotation}
						min={-180}
						max={180}
						step={1}
						onValueChange={(next) =>
							onPatch({ rotation: Array.isArray(next) ? next[0] : next })
						}
					/>
				</Field>
			</Section>

			<Section title="Position">
				<div className="grid grid-cols-2 gap-2">
					<Field label="X" value={layer.x.toFixed(2)}>
						<Slider
							value={layer.x}
							min={0}
							max={1}
							step={0.01}
							onValueChange={(next) =>
								onPatch({ x: Array.isArray(next) ? next[0] : next })
							}
						/>
					</Field>
					<Field label="Y" value={layer.y.toFixed(2)}>
						<Slider
							value={layer.y}
							min={0}
							max={1}
							step={0.01}
							onValueChange={(next) =>
								onPatch({ y: Array.isArray(next) ? next[0] : next })
							}
						/>
					</Field>
				</div>
				<p className="text-[10px] text-muted-foreground">
					Preview par drag karke bhi move kar sakte ho.
				</p>
				<Button
					size="xs"
					variant="outline"
					onClick={() => onPatch({ ...TEXT_DEFAULTS, rotation: 0 })}
				>
					Reset animation & style
				</Button>
			</Section>
		</div>
	);
}
