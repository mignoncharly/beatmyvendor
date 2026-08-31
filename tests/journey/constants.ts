// Fixed identifiers shared by the journey seed (supabase/tests/journey_seed.sql)
// and the specs. Auth users are created by email in global-setup; the marketplace
// rows use these stable UUIDs so specs can assert against known state.
export const emails = {
  admin: "journey-admin@beatmyvendor.invalid",
  buyer: "journey-buyer@beatmyvendor.invalid",
  vendor: "journey-vendor@beatmyvendor.invalid",
} as const;

export const ids = {
  buyerOrg: "10000000-0000-4000-8000-0000000000a1",
  vendorOrg: "10000000-0000-4000-8000-0000000000a3",
  duel: "30000000-0000-4000-8000-0000000000a1",
  offer: "40000000-0000-4000-8000-0000000000a1",
  selection: "50000000-0000-4000-8000-0000000000a1",
} as const;

// The buyer identity that must stay hidden from the vendor until a paid intro.
export const buyerCompanyName = "Journey Buyer";
export const buyerContactEmail = "journey-buyer-contact@beatmyvendor.invalid";
