import { ImageResponse } from "next/og";

export const alt = "VendorDuel — Make software vendors compete";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:72,background:"#171713",color:"#fffdf7",fontFamily:"Arial"}}><div style={{display:"flex",fontSize:28,fontWeight:800,color:"#d9ff43"}}>V / VENDORDUEL</div><div style={{display:"flex",fontSize:92,fontWeight:800,letterSpacing:"-6px",lineHeight:.95}}>Make software vendors<br/>compete for you.</div><div style={{display:"flex",fontSize:24,color:"#aaa89e"}}>Verified spend · Sealed offers · Buyer chooses</div></div>, size);
}
