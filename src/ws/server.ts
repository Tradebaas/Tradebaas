import { WebSocketServer } from 'ws';
import { subscribe } from '../services/events';

export function createWSServer(httpServer: any) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: any, socket: any, head: any) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const unsub = subscribe((evt) => {
      try { ws.send(JSON.stringify(evt)); } catch (e) { /* ignore */ }
    });

    ws.on('close', () => unsub());
  });

  return wss;
}
