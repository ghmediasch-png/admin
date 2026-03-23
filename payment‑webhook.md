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
    // --- 1. AUTHENTICATE BANK ---
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
        errorCode = 'MISSING_API_KEY';
        throw new Error("X-API-Key header is required");
    }

    const { data: bankData, error: authError } = await supabase.rpc('verify_bank_access', {
        p_raw_key: apiKey
    });

    if (authError || !bankData || bankData.length === 0 || !bankData[0].is_valid) {
        httpCode = 403;
        errorCode = 'AUTH_FAILED';
        throw new Error("Invalid or inactive API Key");
    }

    bankId = bankData[0].bank_id;
    bankName = bankData[0].bank_name;

    // --- 2. PARSE & VALIDATE INPUT ---
    const body = await req.json();
    studentId = body.student_id;
    
    // Updated: Extract fee_type
    const { amount, transaction_ref, payment_date, fee_type } = body;

    if (!studentId || !amount || !transaction_ref) {
        errorCode = 'MISSING_FIELDS';
        throw new Error("Required: student_id, amount, transaction_ref");
    }

    // --- 3. FETCH STUDENT DETAILS ---
    const { data: student, error: stuError } = await supabase
        .from('student_master_db')
        .select('first_name, middle_name, surname, email, phone_number_1')
        .eq('student_id', studentId)
        .single();

    if (stuError || !student) {
        httpCode = 404;
        errorCode = 'STUDENT_NOT_FOUND';
        throw new Error(`Student ID ${studentId} does not exist.`);
    }

    const fullName = [student.first_name, student.middle_name, student.surname].filter(Boolean).join(' ');

    // --- 4. INSERT PAYMENT ---
    const { error: insertError } = await supabase
        .from('payments')
        .insert({
            // Data from Bank
            student_id: studentId,
            amount: amount,
            transaction_ref: transaction_ref,
            payment_date: payment_date || new Date().toISOString(),
            
            // UPDATED: Use provided fee_type or fallback default
            fee_type: fee_type || 'Tuition Fees',
            
            // Data from Auth
            bank_source: bankName, 
            source_table: 'API',
            
            // Data from Master DB
            student_name: fullName,
            student_email: student.email,
            phone: student.phone_number_1, 
            
            // System Status
            status: 'success'
        });

    if (insertError) {
        if (insertError.code === '23505') {
            httpCode = 409; 
            errorCode = 'DUPLICATE_REF';
            throw new Error(`Transaction Ref ${transaction_ref} already exists.`);
        }
        throw insertError;
    }

    // --- 5. SUCCESS ---
    status = 'success';
    httpCode = 200;

    logRequest(supabase, bankId, bankName, studentId, status, httpCode, Date.now() - startTime, null);

    return new Response(JSON.stringify({
        status: 'success',
        message: 'Payment received',
        receipt: transaction_ref
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error) {
    logRequest(supabase, bankId, bankName, studentId, status, httpCode, Date.now() - startTime, errorCode || 'UNKNOWN');

    return new Response(JSON.stringify({
        status: 'error',
        message: error.message,
        code: errorCode
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: httpCode });
  }
})

async function logRequest(supabase, bankId, bankName, studentId, status, httpCode, timeMs, errCode) {
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