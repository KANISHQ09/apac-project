export interface ProfileResponse {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  avatar_url: string | null;
  preferred_language: string | null;
  created_at: string;
  updated_at: string;
}
