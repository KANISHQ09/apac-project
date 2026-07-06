import { DocumentType } from "@/shared/types/domain/Document";
import { notificationService } from "@/shared/services/notificationService";

/**
 * Dynamically evaluates documents to generate central notifications.
 * Runs locally on metadata changes without hitting DB or AI API.
 */
export function generateDocumentNotifications(documents: DocumentType[]): void {
  // 1. Clear previous document-related notifications first
  notificationService.clearModuleNotifications("documents");

  // Helper arrays for document mapping
  const docTypes = documents.map((d) => d.document_type?.toLowerCase() || "");
  const hasAadhaar = docTypes.includes("aadhaar");
  const hasPan = docTypes.includes("pan");
  const hasIncome = docTypes.includes("income");

  // 2. Identity completion notifications
  if (!hasAadhaar) {
    notificationService.addNotification({
      title: "Identity Profile Incomplete",
      message: "Aadhaar Card is missing from your locker. Upload it to enable quick verification.",
      type: "error",
      module: "documents",
    });
  }

  if (!hasPan) {
    notificationService.addNotification({
      title: "PAN Card Missing",
      message: "PAN Card is missing. Several government schemes require PAN for tax or banking verification.",
      type: "warning",
      module: "documents",
    });
  }

  // 3. Support documents notifications
  if (!hasIncome) {
    notificationService.addNotification({
      title: "Income Certificate Missing",
      message: "Income Certificate not found. This document is required to qualify for financial subsidies.",
      type: "info",
      module: "documents",
    });
  }

  // 4. Expiry checks
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const doc of documents) {
    const expiryStr = doc.metadata?.expiry_date;
    if (!expiryStr) continue;

    const expiryDate = new Date(expiryStr);
    expiryDate.setHours(0, 0, 0, 0);

    if (isNaN(expiryDate.getTime())) continue;

    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1024 * 60 * 60 * 24));

    if (diffDays < 0) {
      notificationService.addNotification({
        title: `${doc.name} Expired`,
        message: `Your ${doc.name} has expired. Please upload a renewed version immediately.`,
        type: "error",
        module: "documents",
      });
    } else if (diffDays <= 30) {
      notificationService.addNotification({
        title: `${doc.name} Expiring Soon`,
        message: `Your ${doc.name} expires in ${diffDays} days (on ${expiryStr}). Prepare for renewal.`,
        type: "warning",
        module: "documents",
      });
    }
  }
}
