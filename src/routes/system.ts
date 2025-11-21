import { FastifyInstance } from 'fastify';
import { snapshot } from '../services/metricsService';
import { brokers } from './brokers';

export async function systemRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', async () => snapshot());

  fastify.get('/status', async () => ({
    brokers: {
      bitget: {
        testnet: brokers.bitget.testnet,
        dryRun: brokers.bitget.dryRun
      }
    }
  }));
}
