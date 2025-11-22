const fs = require('fs');
(async ()=>{
  try{
    // Use env from process (pm2 has already the master key set)
    const MASTER = process.env.ENCRYPTION_MASTER_KEY;
    if (!MASTER) {
      console.error('No ENCRYPTION_MASTER_KEY in environment. Aborting.');
      process.exit(2);
    }
    // require local compiled encryption service (dist) to avoid TS imports
    const enc = require('../dist/services/encryption-service.js');
    const decryptData = enc.decryptData;

    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://tradebaas:tradebaas_secure_2025@localhost:5432/tradebaas' });
    const res = await pool.query('SELECT id,user_id,broker,environment,is_active,api_key_encrypted,api_secret_encrypted,encryption_iv,encryption_salt FROM user_credentials');
    const rows = res.rows;
    const report = [];
    for (const r of rows) {
      const item = { id: r.id, user_id: r.user_id, broker: r.broker, environment: r.environment, is_active: r.is_active };
      try{
        decryptData(r.api_key_encrypted, r.encryption_iv, r.encryption_salt, r.user_id);
        decryptData(r.api_secret_encrypted, r.encryption_iv, r.encryption_salt, r.user_id);
        item.status = 'ok';
      }catch(e){
        item.status = 'failed';
        item.error = (e && e.message) ? e.message : String(e);
      }
      report.push(item);
    }
    await pool.end();
    const outPath = '/root/Tradebaas-1/apps/backend/logs/credentials-scan.json';
    fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), summary: { total: report.length, failed: report.filter(x=>x.status==='failed').length }, rows: report }, null, 2));
    console.log('Scan complete. Report written to', outPath);
    console.log('Summary:', { total: report.length, failed: report.filter(x=>x.status==='failed').length });
  }catch(err){
    console.error('SCAN_ERROR', err.message || err);
    process.exit(1);
  }
})();
