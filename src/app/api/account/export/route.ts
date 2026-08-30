import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export async function GET(){
  const supabase=await createClient();
  const {data:claims}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(!userId) return Response.json({error:"Authentication required"},{status:401});
  const {data:user}=await supabase.from("users").select("id,email,display_name,locale,created_at,updated_at").eq("id",userId).single();
  if(!user) return Response.json({error:"Account not found"},{status:404});
  const {data:memberships}=await supabase.from("organization_members").select("role,created_at,organizations(id,kind,name,slug,website_url,country_code,company_size,created_at)").eq("user_id",userId);
  const organizationIds=(memberships||[]).flatMap((membership)=>{const org=Array.isArray(membership.organizations)?membership.organizations[0]:membership.organizations;return org?.id?[org.id]:[]});
  const [duels,offers,introductions,payments,consents,requests,reports]=organizationIds.length?await Promise.all([
    supabase.from("duels").select("id,public_id,slug,current_plan,current_price,billing_frequency,currency,annual_spend,seats,country_code,company_size,switching_timeline,buyer_intent,status,submission_deadline,published_at,closed_at,created_at").in("buyer_organization_id",organizationIds),
    supabase.from("offers").select("id,duel_id,vendor_organization_id,plan_name,annual_price,currency,seats_included,implementation_fee,migration_fee,contract_months,price_lock_months,valid_until,status,submitted_at,created_at").in("vendor_organization_id",organizationIds),
    supabase.from("introductions").select("id,selection_id,buyer_organization_id,vendor_organization_id,status,introduced_at,created_at").or(`buyer_organization_id.in.(${organizationIds.join(",")}),vendor_organization_id.in.(${organizationIds.join(",")})`),
    supabase.from("payments").select("id,selection_id,vendor_organization_id,amount,currency,status,paid_at,refunded_at,created_at").in("vendor_organization_id",organizationIds),
    supabase.from("consent_records").select("purpose,policy_version,granted,recorded_at,withdrawn_at").eq("user_id",userId),
    supabase.from("data_subject_requests").select("kind,status,requested_at,acknowledged_at,completed_at").eq("user_id",userId),
    supabase.from("reports").select("id,duel_id,vendor_organization_id,reason,details,status,created_at,resolved_at").eq("reporter_user_id",userId)
  ]):[...Array(7)].map(()=>({data:[]}));
  const body=JSON.stringify({exported_at:new Date().toISOString(),policy_version:"2026-08-29",account:user,workspaces:memberships||[],duels:duels.data||[],offers:offers.data||[],introductions:introductions.data||[],payments:payments.data||[],consents:consents.data||[],data_requests:requests.data||[],reports:reports.data||[]},null,2);
  return new Response(body,{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="beatmyyvendor-data-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
