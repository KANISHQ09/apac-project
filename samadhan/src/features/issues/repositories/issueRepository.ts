import { supabase } from "@/integrations/supabase/client";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { SupportResponse } from "@/shared/contracts/SupportResponse";
import { BUCKETS } from "@/shared/constants/buckets";
import { validateFileSignature } from "@/shared/validation/magicBytes";
import { APIError, StorageError, ValidationError } from "@/shared/errors/errors";

export const issueRepository = {
  async fetchAllIssues(limitCount = 20): Promise<IssueResponse[]> {
    const { data, error } = await supabase
      .from("reported_issues")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limitCount);

    if (error) throw new APIError(error.message, undefined, error);
    return data as IssueResponse[];
  },

  async fetchAllIssuesForMap(): Promise<IssueResponse[]> {
    const { data, error } = await supabase
      .from("reported_issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new APIError(error.message, undefined, error);
    return data as IssueResponse[];
  },

  async fetchIssueById(issueId: string): Promise<IssueResponse> {
    const { data, error } = await supabase
      .from("reported_issues")
      .select("*")
      .eq("id", issueId)
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return data as IssueResponse;
  },

  async fetchUserIssues(userId: string): Promise<IssueResponse[]> {
    const { data, error } = await supabase
      .from("reported_issues")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new APIError(error.message, undefined, error);
    return data as IssueResponse[];
  },

  async insertIssue(issue: Omit<IssueResponse, "id" | "created_at" | "updated_at" | "supports_count">): Promise<IssueResponse> {
    const { data, error } = await supabase
      .rpc("create_civic_case_with_participation", {
        p_user_id: issue.user_id,
        p_title: issue.title,
        p_description: issue.description,
        p_category: issue.category,
        p_location: issue.location,
        p_latitude: issue.latitude,
        p_longitude: issue.longitude,
        p_image_urls: issue.image_urls,
        p_data_origin: issue.data_origin || "citizen_live",
      });

    if (error) throw new APIError(error.message, undefined, error);
    
    const createdIssue = data as IssueResponse;
    const updatePayload: any = {};
    if (issue.ai_provider) updatePayload.ai_provider = issue.ai_provider;
    if (issue.ai_model) updatePayload.ai_model = issue.ai_model;
    if (issue.ai_confidence !== undefined && issue.ai_confidence !== null) updatePayload.ai_confidence = issue.ai_confidence;
    if (issue.ai_detected_issue) updatePayload.ai_detected_issue = issue.ai_detected_issue;
    if (issue.ai_reason) updatePayload.ai_reason = issue.ai_reason;
    if (issue.ai_risk) updatePayload.ai_risk = issue.ai_risk;
    if (issue.ai_priority) updatePayload.ai_priority = issue.ai_priority;
    if (issue.ai_category) updatePayload.ai_category = issue.ai_category;
    if (issue.ai_supporting_departments) updatePayload.ai_supporting_departments = issue.ai_supporting_departments;
    if (issue.ai_requires_multiple_departments !== undefined && issue.ai_requires_multiple_departments !== null) {
      updatePayload.ai_requires_multiple_departments = issue.ai_requires_multiple_departments;
    }
    if (issue.ai_estimated_response_time) updatePayload.ai_estimated_response_time = issue.ai_estimated_response_time;
    if (issue.ai_detection_time_ms !== undefined && issue.ai_detection_time_ms !== null) {
      updatePayload.ai_detection_time_ms = issue.ai_detection_time_ms;
    }
    if (issue.ai_citizen_corrected !== undefined && issue.ai_citizen_corrected !== null) {
      updatePayload.ai_citizen_corrected = issue.ai_citizen_corrected;
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        const { data: updatedData, error: updateError } = await supabase
          .from("reported_issues")
          .update(updatePayload)
          .eq("id", createdIssue.id)
          .select("*")
          .single();
        
        if (!updateError && updatedData) {
          return updatedData as IssueResponse;
        }
      } catch (upErr) {
        console.warn("Failed to update post-insert telemetry columns:", upErr);
      }
    }

    return createdIssue;
  },

  async uploadIssueImage(userId: string, file: File): Promise<string> {
    // 1. File size check (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new ValidationError("File size exceeds the 5MB limit");
    }

    // 2. MIME type whitelist check
    const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED_MIMES.includes(file.type)) {
      throw new ValidationError("Unsupported image MIME type");
    }

    // 3. Magic Byte signature validation
    const isValidSignature = await validateFileSignature(file, ALLOWED_MIMES);
    if (!isValidSignature) {
      throw new ValidationError("File signature mismatch. Disguised executable or invalid image file detected.");
    }

    // 4. Sanitize and generate unique path
    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
    let ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
    if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      ext = "jpg"; // Default fallback to safe image extension
    }

    const uniqueId = typeof crypto.randomUUID === "function" 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-]/g, "");
    const path = `${sanitizedUserId}/${uniqueId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKETS.ISSUE_IMAGES)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw new StorageError(uploadError.message, uploadError);

    const { data } = supabase.storage
      .from(BUCKETS.ISSUE_IMAGES)
      .getPublicUrl(path);

    return data.publicUrl;
  },

  async fetchUserSupports(userId: string): Promise<SupportResponse[]> {
    const { data, error } = await supabase
      .from("issue_supports")
      .select("id, issue_id, user_id, created_at")
      .eq("user_id", userId);

    if (error) throw new APIError(error.message, undefined, error);
    return data as SupportResponse[];
  },

  async fetchUserSupportedIssues(userId: string): Promise<IssueResponse[]> {
    const { data, error } = await supabase
      .from("issue_supports")
      .select("reported_issues(*)")
      .eq("user_id", userId);

    if (error) throw new APIError(error.message, undefined, error);
    
    const rawList = (data || []) as any[];
    const issues = rawList
      .map((item) => item.reported_issues)
      .filter((issue) => !!issue);

    return issues as IssueResponse[];
  },


  async addSupport(issueId: string, userId: string): Promise<SupportResponse> {
    const { data, error } = await supabase
      .from("issue_supports")
      .insert({ issue_id: issueId, user_id: userId })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return data as SupportResponse;
  },

  async removeSupport(issueId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("issue_supports")
      .delete()
      .eq("issue_id", issueId)
      .eq("user_id", userId);

    if (error) throw new APIError(error.message, undefined, error);
  },

  subscribeToIssuesChange(onChange: (payload: any) => void): () => void {
    const channel = supabase
      .channel("reported-issues-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reported_issues",
        },
        onChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
