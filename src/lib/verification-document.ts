const acceptedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export const maximumVerificationDocumentBytes = 10 * 1024 * 1024;

type VerificationDocument = Pick<File, "size" | "type">;

export function verificationDocumentError(file: VerificationDocument | null) {
  if (!file) return null;
  if (!acceptedTypes.has(file.type) || file.size > maximumVerificationDocumentBytes) {
    return "Spend proof must be a PDF, JPG, PNG, or WebP file no larger than 10 MB.";
  }
  return null;
}

export function safeFilename(name: string) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-120) || "verification-document";
}
