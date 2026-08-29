export const legal = {
  version: "2026-08-29",
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "[Legal entity required]",
  representative: process.env.NEXT_PUBLIC_LEGAL_REPRESENTATIVE || "[Authorized representative required]",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "[Registered address required]",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || "privacy@vendorduel.example",
  register: process.env.NEXT_PUBLIC_LEGAL_REGISTER || "[Commercial register and number, if applicable]",
  vatId: process.env.NEXT_PUBLIC_LEGAL_VAT_ID || "[VAT ID, if applicable]",
  authority: process.env.NEXT_PUBLIC_PRIVACY_AUTHORITY || "[Competent data-protection authority required]"
};
