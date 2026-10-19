import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mfdxwvesbwohwnvfssyt.supabase.co';
const supabaseAnonKey = 'sb_publishable_tV-EgmLxSE3ZCOxGbsQa0w_fuje0p2f';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
