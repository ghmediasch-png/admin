import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Server-Side Admin Client (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Parse Request
    const { action, payload } = await req.json()
    
    // 3. Security Check: Ensure Requester is Authenticated
    // (In a production app, we would also query the DB here to ensure they are SUPER_ADMIN)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    
    if (authError || !user) {
      throw new Error("Unauthorized: Invalid Session")
    }

    let result;

    // --- CASE 1: CREATE USER ---
    if (action === 'create') {
      // A. Create in Supabase Auth
      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true // Auto-confirm so they can login immediately
      })

      if (createError) throw createError

      // B. Create Profile in admin_profiles
      const { error: profileError } = await supabaseAdmin
        .from('admin_profiles')
        .insert({
          supabase_uid: authUser.user.id,
          email: payload.email,
          full_name: payload.full_name,
          role: payload.role,
          permissions: payload.permissions
        })

      if (profileError) {
        // Rollback: Delete the auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
        throw profileError
      }

      result = { message: "User created successfully", userId: authUser.user.id }
    } 
    
    // --- CASE 2: UPDATE USER ---
    else if (action === 'update') {
      // A. Update Password (if provided)
      if (payload.password) {
        const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(
          payload.id, 
          { password: payload.password }
        )
        if (pwdError) throw pwdError
      }

      // B. Update Profile Data
      const { error: updateError } = await supabaseAdmin
        .from('admin_profiles')
        .update({
          full_name: payload.full_name,
          role: payload.role,
          permissions: payload.permissions,
          updated_at: new Date()
        })
        .eq('supabase_uid', payload.id)

      if (updateError) throw updateError
      
      result = { message: "User updated successfully" }
    }

    // --- CASE 3: DELETE USER ---
    else if (action === 'delete') {
      // Deleting from Auth automatically cascades to admin_profiles (due to Foreign Key setup)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(payload.id)
      
      if (deleteError) throw deleteError
      
      result = { message: "User deleted successfully" }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})