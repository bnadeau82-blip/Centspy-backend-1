const fs = require('fs');

const SUPABASE_URL = 'https://iumkmbrgtoorpehfvkpl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bWttYnJndG9vcnBlaGZ2a3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUwNDAsImV4cCI6MjA5NzY2MTA0MH0.GJt_QrUq4opjgWWHavDEocvkK0QwboVM95WNN8wX4Ts';

async function seed() {
  const raw = fs.readFileSync('./penny-items.json', 'utf8');
  const items = JSON.parse(raw);
  console.log('Loaded ' + items.length + ' items');

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const res = await fetch(SUPABASE_URL + '/rest/v1/penny_items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Batch failed:', err);
    } else {
      inserted += batch.length;
      console.log('Inserted ' + inserted + '/' + items.length);
    }
  }
  console.log('Done!');
}

seed().catch(console.error);
