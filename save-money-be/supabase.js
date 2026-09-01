// supabase.js
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Липсват SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY. Локално попълни save-money-be/.env; в GitHub Actions ги добави като repository secrets.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;