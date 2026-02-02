// =====================================================
// Database Helpers
// Description: Update trigger status and log SMS
// =====================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export async function updateTriggerStatus(
  supabase: SupabaseClient,
  triggerId: string,
  success: boolean,
  errorMessage: string | null,
  arkeselResponse: any
): Promise<void> {
  const updateData: any = {
    sms_sent: success,
    retry_count: success ? 0 : 3, // Max retries reached if failed
    error_message: success ? null : errorMessage,
  };

  // Add sent_at timestamp if successful
  if (success) {
    updateData.sent_at = new Date().toISOString();
    updateData.arkesel_message_id = arkeselResponse?.data?.id || null;
  }

  const { error } = await supabase
    .from("trigger_sms_alone")
    .update(updateData)
    .eq("id", triggerId);

  if (error) {
    console.error("❌ Failed to update trigger_sms_alone:", error);
    throw error;
  }

  console.log(`✅ Updated trigger status: ${triggerId}`);
}

export async function logSMS(
  supabase: SupabaseClient,
  triggerId: string,
  phone: string,
  message: string,
  success: boolean,
  errorMessage: string | null,
  arkeselResponse: any
): Promise<void> {
  const { error } = await supabase.from("sms_logs_sms_alone").insert({
    trigger_id: triggerId,
    phone: phone,
    message_sent: message,
    status: success ? "sent" : "failed",
    arkesel_response: arkeselResponse || null,
    error_message: success ? null : errorMessage,
    retry_attempt: success ? 0 : 3,
  });

  if (error) {
    console.error("❌ Failed to log SMS:", error);
    throw error;
  }

  console.log(`📊 Logged SMS to sms_logs_sms_alone`);
}