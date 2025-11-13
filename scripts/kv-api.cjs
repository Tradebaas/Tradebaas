const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_DIR = '/var/lib/tradebaas';
const DB = path.join(DB_DIR, 'kv.json');
fs.mkdirSync(DB_DIR, { recursive: true });

function load() { try { return JSON.parse(fs.readFileSync(DB,'utf8')); } catch { return {}; } }
function save(obj) { fs.writeFileSync(DB, JSON.stringify(obj)); }

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}
function notAllowed(res){ send(res,405,{ ok:false, error:'Method Not Allowed' }); }

const server = http.createServer((req, res) => {
  // CORS – beperkt tot je eigen domein is ook prima, maar * werkt hier omdat we via je eigen host gaan
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Health
  if (req.url === '/health' && req.method === 'GET') return send(res,200,{ ok:true });

  // Config – frontend verwacht dat dit bestaat
  if (req.url === '/api/config' && req.method === 'GET') {
    return send(res,200,{ ok:true, data:{} });
  }

  // Simple KV
  if (req.url.startsWith('/_spark/kv/')) {
    const key = decodeURIComponent(req.url.slice('/_spark/kv/'.length)).replace(/\/+$/,'');
    const db = load();

    if (req.method === 'GET') {
      const value = Object.prototype.hasOwnProperty.call(db,key) ? db[key] : null;
      return send(res,200,{ ok:true, value });
    }

    if (req.method === 'DELETE') {
      delete db[key]; save(db);
      return send(res,200,{ ok:true });
    }

    // accept PUT or POST with {value: ...}
    if (req.method === 'PUT' || req.method === 'POST') {
      let body=''; req.on('data', c => body+=c);
      req.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          db[key] = json.value ?? null;
          save(db);
          return send(res,200,{ ok:true });
        } catch (e) {
          return send(res,400,{ ok:false, error:String(e.message || e) });
        }
      });
      return;
    }

    return notAllowed(res);
  }

  send(res,404,{ ok:false, error:'Not Found' });
});

server.listen(7001, '127.0.0.1', () => {
  console.log('KV API on http://127.0.0.1:7001');
});
