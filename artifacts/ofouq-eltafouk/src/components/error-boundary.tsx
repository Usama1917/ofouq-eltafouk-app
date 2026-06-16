import { Component, type ErrorInfo, type ReactNode } from "react";

// review F-02: a real React error boundary so an uncaught render error shows a
// friendly Arabic fallback instead of a blank white screen. Class component is
// required — there is no hook equivalent for getDerivedStateFromError.

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; defaults to the full-screen Arabic message. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trace for debugging; no PII is logged.
    console.error("ErrorBoundary caught an error:", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          dir="rtl"
          className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#F4F1E9] p-8 text-center"
        >
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold text-foreground">
              حدث خطأ غير متوقع
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              نعتذر عن هذا الخلل. من فضلك أعِد تحميل الصفحة للمتابعة.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="btn-primary text-sm"
          >
            أعِد التحميل
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
