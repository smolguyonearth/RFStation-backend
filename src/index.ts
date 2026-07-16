import { Elysia, t } from 'elysia'
import { supabase } from './lib/supabase'

const app = new Elysia()
  .ws('/ws', {
    open(ws) {
      ws.subscribe('live-data')
      console.log('Frontend connected to WebSocket')
    }
  })
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