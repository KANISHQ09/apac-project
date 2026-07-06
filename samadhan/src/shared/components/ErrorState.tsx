import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryText?: string;
}

export function ErrorState({
  message = "An unexpected error occurred.",
  onRetry,
  retryText = "Retry",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-destructive/5 rounded-2xl border border-destructive/20">
      <AlertCircle className="w-12 h-12 text-destructive mb-4" />
      <h3 className="font-semibold text-foreground text-lg mb-2">Error occurred</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
          {retryText}
        </Button>
      )}
    </div>
  );
}
