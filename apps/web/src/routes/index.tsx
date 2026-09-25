import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
			<div className="space-y-4">
				<h1 className="font-heading text-4xl">OpenCut</h1>
				<p className="text-sm text-muted-foreground">
					Free, open source video editor — abhi browser me hi chalta hai.
				</p>
				<Link
					to="/editor"
					className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80"
				>
					Editor kholo
				</Link>
			</div>
		</main>
	);
}
