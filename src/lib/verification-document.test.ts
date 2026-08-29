import { describe, expect, it } from "vitest";
import {
  maximumVerificationDocumentBytes,
  safeFilename,
  verificationDocumentError
} from "./verification-document";

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
});
