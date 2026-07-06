import React from "react";

export interface DocumentMetadata {
  full_name?: string | null;
  document_number?: string | null;
  dob_or_issuance?: string | null;
  expiry_date?: string | null;
  address?: string | null;
  issuing_authority?: string | null;
}

export interface DocumentType {
  id?: string;
  icon?: React.ReactNode;
  name: string;
  status: "verified" | "expires_soon" | "uploaded" | string;
  file_path?: string;
  file_size_mb?: number;
  document_type?: string;
  extracted_text?: string | null;
  ai_summary?: string | null;
  metadata?: DocumentMetadata;
  created_at?: string;
}

export interface DocumentLockerDetails {
  totalFiles: number;
  totalSizeMb: number;
  documents: DocumentType[];
}
