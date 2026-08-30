import { describe, expect, it } from "vitest";
import {
  detectVerificationDocumentType,
  inspectVerificationDocument,
  maximumVerificationDocumentBytes,
  safeFilename,
  verificationDocumentError
} from "./verification-document";

const signatures: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
};

function fileOf(type: string, bytes: number[]) {
  return new File([new Uint8Array(bytes)], "proof", { type });
}

describe("verification documents", () => {
  it.each(["application/pdf", "image/jpeg", "image/png", "image/webp"])(
    "accepts supported content type %s",
    (type) => {
      expect(verificationDocumentError({ type, size: maximumVerificationDocumentBytes })).toBeNull();
    }
  );

  it("rejects executable and mislabeled content types", () => {
    expect(verificationDocumentError({ type: "text/html", size: 100 })).toMatch(/PDF, JPG, PNG, or WebP/);
    expect(verificationDocumentError({ type: "application/x-msdownload", size: 100 })).toMatch(/PDF, JPG, PNG, or WebP/);
  });

  it("rejects files larger than ten megabytes", () => {
    expect(
      verificationDocumentError({
        type: "application/pdf",
        size: maximumVerificationDocumentBytes + 1
      })
    ).toMatch(/10 MB/);
  });

  it("normalizes hostile filenames and enforces the storage length limit", () => {
    expect(safeFilename("../../Quarter 4 Invoice<script>.PDF")).toBe("..-..-quarter-4-invoice-script-.pdf");
    expect(safeFilename("🔥")).toBe("verification-document");
    expect(safeFilename("a".repeat(200) + ".pdf")).toHaveLength(120);
  });

  it.each(Object.entries(signatures))("detects %s from magic bytes", (type, bytes) => {
    expect(detectVerificationDocumentType(new Uint8Array(bytes))).toBe(type);
  });

  it("returns null for content that matches no supported signature", () => {
    expect(detectVerificationDocumentType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // MZ (exe)
    expect(detectVerificationDocumentType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBeNull(); // <html
  });

  it.each(Object.entries(signatures))("accepts a genuine %s upload", async (type, bytes) => {
    const result = await inspectVerificationDocument(fileOf(type, bytes));
    expect(result).toEqual({ type });
  });

  it("rejects a file whose declared type does not match its bytes", async () => {
    const spoofed = fileOf("application/pdf", signatures["image/png"]);
    const result = await inspectVerificationDocument(spoofed);
    expect(result).toEqual({ error: expect.stringMatching(/genuine PDF/) });
  });

  it("rejects an executable renamed to a PDF", async () => {
    const result = await inspectVerificationDocument(fileOf("application/pdf", [0x4d, 0x5a, 0x90, 0x00]));
    expect(result).toEqual({ error: expect.stringMatching(/genuine PDF/) });
  });
});
