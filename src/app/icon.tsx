import { ImageResponse } from "next/og";
export const size={width:512,height:512};export const contentType="image/png";
export default function Icon(){return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#171713",color:"#d9ff43",fontSize:340,fontFamily:"Georgia",fontStyle:"italic",fontWeight:700}}>V</div>,size)}
