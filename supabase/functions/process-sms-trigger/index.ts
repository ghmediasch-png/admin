// =====================================================
// Edge Function: process-sms-trigger
// Description: Main handler for SMS processing
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendSMS } from "./arkesel.ts";
import { processTemplate } from "./template.ts";
import { updateTriggerStatus, logSMS } from "./database.ts";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { trigger_id, source_table, phone, template_key, template_data } = await req.json();

    console.log(`📨 Processing SMS trigger: ${trigger_id}`);

    // Validate required fields
    if (!trigger_id || !phone || !template_key || !template_data) {
      throw new Error("Missing required fields");
    }

    // Initialize Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch SMS template
    const { data: template, error: templateError } = await supabase
      .from("sms_templates_sms_alone")
      .select("*")
      .eq("template_key", template_key)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      throw new Error(`Template not found: ${template_key}`);
    }

    console.log(`📝 Using template: ${template_key}`);

    // Process template (replace placeholders)
    const message = processTemplate(template.message_template, template_data);

    console.log(`📱 Sending SMS to: ${phone}`);

    // Send SMS via Arkesel (with retry logic)
    let lastError = null;
    let success = false;
    let arkeselResponse = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        arkeselResponse = await sendSMS(phone, message);
        success = true;
        console.log(`✅ SMS sent successfully on attempt ${attempt + 1}`);
        break;
      } catch (error) {
        lastError = error.message;
        console.error(`❌ Attempt ${attempt + 1} failed: ${lastError}`);
        
        // Wait before retry (exponential backoff)
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
    }

    // Update trigger_sms_alone status
    await updateTriggerStatus(supabase, trigger_id, success, lastError, arkeselResponse);

    // Log to sms_logs_sms_alone
    await logSMS(supabase, trigger_id, phone, message, success, lastError, arkeselResponse);

    // Return response
    return new Response(
      JSON.stringify({
        success,
        trigger_id,
        phone,
        message: success ? "SMS sent successfully" : `Failed after 3 attempts: ${lastError}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: success ? 200 : 500,
      }
    );
  } catch (error) {
    console.error("❌ Edge Function error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});