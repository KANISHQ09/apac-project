export interface IssueResponse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  image_urls: string[] | null;
  supports_count: number | null;
  master_issue_id?: string | null;
  created_at: string;
  updated_at: string;
}
