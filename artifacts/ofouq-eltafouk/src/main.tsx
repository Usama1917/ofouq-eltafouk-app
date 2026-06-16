import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import "./index.css";

// review F-02: root error boundary so any uncaught render error shows a friendly
// Arabic fallback with a reload button instead of a blank white screen.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
