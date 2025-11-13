const Fastify = require('fastify');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const Redis = require('ioredis');

const app = Fastify({ logger: false });
const redis = new Redis(); // localhost:6379 default

const TOKEN = process.env.KV_TOKEN || '';
const limiter = new RateLimiterMemory({ points: 60, duration: 10 }); // 60 req / 10s per IP

app.addHook('onRequest', async (req, reply) => {
  try { await limiter.consume(req.ip); } 
  catch { return reply.code(429).send({ ok:false, error:'Too Many Requests' }); }

  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') return reply.code(204).send();

  // optional bearer auth
  if (TOKEN) {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
    if (auth !== TOKEN) return reply.code(401).send({ ok:false, error:'Unauthorized' });
  }
});

app.get('/health', async () => ({ ok:true }));
app.get('/api/config', async () => ({ ok:true, data:{} }));

app.get('/_spark/kv/:key', async (req) => {
  const val = await redis.get(req.params.key);
  return { ok:true, value: val ? JSON.parse(val) : null };
});

async function setKey(key, payload) {
  const value = (payload && Object.prototype.hasOwnProperty.call(payload, 'value')) ? payload.value : null;
  await redis.set(key, JSON.stringify(value));
  return { ok:true };
}
app.put('/_spark/kv/:key', async (req) => setKey(req.params.key, req.body));
app.post('/_spark/kv/:key', async (req) => setKey(req.params.key, req.body));
app.delete('/_spark/kv/:key', async (req) => { await redis.del(req.params.key); return { ok:true }; });

app.listen({ host:'127.0.0.1', port:7001 }).then(() => console.log('KV Redis API on 127.0.0.1:7001'));
