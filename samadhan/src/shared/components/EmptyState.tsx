import { ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "./ui/button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = <FolderOpen className="w-12 h-12 text-muted-foreground" />,
  title,
  description,
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border border-border">
      <div className="mb-4">{icon}</div>
      <h3 className="font-semibold text-foreground text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">{description}</p>
      {actionText && onAction && (
        <Button onClick={onAction} className="gap-2">
          {actionText}
        </Button>
      )}
    </div>
  );
}
