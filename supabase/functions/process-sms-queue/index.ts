// =====================================================
// Edge Function: process-sms-queue
// Description: (Placeholder) handler for queue-related SMS triggers.
//              Mirrors process-sms-trigger with additional queue logic.
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { trigger_id, source_table, phone, template_key, template_data } = await req.json();

    if (!trigger_id || !phone || !template_key || !template_data) {
      throw new Error("Missing required fields");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: template, error: templateError } = await supabase
      .from("sms_templates_sms_alone")
      .select("*")
      .eq("template_key", template_key)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      throw new Error(`Template not found: ${template_key}`);
    }

    // normalize the link exactly the same way as process-sms-trigger
    if (template_key === 'admissions_purchase_success') {
        const code =
            template_data.reference_code ||
            template_data.reference ||
            ((typeof template_data.link === 'string' && template_data.link.split('/').pop()) ||
             '');

        let base = template.base_url || template_data.base_url || '';
        if (!base && template_data.link && code) {
            base = template_data.link.replace(new RegExp(`${code}$`), '');
        }

        if (code) {
            if (!base) {
                template_data.link = template_data.link || code;
            } else {
                if (!/\bref=/.test(base)) {
                    if (base.includes('?')) {
                        if (!base.endsWith('?') && !base.endsWith('&')) base += '&';
                        base += 'ref=';
                    } else {
                        base += '?ref=';
                    }
                }
                template_data.link = base + code;
            }
            console.log('🔗 normalized link for admissions_purchase_success (queue):', template_data.link);
        }
    }

    const message = processTemplate(template.message_template, template_data);

    let lastError = null;
    let success = false;
    let arkeselResponse = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        arkeselResponse = await sendSMS(phone, message);
        success = true;
        break;
      } catch (error) {
        lastError = error.message;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
    }

    await updateTriggerStatus(supabase, trigger_id, success, lastError, arkeselResponse);
    await logSMS(supabase, trigger_id, phone, message, success, lastError, arkeselResponse);

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
