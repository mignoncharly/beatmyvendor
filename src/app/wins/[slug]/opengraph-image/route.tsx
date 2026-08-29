import { ImageResponse } from "next/og";
import { getPublicWin, money } from "@/lib/public-marketplace";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const win = await getPublicWin(slug);
  if (!win) return new Response("Not found", { status: 404 });
  const saving = win.current_annual_price - win.final_annual_price;
  return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:70,background:"#171713",color:"#fffdf7",fontFamily:"Arial"}}><div style={{display:"flex",fontSize:25,fontWeight:800,color:"#d9ff43"}}>VENDORDUEL · VERIFIED DEAL ✓</div><div style={{display:"flex",flexDirection:"column"}}><div style={{display:"flex",fontSize:72,fontWeight:900}}>{win.current_software_name.toUpperCase()} GOT BEAT</div><div style={{display:"flex",fontSize:112,fontWeight:900,letterSpacing:"-7px",color:"#d9ff43"}}>{money(saving,win.currency)} saved</div></div><div style={{display:"flex",fontSize:26,color:"#aaa89e"}}>Confirmed annual saving · {win.country_code} · {win.seats} seats</div></div>, { width:1200,height:630 });
}
