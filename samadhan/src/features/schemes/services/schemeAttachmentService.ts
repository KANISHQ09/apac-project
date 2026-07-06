export interface SchemeAttachment {
  schemeId: string;
  documentType: string;
  fileId: string;
  filePath: string;
  fileName: string;
  attachedAt: string;
}

class SchemeAttachmentRegistry {
  private STORAGE_KEY = "samadhan_scheme_attachments";
  
  /**
   * Retrieves all active scheme attachments.
   */
  getAttachments(): SchemeAttachment[] {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Retrieves attachments bound to a specific scheme.
   */
  getAttachmentsForScheme(schemeId: string): SchemeAttachment[] {
    return this.getAttachments().filter((a) => a.schemeId === schemeId);
  }

  /**
   * Binds a Document Locker file to a scheme required document type.
   */
  attachFileToScheme(
    schemeId: string,
    documentType: string,
    fileId: string,
    filePath: string,
    fileName: string
  ): void {
    if (typeof window === "undefined") return;
    const list = this.getAttachments().filter(
      (a) => !(a.schemeId === schemeId && a.documentType === documentType)
    );
    list.push({
      schemeId,
      documentType,
      fileId,
      filePath,
      fileName,
      attachedAt: new Date().toISOString(),
    });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("scheme_attachments_changed"));
  }

  /**
   * Removes a document binding from a scheme.
   */
  detachFileFromScheme(schemeId: string, documentType: string): void {
    if (typeof window === "undefined") return;
    const list = this.getAttachments().filter(
      (a) => !(a.schemeId === schemeId && a.documentType === documentType)
    );
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("scheme_attachments_changed"));
  }
}

export const schemeAttachmentService = new SchemeAttachmentRegistry();
