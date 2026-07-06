import { documentRepository } from "../repositories/documentRepository";
import { DocumentLockerDetails } from "@/shared/types/domain/Document";
import { UserDocument, UploadProgressStep } from "../types";
import { pdfFirstPageToJpeg } from "@/features/ai-assistant/services/aiService";
import { logger } from "@/shared/services/logger";

export const documentService = {
  /**
   * Fetches document locker details for a specific user, calculating metrics.
   */
  async getLockerDetails(userId: string): Promise<DocumentLockerDetails> {
    const documents = await documentRepository.fetchUserDocuments(userId);

    const totalFiles = documents.length;
    const totalSizeMb = parseFloat(
      documents.reduce((acc, doc) => acc + Number(doc.file_size_mb || 0), 0).toFixed(2)
    );

    return {
      totalFiles,
      totalSizeMb,
      documents: documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        file_path: doc.file_path,
        file_size_mb: Number(doc.file_size_mb),
        document_type: doc.document_type,
        extracted_text: doc.extracted_text,
        ai_summary: doc.ai_summary,
        metadata: doc.metadata,
        created_at: doc.created_at,
      })),
    };
  },

  /**
   * Processes a document via the NVIDIA NIM VLM first, and uploads + saves only if accepted.
   */
  async uploadAndAnalyze(
    userId: string,
    file: File,
    onProgress: (step: UploadProgressStep) => void
  ): Promise<UserDocument> {
    try {
      // 1. VLM Text Reading & OCR Extraction
      onProgress("reading");
      
      let fileBase64: string;
      let effectiveMimeType: string;

      if (file.type === "application/pdf") {
        const rasterized = await pdfFirstPageToJpeg(file);
        fileBase64 = rasterized.base64;
        effectiveMimeType = rasterized.mimeType;
      } else {
        fileBase64 = await fileToBase64(file);
        effectiveMimeType = file.type;
      }

      onProgress("extracting");
      const aiResult = await callAnalyzeDocumentEdgeFunction(fileBase64, effectiveMimeType, file.name);

      // Check validation gate
      if (!aiResult.supported) {
        throw new Error(
          aiResult.rejection_reason || 
          "This image is not a recognized government document. Selfies, landscape photos, memes, or general non-govt files are not allowed."
        );
      }

      // Check Expiry State
      onProgress("checking");

      // Summarize Details
      onProgress("summarizing");

      // 2. Upload original file to Storage
      onProgress("uploading");
      const filePath = await documentRepository.uploadDocumentFile(userId, file.name, file);

      // 3. Save metadata record to database
      onProgress("saving");
      const fileSizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2));
      
      const recordPayload = {
        user_id: userId,
        name: file.name,
        file_path: filePath,
        file_size_mb: fileSizeMb,
        document_type: aiResult.document_type || "other",
        status: aiResult.status || "uploaded",
        extracted_text: aiResult.ocr_text || null,
        ai_summary: aiResult.ai_summary || null,
        metadata: {
          full_name: aiResult.metadata?.holder_name || null,
          document_number: aiResult.metadata?.document_number || null,
          dob_or_issuance: aiResult.metadata?.dob_or_issuance || null,
          expiry_date: aiResult.metadata?.expiry_date || null,
          address: aiResult.metadata?.address || null,
          issuing_authority: aiResult.metadata?.issuing_authority || null,
        },
      };

      const insertedRecord = await documentRepository.insertDocumentRecord(recordPayload);
      onProgress("complete");
      return insertedRecord;
    } catch (err) {
      logger.error("Error in uploadAndAnalyze document service:", err);
      throw err;
    }
  },

  /**
   * Deletes a document record and its storage asset.
   */
  async deleteDocument(id: string, filePath: string): Promise<void> {
    await documentRepository.deleteDocumentRecord(id, filePath);
  },

  /**
   * Generates a signed preview URL for a secure private document.
   */
  async getDownloadUrl(filePath: string): Promise<string> {
    return documentRepository.getDocumentSignedUrl(filePath);
  }
};

/**
 * Converts a File object to a Base64 encoded string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Calls the analyze-document Edge Function hosted on Form KB instance.
 */
async function callAnalyzeDocumentEdgeFunction(
  fileBase64: string,
  mimeType: string,
  filename: string
): Promise<any> {
  const formKbUrl = import.meta.env.VITE_FORM_KB_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const formKbAnonKey = import.meta.env.VITE_FORM_KB_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${formKbUrl}/functions/v1/analyze-document`, {
    method: "POST",
    headers: {
      "apikey": formKbAnonKey,
      "Authorization": `Bearer ${formKbAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileBase64,
      mimeType,
      filename,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.message || err.error || "Document analysis failed");
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error("Invalid document analysis output from AI service");
  }

  return result.data;
}
