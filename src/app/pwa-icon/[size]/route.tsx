import { ImageResponse } from "next/og";

const allowedSizes = new Set([192, 512]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;
  const size = Number(rawSize);
  if (!allowedSizes.has(size)) return new Response("Not found", { status: 404 });

  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#171713", color: "#d9ff43", fontSize: Math.round(size * .56), fontFamily: "Georgia", fontStyle: "italic", fontWeight: 700, border: `${Math.round(size * .1)}px solid #171713` }}>V</div>, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" }
  });
}
