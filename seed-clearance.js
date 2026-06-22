const fs = require('fs');

const SUPABASE_URL = 'https://iumkmbrgtoorpehfvkpl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bWttYnJndG9vcnBlaGZ2a3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUwNDAsImV4cCI6MjA5NzY2MTA0MH0.GJt_QrUq4opjgWWHavDEocvkK0QwboVM95WNN8wX4Ts';

async function seed() {
  const raw = fs.readFileSync('./proxy.json', 'utf8');
  const data = JSON.parse(raw);
  const storeId = data.store_info.store_id;
  const storeName = data.store_info.store_name;
  const reportDate = data.report_date;
  const items = data.report_items.map(item => ({
    store_id: storeId,
    store_name: storeName,
    product_id: item.product_id,
    brand: item.brand,
    item_name: item.item_name,
    stock: item.stock,
    percent_off: item.percent_off,
    retail_price: item.retail_price,
    clearance_price: item.clearance_price,
    previous_price: item.previous_price,
    store_sku: item.store_sku,
    image_link: item.image_link,
    upc: item.upc,
    category: item.category,
    is_new: item.is_new,
    is_lower_price: item.is_lower_price,
    report_date: reportDate,
    nearby_store_info: item.nearby_store_info
  }));

  console.log('Seeding ' + items.length + ' clearance items for store ' + storeName + '...');

  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const res = await fetch(SUPABASE_URL + '/rest/v1/clearance_items', {
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
      console.error('Batch failed:', await res.text());
    } else {
      inserted += batch.length;
      console.log('Inserted ' + inserted + '/' + items.length);
    }
  }
  console.log('Done!');
}

seed().catch(console.error);
