export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  issue_updates: boolean;
  scheme_alerts: boolean;
  document_reminders: boolean;
  weekly_digest: boolean;
  created_at: string;
  updated_at: string;
}
