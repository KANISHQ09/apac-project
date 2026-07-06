import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/shared/services/logger";
import { ErrorState } from "./ErrorState";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <ErrorState
              message={this.state.error?.message || "Something went wrong while rendering this page."}
              onRetry={this.handleReload}
              retryText="Reload Page"
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
