export interface DocumentMetadata {
  full_name?: string | null;
  document_number?: string | null;
  dob_or_issuance?: string | null;
  expiry_date?: string | null;
  address?: string | null;
  issuing_authority?: string | null;
}

export interface UserDocument {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_size_mb: number;
  document_type: string;
  status: "verified" | "expires_soon" | "uploaded";
  extracted_text: string | null;
  ai_summary: string | null;
  metadata: DocumentMetadata;
  created_at: string;
  updated_at: string;
}

export type UploadProgressStep = 
  | 'idle' 
  | 'uploading' 
  | 'reading' 
  | 'extracting' 
  | 'checking' 
  | 'summarizing' 
  | 'saving' 
  | 'complete';
