/**
 * Standalone entry: renders the editor without TanStack Start so the app can be
 * built into a single HTML file and opened straight from disk (file://).
 * Everything still runs locally in the browser — no server, no uploads.
 */
import { createRoot } from "react-dom/client";

import { VideoEditor } from "./components/editor/video-editor";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(<VideoEditor />);
