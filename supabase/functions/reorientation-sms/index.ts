// =====================================================
// Edge Function: reorientation-sms
// Description: Send a single SMS with an exact, client-rendered
//              message via Arkesel. No DB coupling.
// Usage: POST /functions/v1/reorientation-sms
//        { phone: "2332XXXXXXXXX", message: "..." }
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendSMS } from "./arkesel.ts";

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
    const { phone, message } = await req.json();

    // Validate required fields
    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: phone, message" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(`📱 Sending re-orientation SMS to: ${phone}`);

    // Send SMS via Arkesel
    await sendSMS(phone, message);

    console.log(`✅ SMS sent to ${phone}`);

    return new Response(
      JSON.stringify({ success: true, phone }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Edge Function error:", error.message);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});