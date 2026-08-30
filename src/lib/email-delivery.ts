import "server-only";
import { renderBrandedEmail } from "@/lib/email-templates";
import { EmailProviderError, resendConfigured, sendResendEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

type ClaimedNotification = {
  notification_id: string;
  template_key: string;
  payload: Record<string, unknown> | null;
  recipient_email: string | null;
  recipient_name: string | null;
  organization_name: string | null;
  attempts: number;
};

export type EmailDeliverySummary = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
};

function boundedBatchSize(requested?: number) {
  const configured = Number(process.env.EMAIL_DELIVERY_BATCH_SIZE || 25);
  const value = Number.isFinite(requested) ? Number(requested) : configured;
  return Math.min(100, Math.max(1, Math.trunc(Number.isFinite(value) ? value : 25)));
}

function deliveryError(error: unknown) {
  if (error instanceof EmailProviderError) return error;
  if (error instanceof Error) return new EmailProviderError(error.message.slice(0, 500), true);
  return new EmailProviderError("Unexpected email delivery failure.", true);
}

export async function deliverPendingEmails(requestedBatchSize?: number): Promise<EmailDeliverySummary> {
  if (!resendConfigured()) throw new EmailProviderError("Resend is not configured.", false);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_email_notifications", {
    p_limit: boundedBatchSize(requestedBatchSize)
  });
  if (error) throw new Error("Could not claim email notifications: " + error.message);

  const notifications = (data || []) as ClaimedNotification[];
  const summary: EmailDeliverySummary = { claimed: notifications.length, sent: 0, retried: 0, failed: 0 };

  for (const notification of notifications) {
    try {
      if (!notification.recipient_email) {
        throw new EmailProviderError("Notification has no deliverable recipient.", false);
      }
      const email = renderBrandedEmail(notification.template_key, notification.payload || {}, {
        recipientName: notification.recipient_name,
        organizationName: notification.organization_name
      });
      const provider = await sendResendEmail({
        to: notification.recipient_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        templateKey: notification.template_key,
        idempotencyKey: "beatmyvendor/notification/" + notification.notification_id
      });
      const { error: completionError } = await supabase.rpc("mark_email_notification_sent", {
        p_notification_id: notification.notification_id,
        p_provider_message_id: provider.id
      });
      if (completionError) throw new Error("Could not reconcile the provider message.");
      summary.sent += 1;
    } catch (caught) {
      const normalized = deliveryError(caught);
      const retryable = normalized.retryable && notification.attempts < 5;
      const { error: failureError } = await supabase.rpc("mark_email_notification_failed", {
        p_notification_id: notification.notification_id,
        p_error: normalized.message,
        p_retryable: retryable
      });
      if (failureError) throw new Error("Could not reconcile a failed email notification.");
      if (retryable) summary.retried += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}
