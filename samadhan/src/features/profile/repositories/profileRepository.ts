import { supabase } from "@/integrations/supabase/client";
import { ProfileResponse } from "@/shared/contracts/ProfileResponse";
import { APIError } from "@/shared/errors/errors";

export const profileRepository = {
  async fetchProfile(userId: string): Promise<ProfileResponse> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new APIError(error.message, undefined, error);
    
    if (!data) {
      // Auto-create profile if missing
      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .insert({ user_id: userId, full_name: "User" })
        .select()
        .single();
        
      if (insertError) throw new APIError(insertError.message, undefined, insertError);
      return inserted as ProfileResponse;
    }
    
    return data as ProfileResponse;
  },

  async updateProfile(userId: string, profile: Partial<Omit<ProfileResponse, "id" | "user_id" | "created_at" | "updated_at">>): Promise<ProfileResponse> {
    const { data, error } = await supabase
      .from("profiles")
      .update(profile)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return data as ProfileResponse;
  },

  async fetchNotificationPreferences(userId: string) {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new APIError(error.message, undefined, error);
    
    if (!data) {
      // Auto-create notification preferences if missing
      const { data: inserted, error: insertError } = await supabase
        .from("notification_preferences")
        .insert({ user_id: userId })
        .select()
        .single();
        
      if (insertError) throw new APIError(insertError.message, undefined, insertError);
      return inserted;
    }
    
    return data;
  },

  async updateNotificationPreferences(userId: string, key: string, value: boolean) {
    const { data, error } = await supabase
      .from("notification_preferences")
      .update({ [key]: value })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return data;
  },
};
