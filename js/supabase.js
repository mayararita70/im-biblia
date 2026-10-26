
import { createClient } from
  'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://xyptoggtndcipgenbbty.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bX9if0qEuLJH7W7cM9YhGQ_yFoPSc8I';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
