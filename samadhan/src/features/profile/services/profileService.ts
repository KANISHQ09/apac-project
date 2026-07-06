import { profileRepository } from "../repositories/profileRepository";
import { Profile } from "@/shared/types/domain/Profile";
import { ProfileResponse } from "@/shared/contracts/ProfileResponse";

export const profileService = {
  mapResponseToDomain(raw: ProfileResponse): Profile {
    return {
      id: raw.id,
      userId: raw.user_id,
      fullName: raw.full_name || "",
      phone: raw.phone || "",
      address: raw.address || "",
      city: raw.city || "",
      state: raw.state || "",
      pincode: raw.pincode || "",
      avatarUrl: raw.avatar_url || "",
      preferredLanguage: raw.preferred_language || "en",
      createdAt: new Date(raw.created_at),
    };
  },

  async getProfile(userId: string): Promise<Profile> {
    const raw = await profileRepository.fetchProfile(userId);
    return this.mapResponseToDomain(raw);
  },

  async updateProfile(userId: string, input: Partial<Omit<Profile, "id" | "userId" | "createdAt">>): Promise<Profile> {
    const updatePayload: Partial<Omit<ProfileResponse, "id" | "user_id" | "created_at" | "updated_at">> = {};
    
    if (input.fullName !== undefined) updatePayload.full_name = input.fullName;
    if (input.phone !== undefined) updatePayload.phone = input.phone;
    if (input.address !== undefined) updatePayload.address = input.address;
    if (input.city !== undefined) updatePayload.city = input.city;
    if (input.state !== undefined) updatePayload.state = input.state;
    if (input.pincode !== undefined) updatePayload.pincode = input.pincode;
    if (input.preferredLanguage !== undefined) updatePayload.preferred_language = input.preferredLanguage;
    if (input.avatarUrl !== undefined) updatePayload.avatar_url = input.avatarUrl;

    const raw = await profileRepository.updateProfile(userId, updatePayload);
    return this.mapResponseToDomain(raw);
  },

  async getNotificationPreferences(userId: string) {
    return profileRepository.fetchNotificationPreferences(userId);
  },

  async updateNotificationPreferences(userId: string, key: string, value: boolean) {
    return profileRepository.updateNotificationPreferences(userId, key, value);
  },
};
