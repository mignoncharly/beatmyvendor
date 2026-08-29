export type Software = { slug: string; name: string; website: string; summary: string; bestFor: string };

export const softwareCatalog: Software[] = [
  { slug: "zendesk", name: "Zendesk", website: "https://www.zendesk.com", summary: "A broad customer-service suite for ticketing, messaging, help centers, and workforce operations.", bestFor: "Established support teams needing a wide platform" },
  { slug: "intercom", name: "Intercom", website: "https://www.intercom.com", summary: "A customer-service platform centered on messenger support, automation, and AI-assisted conversations.", bestFor: "Digital products with conversational support" },
  { slug: "freshdesk", name: "Freshdesk", website: "https://www.freshworks.com/freshdesk/", summary: "Omnichannel helpdesk software with ticketing, automation, knowledge-base, and reporting tools.", bestFor: "Teams seeking a straightforward helpdesk" },
  { slug: "front", name: "Front", website: "https://front.com", summary: "A shared-inbox and customer-operations platform combining email collaboration with workflow automation.", bestFor: "Collaborative, email-heavy customer teams" },
  { slug: "help-scout", name: "Help Scout", website: "https://www.helpscout.com", summary: "Customer support software focused on shared inboxes, knowledge bases, and a human support experience.", bestFor: "Small and mid-sized service teams" },
  { slug: "zoho-desk", name: "Zoho Desk", website: "https://www.zoho.com/desk/", summary: "Cloud helpdesk software with omnichannel ticketing, automation, and connections to the Zoho suite.", bestFor: "Organizations already using Zoho" },
  { slug: "liveagent", name: "LiveAgent", website: "https://www.liveagent.com", summary: "Helpdesk software bringing tickets, live chat, call-center tools, and social messages into one workspace.", bestFor: "Teams wanting many support channels in one tool" },
  { slug: "gorgias", name: "Gorgias", website: "https://www.gorgias.com", summary: "A helpdesk designed for ecommerce support, with store context, automation, and social-channel workflows.", bestFor: "Ecommerce support teams" },
  { slug: "tidio", name: "Tidio", website: "https://www.tidio.com", summary: "Live-chat, helpdesk, and automation software aimed at fast customer conversations and lead capture.", bestFor: "Smaller teams prioritizing chat and automation" },
  { slug: "hubspot-service-hub", name: "HubSpot Service Hub", website: "https://www.hubspot.com/products/service", summary: "Customer-service software connected to HubSpot's CRM, marketing, and sales platform.", bestFor: "Companies centered on the HubSpot CRM" }
];

export const getSoftware = (slug: string) => softwareCatalog.find((product) => product.slug === slug);
export const alternativesTo = (slug: string) => softwareCatalog.filter((product) => product.slug !== slug);
