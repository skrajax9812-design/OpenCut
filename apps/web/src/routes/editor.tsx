import { createFileRoute } from "@tanstack/react-router";

import { VideoEditor } from "../components/editor/video-editor.tsx";

export const Route = createFileRoute("/editor")({
	// the editor is browser-only: canvas, WebAudio, MediaRecorder
	ssr: false,
	component: Editor,
});

function Editor() {
	return <VideoEditor />;
}
