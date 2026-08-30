import type { Metadata } from "next";
import { legal } from "@/lib/legal";
import { absoluteUrl } from "@/lib/site";

export const brandName = "BeatMyVendor";
export const defaultDescription = "Tell us what you use and what you pay. Competitors send better offers. You choose the winner.";
export const defaultSocialImage = "/opengraph-image";

type PublicMetadataOptions = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
  index?: boolean;
};

export function publicMetadata({ title, description, path, type = "website", image = defaultSocialImage, index = true }: PublicMetadataOptions): Metadata {
  const canonical = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
  const socialTitle = path === "/" ? title : `${title} | ${brandName}`;

  return {
    title: path === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1
      }
    },
    openGraph: {
      type,
      siteName: brandName,
      title: socialTitle,
      description,
      url: canonical,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: socialTitle }]
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [{ url: imageUrl, alt: socialTitle }]
    }
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export const organizationId = absoluteUrl("/#organization");
export const websiteId = absoluteUrl("/#website");

export const organizationSchema = {
  "@type": "Organization",
  "@id": organizationId,
  name: brandName,
  legalName: legal.name,
  email: legal.generalEmail,
  address: legal.address,
  url: absoluteUrl("/"),
  logo: absoluteUrl("/icon"),
  description: "A B2B software marketplace where verified buyers invite competing software vendors to submit private replacement offers."
};

export const websiteSchema = {
  "@type": "WebSite",
  "@id": websiteId,
  name: brandName,
  url: absoluteUrl("/"),
  description: defaultDescription,
  publisher: { "@id": organizationId },
  inLanguage: "en"
};

export function webPageSchema({ path, title, description, type = "WebPage" }: { path: string; title: string; description: string; type?: "WebPage" | "AboutPage" | "CollectionPage" }) {
  const url = absoluteUrl(path);
  return {
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { "@id": websiteId },
    about: { "@id": organizationId },
    inLanguage: "en"
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}
