import { useEffect } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

// The rewrite has no landing page yet, so send visitors straight to the editor.
// This is a client-side redirect on purpose: an SSR 307 would be built from the
// server's own address (127.0.0.1) and break behind the preview proxy.
function Home() {
	const navigate = useNavigate();

	useEffect(() => {
		void navigate({ to: "/editor", replace: true });
	}, [navigate]);

	return (
		<main className="grid min-h-dvh place-items-center bg-background text-foreground">
			<Link
				to="/editor"
				className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80"
			>
				Editor kholo
			</Link>
		</main>
	);
}
