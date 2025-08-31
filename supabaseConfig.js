// Supabase configuration
function readMeta(name) {
  try {
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';
  } catch (_) {
    return '';
  }
}

const serverSupabaseUrl = readMeta('supabase-url') || (window.__SUPABASE?.url || '');
const serverSupabaseKey = readMeta('supabase-anon-key') || (window.__SUPABASE?.anonKey || '');

// Fallbacks kept for local/dev; prefer server-provided values via meta/globals
const supabaseUrl = serverSupabaseUrl || 'https://ydakcynoinwmiclwjhdj.supabase.co';
const supabaseKey = serverSupabaseKey || 'sb_publishable_urPuci96mvxkU9cm1s694w_3MVvbqXY';

// Initialize Supabase client
const _supabase = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

// Make supabase globally available
window.supabase = _supabase;

// Create tables function for Supabase
async function createChatTables() {
  try {
    // The SQL will be executed directly in Supabase dashboard
    console.log('Chat tables should be created in Supabase dashboard using the provided SQL');
  } catch (error) {
    console.error('Error with chat tables setup:', error);
  }
}

// Initialize chat tables on app start
document.addEventListener('DOMContentLoaded', () => {
  createChatTables();
});