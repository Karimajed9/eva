import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[jarvis] interface error", error.message, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="failure" role="alert">
          <p>The interface hit an unexpected error. Restart JARVIS.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
