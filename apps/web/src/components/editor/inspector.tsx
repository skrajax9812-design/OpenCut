import { ClipInspector } from "./clip-inspector";
import { TextInspector } from "./text-inspector";
import type { Asset, Clip, TextLayer } from "./types";

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
	if (text) {
		return (
			<TextInspector
				layer={text}
				duration={duration}
				onPatch={onPatchText}
				onDelete={onDelete}
				onDuplicate={onDuplicate}
			/>
		);
	}

	if (clip) {
		return (
			<ClipInspector
				clip={clip}
				asset={asset}
				onPatch={onPatchClip}
				onDelete={onDelete}
				onDuplicate={onDuplicate}
				onSplit={onSplit}
			/>
		);
	}

	return (
		<div className="space-y-3 p-3 text-xs text-muted-foreground">
			<p className="font-medium text-foreground/80">Inspector</p>
			<p>Koi clip ya text select karo — effects, animation, sab yahin hai.</p>
			<ul className="list-disc space-y-1 pl-4 text-[11px]">
				<li>Filters: Vivid, Noir, Vintage, Cyber…</li>
				<li>Motion: zoom / pan (Ken Burns)</li>
				<li>Transitions: fade, crossfade, slide, wipe, blur</li>
				<li>Text: animate in / out + loop animations</li>
				<li>
					<kbd className="rounded bg-muted px-1">S</kbd> split ·{" "}
					<kbd className="rounded bg-muted px-1">Del</kbd> delete ·{" "}
					<kbd className="rounded bg-muted px-1">Space</kbd> play
				</li>
			</ul>
		</div>
	);
}
