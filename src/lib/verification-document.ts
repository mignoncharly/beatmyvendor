export type VerificationDocumentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const acceptedTypes = new Set<string>(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
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

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

// Content-sniff the file header instead of trusting the browser-declared MIME
// type. Returns the canonical type detected from magic bytes, or null when the
// header does not match a supported format.
export function detectVerificationDocumentType(header: Uint8Array): VerificationDocumentType | null {
  if (startsWith(header, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(header, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(header, [0x52, 0x49, 0x46, 0x46]) && startsWith(header, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

// Verifies declared type, size, and actual file content. Returns { error } when
// the file should be rejected, or { type } with the canonical, content-verified
// MIME type to persist. Never trusts file.type as evidence of content.
export async function inspectVerificationDocument(
  file: File
): Promise<{ error: string } | { type: VerificationDocumentType }> {
  const declaredError = verificationDocumentError(file);
  if (declaredError) return { error: declaredError };
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectVerificationDocumentType(header);
  if (!detected || detected !== file.type) {
    return { error: "Spend proof must be a genuine PDF, JPG, PNG, or WebP file. Re-export it and try again." };
  }
  return { type: detected };
}
