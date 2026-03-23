import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const startTime = Date.now();
  let bankId = null;
  let bankName = 'Unknown';
  let studentId = '';
  let status = 'error';
  let httpCode = 400;
  let errorCode = '';

  try {
    // --- 1. CONFIG CHECK ---
    const { data: sysConfig } = await supabase.from('system_config').select('key, value');
    const config = new Map();
    if (sysConfig) sysConfig.forEach(row => config.set(row.key, row.value));

    if (config.get('maintenance_mode') === 'true') {
        httpCode = 503;
        throw new Error("System is under maintenance.");
    }

    // --- 2. EXTRACT ---
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
        errorCode = 'MISSING_API_KEY';
        throw new Error("X-API-Key header is required");
    }

    const body = await req.json();
    studentId = body.student_id;
    if (!studentId) {
        errorCode = 'MISSING_STUDENT_ID';
        throw new Error("student_id is required");
    }

    // --- 3. VERIFY (RPC) ---
    const { data: bankData, error: authError } = await supabase.rpc('verify_bank_access', {
        p_raw_key: apiKey
    });

    if (authError || !bankData || bankData.length === 0 || !bankData[0].is_valid) {
        httpCode = 403; // Forbidden
        errorCode = 'AUTH_FAILED';
        throw new Error("Invalid or inactive API Key");
    }

    bankId = bankData[0].bank_id;
    bankName = bankData[0].bank_name;

    // --- 4. QUERY STUDENT ---
    const { data: student, error: dbError } = await supabase
        .from('student_master_db')
        .select('student_id, first_name, middle_name, surname')
        .eq('student_id', studentId)
        .single();

    if (dbError || !student) {
        httpCode = 404;
        errorCode = 'STUDENT_NOT_FOUND';
        throw new Error("Student not found");
    }

    // --- 5. SUCCESS ---
    status = 'success';
    httpCode = 200;
    
    // Log Success
    logRequest(supabase, bankId, bankName, studentId, status, httpCode, Date.now() - startTime, null);

    const fullName = [student.first_name, student.middle_name, student.surname].filter(n => n).join(' ');

    return new Response(JSON.stringify({
        status: 'success',
        data: {
            student_id: student.student_id,
            student_name: fullName
        }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    // Log Error
    logRequest(supabase, bankId, bankName, studentId, status, httpCode, Date.now() - startTime, errorCode || 'UNKNOWN');

    return new Response(JSON.stringify({
        status: 'error',
        message: error.message,
        code: errorCode
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: httpCode })
  }
})

async function logRequest(supabase, bankId, bankName, studentId, status, httpCode, timeMs, errCode) {
    // Safety check to prevent crashing if log table doesn't exist yet
    try {
        await supabase.from('api_request_logs').insert({
            bank_id: bankId,
            bank_name: bankName,
            student_id_queried: studentId || 'N/A',
            response_status: status,
            response_time_ms: timeMs,
            http_status_code: httpCode,
            error_code: errCode,
            request_id: crypto.randomUUID()
        });
    } catch (e) { console.error("Logging failed", e); }
}