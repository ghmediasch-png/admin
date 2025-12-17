// =====================================================
// Arkesel API Integration
// Description: Send SMS via Arkesel API
// =====================================================

interface ArkeselResponse {
  status: string;
  message?: string;
  data?: any;
  code?: string;
}

export async function sendSMS(phone: string, message: string): Promise<ArkeselResponse> {
  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const senderId = Deno.env.get("ARKESEL_SENDER_ID") || "GH_SCHOOLS";
  const baseUrl = Deno.env.get("ARKESEL_BASE_URL") || "https://sms.arkesel.com/api/v2/sms/send";

  if (!apiKey) {
    throw new Error("ARKESEL_API_KEY not configured");
  }

  console.log(`🚀 Calling Arkesel API for phone: ${phone}`);

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: senderId,
      recipients: [phone],
      message: message,
    }),
  });

  const result: ArkeselResponse = await response.json();

  console.log(`📡 Arkesel response:`, result);

  // Check if request was successful
  if (!response.ok || result.status?.toLowerCase() !== "success") {
    throw new Error(result.message || result.code || "Unknown Arkesel API error");
  }

  return result;
}