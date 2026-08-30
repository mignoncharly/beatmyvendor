import { isCronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request){
  if(!isCronAuthorized(request)) return Response.json({error:"Unauthorized"},{status:401});
  const supabase=createAdminClient();
  const {data:documents,error}=await supabase.from("duel_documents").select("id,storage_path").is("deleted_at",null).lt("retention_until",new Date().toISOString()).limit(100);
  if(error){ const reference=reportError("maintenance.retention.query",error); return Response.json({error:"Retention query failed",reference},{status:500}); }
  if(!documents?.length) return Response.json({deleted:0});
  const {error:storageError}=await supabase.storage.from("duel-verifications").remove(documents.map((document)=>document.storage_path));
  if(storageError){ const reference=reportError("maintenance.retention.storage",storageError,{count:documents.length}); return Response.json({error:"Storage deletion failed",reference},{status:502}); }
  const {error:updateError}=await supabase.from("duel_documents").update({deleted_at:new Date().toISOString()}).in("id",documents.map((document)=>document.id));
  if(updateError){ const reference=reportError("maintenance.retention.reconcile",updateError,{count:documents.length}); return Response.json({error:"Metadata reconciliation failed",reference},{status:500}); }
  return Response.json({deleted:documents.length});
}
