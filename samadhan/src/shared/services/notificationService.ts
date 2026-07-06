import { logger } from "@/shared/services/logger";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  module: 'documents' | 'issues' | 'schemes' | 'general';
  createdAt: Date;
  read: boolean;
}

type NotificationListener = (notifications: AppNotification[]) => void;

class NotificationRegistry {
  private notifications: AppNotification[] = [];
  private listeners = new Set<NotificationListener>();

  /**
   * Returns all current notifications.
   */
  getNotifications(): AppNotification[] {
    return [...this.notifications];
  }

  /**
   * Adds a new notification and triggers subscribers.
   */
  addNotification(notification: Omit<AppNotification, "id" | "createdAt" | "read">): void {
    const newNotification: AppNotification = {
      ...notification,
      id: `${notification.module}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      read: false,
    };
    this.notifications = [newNotification, ...this.notifications];
    this.notify();
  }

  /**
   * Clears all notifications belonging to a specific module.
   */
  clearModuleNotifications(module: 'documents' | 'issues' | 'schemes' | 'general'): void {
    const originalLength = this.notifications.length;
    this.notifications = this.notifications.filter((n) => n.module !== module);
    if (this.notifications.length !== originalLength) {
      this.notify();
    }
  }

  /**
   * Marks a specific notification as read.
   */
  markAsRead(id: string): void {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (n.id === id && !n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });
    if (changed) {
      this.notify();
    }
  }

  /**
   * Marks all current notifications as read.
   */
  markAllAsRead(): void {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (!n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });
    if (changed) {
      this.notify();
    }
  }

  /**
   * Subscribes to notification registry updates.
   * Returns an unsubscribe function.
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state to new subscriber
    listener(this.getNotifications());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const list = this.getNotifications();
    logger.info("Notifying subscribers of notification changes. Count:", list.length);
    this.listeners.forEach((listener) => {
      try {
        listener(list);
      } catch (err) {
        logger.error("Error in notification subscriber listener:", err);
      }
    });
  }
}

export const notificationService = new NotificationRegistry();
