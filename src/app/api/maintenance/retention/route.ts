import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request){
  if(!isCronAuthorized(request)) return Response.json({error:"Unauthorized"},{status:401});
  const supabase=createAdminClient();
  const {data:documents,error}=await supabase.from("duel_documents").select("id,storage_path").is("deleted_at",null).lt("retention_until",new Date().toISOString()).limit(100);
  if(error) return Response.json({error:"Retention query failed"},{status:500});
  if(!documents?.length) return Response.json({deleted:0});
  const {error:storageError}=await supabase.storage.from("duel-verifications").remove(documents.map((document)=>document.storage_path));
  if(storageError) return Response.json({error:"Storage deletion failed"},{status:502});
  const {error:updateError}=await supabase.from("duel_documents").update({deleted_at:new Date().toISOString()}).in("id",documents.map((document)=>document.id));
  if(updateError) return Response.json({error:"Metadata reconciliation failed"},{status:500});
  return Response.json({deleted:documents.length});
}
