import { supabase } from "@/integrations/supabase/client";
import { UserDocument } from "../types";
import { logger } from "@/shared/services/logger";

export const documentRepository = {
  /**
   * Fetches all documents belonging to the authenticated user.
   */
  async fetchUserDocuments(userId: string): Promise<UserDocument[]> {
    const { data, error } = await supabase
      .from("user_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching user documents:", error);
      throw error;
    }

    return (data || []) as unknown as UserDocument[];
  },

  /**
   * Uploads a physical file to the secure private 'user-documents' storage bucket.
   */
  async uploadDocumentFile(userId: string, pathName: string, file: File): Promise<string> {
    const filePath = `${userId}/${Date.now()}_${pathName}`;
    const { data, error } = await supabase.storage
      .from("user-documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      logger.error("Error uploading document file to storage:", error);
      throw error;
    }

    return data.path;
  },

  /**
   * Inserts the document metadata record into the database.
   */
  async insertDocumentRecord(record: Omit<UserDocument, "id" | "created_at" | "updated_at">): Promise<UserDocument> {
    const { data, error } = await supabase
      .from("user_documents")
      .insert(record)
      .select("*")
      .single();

    if (error) {
      logger.error("Error inserting document record:", error);
      throw error;
    }

    return data as unknown as UserDocument;
  },

  /**
   * Deletes a document metadata record and its corresponding storage file.
   */
  async deleteDocumentRecord(id: string, filePath: string): Promise<void> {
    // Delete database record first
    const { error: dbError } = await supabase
      .from("user_documents")
      .delete()
      .eq("id", id);

    if (dbError) {
      logger.error("Error deleting database document record:", dbError);
      throw dbError;
    }

    // Delete storage file
    const { error: storageError } = await supabase.storage
      .from("user-documents")
      .remove([filePath]);

    if (storageError) {
      logger.error("Error removing document file from storage:", storageError);
      // We log the error but don't fail, as the database record is already gone
    }
  },

  /**
   * Generates a signed URL to securely preview/download a private document.
   */
  async getDocumentSignedUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from("user-documents")
      .createSignedUrl(filePath, 300); // 5 minutes expiry

    if (error) {
      logger.error("Error creating signed URL for document:", error);
      throw error;
    }

    return data.signedUrl;
  }
};
