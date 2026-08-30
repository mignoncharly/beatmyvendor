import type { MetadataRoute } from "next";
export default function manifest():MetadataRoute.Manifest{return {name:"BeatMyVendor",short_name:"BeatMyVendor",description:"Make software vendors compete for you.",start_url:"/",display:"standalone",background_color:"#f2f0e9",theme_color:"#171713",icons:[{src:"/icon",sizes:"512x512",type:"image/png"}]}}
