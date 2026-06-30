import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import { installArabicDigitNormalizer } from "./lib/arabic-digits-input";
import "./index.css";

// Staff can type Arabic-Indic digits in any field; the app reads them as Western
// digits so the keyboard language never needs switching for numbers.
installArabicDigitNormalizer();

// review F-02: root error boundary so any uncaught render error shows a friendly
// Arabic fallback with a reload button instead of a blank white screen.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
