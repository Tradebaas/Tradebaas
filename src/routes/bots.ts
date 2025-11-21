import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { registerBot as registerBotInMemory, listBots as listBotsInMemory, ingestSignal as ingestSignalInMemory, listPendingSignals as listPendingSignalsInMemory, executeTrade as executeTradeInMemory } from '../services/botService';

export async function botRoutes(fastify: FastifyInstance) {
  // create bot (authenticated) - persist if prisma available
  fastify.post('/', { preHandler: (fastify as any).authenticate }, async (req: any, reply) => {
    const body = req.body as any;
    const userId = req.user?.id;
    if (!userId) return reply.code(401).send({ error: 'unauth' });

    try {
      const bot = await prisma.bot.create({ data: { name: body.name || 'bot', broker: body.broker || 'bitget', mode: body.mode || 'manual', maxOpenTrades: body.maxOpenTrades || 2, defaultInstrument: body.defaultInstrument || null, ownerId: userId } });
      return reply.code(201).send(bot);
    } catch (e) {
      // fallback to in-memory
      const bot = registerBotInMemory({ name: body.name, broker: body.broker, mode: body.mode, maxOpenTrades: body.maxOpenTrades, defaultInstrument: body.defaultInstrument });
      return reply.code(201).send(bot);
    }
  });

  // list (in-memory + db combined)
  fastify.get('/', async () => {
    try {
      const bots = await prisma.bot.findMany();
      return bots;
    } catch (e) {
      return listBotsInMemory();
    }
  });

  fastify.post('/:id/signal', async (req, reply) => {
    const botId = (req.params as any).id as string;
    const body = req.body as any;

    try {
      // persist signal if prisma present
      const bot = await prisma.bot.findUnique({ where: { id: botId } });
      if (bot) {
        const s = await prisma.signal.create({ data: { botId, instrument: body.instrument, side: body.side, size: body.size, price: body.price || null, timestamp: new Date(body.timestamp || Date.now()) } });
        return reply.code(201).send(s);
      }
    } catch (e) {
      // ignore and fallback
    }

    const signal = ingestSignalInMemory({ ...body, botId });
    return reply.code(201).send(signal);
  });

  fastify.get('/:id/signals', async (req) => {
    const botId = (req.params as any).id as string;
    try {
      const s = await prisma.signal.findMany({ where: { botId, processed: false } });
      return s;
    } catch (e) {
      return listPendingSignalsInMemory(botId);
    }
  });

  fastify.post('/:id/execute/:signalId', async (req, reply) => {
    const botId = (req.params as any).id as string;
    const signalId = (req.params as any).signalId as string;
    try {
      const sig = await prisma.signal.findUnique({ where: { id: signalId } });
      if (!sig) return reply.code(404).send({ error: 'signal not found' });
      // mark processed
      await prisma.signal.update({ where: { id: signalId }, data: { processed: true } });
      // execute via in-memory service for now
      const trade = await executeTradeInMemory({ id: sig.id, botId: sig.botId, instrument: sig.instrument, side: sig.side as any, size: sig.size, price: sig.price || undefined, timestamp: sig.timestamp.getTime() });
      // persist trade
      await prisma.trade.create({ data: { id: trade.id, botId: trade.botId, instrument: trade.instrument, side: trade.side, size: trade.size, price: trade.price || null, status: trade.status, openedAt: new Date(trade.openedAt) } });
      return reply.send(trade);
    } catch (err: any) {
      // fallback to in-memory
      const signals = listPendingSignalsInMemory(botId);
      const sig = signals.find(s => s.id === signalId);
      if (!sig) return reply.code(404).send({ error: 'signal not found' });
      try {
        const trade = await executeTradeInMemory(sig);
        return reply.send(trade);
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  });
}
