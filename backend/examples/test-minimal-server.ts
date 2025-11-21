#!/usr/bin/env node
// LEGACY: verplaatst vanuit backend/test-minimal-server.ts
// Zie CLEANUP_PLAN.md voor context. Niet meer gebruiken in productiecode.
// Dit was een minimale test-server voor debugging.
// Productie server staat in: backend/src/index.ts

import Fastify from 'fastify';

const server = Fastify({ logger: true });

// Manual CORS
server.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

server.get('/health', async () => {
  return { status: 'ok' };
});

server.post('/test', async (request) => {
  return { received: request.body };
});

const start = async () => {
  try {
    console.log('Starting minimal server...');
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('✅ Server listening on http://0.0.0.0:3000');
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
};

start();
