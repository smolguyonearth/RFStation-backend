import { Elysia, t } from 'elysia'
import { supabase } from './lib/supabase'
import { GameLogic } from './gameLogic'

const game = new GameLogic()

const app = new Elysia()
  .ws('/ws', {
    open(ws) {
      ws.subscribe('live-data')
      console.log('Frontend connected to WebSocket')
    }
  })
  // --- Game Endpoints ---
  .get('/api/game/status', () => {
    return { success: true, game: game.getSnapshot() };
  })
  .get('/api/led/status/raw', () => {
    // Returns comma separated string: row0col0,row0col1...
    return game.matrix.flat().join(',');
  })
  .post('/api/game/start', ({ body, server }) => {
    game.startGame(body.startingPlayer);
    server?.publish('live-data', JSON.stringify({ type: 'game_update', game: game.getSnapshot() }));
    return { success: true };
  }, {
    body: t.Object({
      startingPlayer: t.Number()
    })
  })
  .post('/api/game/resolve', ({ body, server }) => {
    game.resolveBattle(body.winner);
    server?.publish('live-data', JSON.stringify({ type: 'game_update', game: game.getSnapshot() }));
    return { success: true };
  }, {
    body: t.Object({
      winner: t.Number()
    })
  })
  .post('/api/game/reset', ({ server }) => {
    game.resetGame();
    server?.publish('live-data', JSON.stringify({ type: 'game_update', game: game.getSnapshot() }));
    // Tell ESP32 to clear via websocket event? ESP32 only polls /api/led/status/raw!
    // That's fine, ESP32 will pick up the 0,0,0,0,0,0 on next poll.
    return { success: true };
  })
  .post('/api/action', ({ body, server }) => {
    const { button_id } = body;
    
    // Map button_id (0-5) to row/col
    if (button_id >= 0 && button_id < 6) {
      const row = Math.floor(button_id / 3);
      const col = button_id % 3;
      
      console.log(`🔘 Button pressed: ${button_id} (Place [${row},${col}])`);
      
      // Pass to game logic
      const changed = game.handleAction(row, col);
      
      if (changed) {
        // Broadcast to frontend
        server?.publish('live-data', JSON.stringify({ type: 'game_update', game: game.getSnapshot() }));
      }
      
      // Always return raw state back to ESP32 for instant sync
      return game.matrix.flat().join(',');
    }
    
    return "INVALID";
  }, {
    body: t.Object({
      button_id: t.Number()
    })
  })
  // --- Existing Ingest Endpoint ---
  .post('/api/ingest', async ({ body, server }) => {
    const { device_code, nearest_device, rssi, zone_code} = body;
    const isNearestValid = nearest_device !== "X";

    // 1. Broadcast to frontend FIRST (instant, no DB wait)
    server?.publish('live-data', JSON.stringify(body));

    // 2. Run all DB operations in parallel
    const [devicesResult, statusResult, historyResult] = await Promise.all([
      // Ensure device exists
      supabase.from('devices').upsert([{ device_code }]),

      // Update current status
      supabase.from('device_status').upsert([{
        device_code,
        nearest_device: isNearestValid ? nearest_device : null,
        latest_rssi: rssi
      }]),
      // Log history
      supabase.from('device_history').insert([{
        device_code,
        nearest_device: isNearestValid ? nearest_device : null, rssi
      }])
    ]);

    // 3. Check for errors
    const errors = [
      devicesResult.error,
      statusResult.error,
      historyResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      errors.forEach(e => console.error('❌ DB error:', e!.message));
      console.error('⚠️ Some DB writes failed. Check RLS policies or use the service_role key.');
      return { success: false, errors: errors.map(e => e!.message) };
    }

    console.log('✅ Ingested:', device_code);
    return { success: true }
  }, {
    body: t.Object({
      device_code: t.String(),
      nearest_device: t.String(),
      rssi: t.Number(),
      zone_code: t.Optional(t.String())
    })
  })
  .listen({ port: 3000, hostname: '0.0.0.0' })

console.log(`Backend running at http://${app.server?.hostname}:${app.server?.port}`)