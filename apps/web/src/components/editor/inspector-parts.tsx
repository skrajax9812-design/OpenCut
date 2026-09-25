import { useState } from "react";

import { Button } from "#/components/ui/button";

export function Section({
	title,
	children,
	defaultOpen = false,
}: {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="border-b border-border/60">
			<button
				type="button"
				className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
				onClick={() => setOpen(!open)}
			>
				<span>{title}</span>
				<span className="text-xs">{open ? "−" : "+"}</span>
			</button>
			{open ? <div className="space-y-3 px-3 pb-3">{children}</div> : null}
		</div>
	);
}

export function Field({
	label,
	value,
	children,
}: {
	label: string;
	value?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-[10px] text-muted-foreground">
				<span>{label}</span>
				{value ? (
					<span className="tabular-nums text-foreground/80">{value}</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

export function Choices<T extends string>({
	options,
	value,
	onChange,
	columns = 3,
}: {
	options: { id: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	columns?: number;
}) {
	return (
		<div
			className="grid gap-1"
			style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
		>
			{options.map((option) => (
				<Button
					key={option.id}
					size="xs"
					variant={value === option.id ? "default" : "outline"}
					className="truncate px-1"
					title={option.label}
					onClick={() => onChange(option.id)}
				>
					{option.label}
				</Button>
			))}
		</div>
	);
}
