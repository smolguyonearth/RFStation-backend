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
    const { device_code, nearest_device, rssi, zone_code } = body;
    const isNearestValid = nearest_device !== "X";

    // 1. Ensure devices exist
    const { error: e1 } = await supabase.from('devices').upsert([{ device_code }]);
    if (e1) console.error('❌ devices upsert:', e1.message);

    if (isNearestValid) {
      const { error: e2 } = await supabase.from('devices').upsert([{ device_code: nearest_device }]);
      if (e2) console.error('❌ nearest device upsert:', e2.message);
    }

    // 2. Update current status
    const { error: e3 } = await supabase.from('device_status').upsert([{
      device_code, zone_code,
      nearest_device: isNearestValid ? nearest_device : null,
      latest_rssi: rssi
    }]);
    if (e3) console.error('❌ device_status upsert:', e3.message);

    // 3. Log history
    const { error: e4 } = await supabase.from('device_history').insert([{
      device_code, zone_code,
      nearest_device: isNearestValid ? nearest_device : null, rssi
    }]);
    if (e4) console.error('❌ device_history insert:', e4.message);

    // Check if any DB operation failed
    const dbErrors = [e1, e3, e4].filter(Boolean);
    if (dbErrors.length > 0) {
      console.error('⚠️ Some DB writes failed. Check RLS policies or use the service_role key.');
      return { success: false, errors: dbErrors.map(e => e!.message) };
    }

    // 4. Broadcast to React frontend
    server?.publish('live-data', JSON.stringify(body));
    console.log('✅ Ingested:', device_code);

    return { success: true }
  }, {
    body: t.Object({
      device_code: t.String(),
      nearest_device: t.String(),
      rssi: t.Number(),
      zone_code: t.String()
    })
  })
  .listen({ port: 3000, hostname: '0.0.0.0' })

console.log(`Backend running at http://${app.server?.hostname}:${app.server?.port}`)