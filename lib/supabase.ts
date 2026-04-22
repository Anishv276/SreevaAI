import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client to prevent module import errors during startup/build when config is missing.
let _supabase: any = null;

/**
 * Returns the initialized Supabase client.
 * Throws a critical error ONLY when called and configuration is missing.
 * This prevents the entire application from failing to start due to missing environment variables.
 */
export function getSupabaseClient() {
    if (_supabase) return _supabase;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("CRITICAL_CONFIGURATION_MISSING: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined. Please set these in your .env to use Supabase features.");
    }

    _supabase = createClient(supabaseUrl, supabaseServiceKey);
    return _supabase;
}

/**
 * Exported 'supabase' object as a Proxy. 
 * This remains compatible with 'import { supabase } from "@/lib/supabase"' 
 * while delaying initialization and potential errors until a property is accessed.
 */
export const supabase = new Proxy({}, {
    get(target, prop) {
        return (getSupabaseClient() as any)[prop];
    }
}) as any;
