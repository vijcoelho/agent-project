import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
