import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/shared/services/logger";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface Props {
  children: ReactNode;
  /** Human-readable label for the panel, used in the fallback UI */
  panelName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * PanelErrorBoundary — local isolation for high-risk operational panels.
 *
 * A failure in ONE panel (e.g., JointClosurePanel, CoordinationPlanReview)
 * must NOT destroy the AdminPage, the header, the issue queue, or other panels.
 *
 * Usage:
 *   <PanelErrorBoundary panelName="Joint Closure">
 *     <JointClosurePanel ... />
 *   </PanelErrorBoundary>
 */
export class PanelErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(
      `[PanelErrorBoundary] Panel "${this.props.panelName ?? "unknown"}" crashed:`,
      error,
      errorInfo
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 my-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-400">
                {this.props.panelName
                  ? `${this.props.panelName} panel encountered an error`
                  : "A panel encountered an error"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {this.state.error?.message || "An unexpected error occurred."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 text-xs h-7 border-red-500/30 text-red-400 hover:text-red-300"
              onClick={this.handleRetry}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
