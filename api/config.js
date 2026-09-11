// Liefert die öffentliche Supabase-Konfiguration an das Frontend.
// SUPABASE_ANON_KEY ist bewusst öffentlich (durch Row Level Security abgesichert).
module.exports = function handler(req, res) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
};
