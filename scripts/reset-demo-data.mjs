import fs from 'fs';
import path from 'path';

if (process.env.HRM_KEEP_RUNTIME_DATA === '1') {
  console.log('[HRM] Giữ nguyên dữ liệu runtime hiện tại (HRM_KEEP_RUNTIME_DATA=1).');
  process.exit(0);
}

const dataDir = path.join(process.cwd(), '.data');
const dataFile = path.join(dataDir, 'runtime-sync.json');
const bootEpoch = `boot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(dataFile, `${JSON.stringify({ _bootEpoch: bootEpoch }, null, 2)}\n`, 'utf-8');

console.log(`[HRM] Đã đặt lại dữ liệu demo về trạng thái ban đầu (ứng viên chưa duyệt) [${bootEpoch}].`);
