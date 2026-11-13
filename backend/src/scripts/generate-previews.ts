import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database.js';
import { previewService } from '../services/preview/preview.service.js';
import { storageService } from '../services/storage/storage.service.js';

async function main() {
  console.log('==================================================');
  console.log('Universal Preview Generator');
  console.log('==================================================\n');

  const mediaAssets = await prisma.mediaAsset.findMany({
    include: {
      project: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (mediaAssets.length === 0) {
    console.log('No media assets found in database.');
    process.exit(0);
  }

  console.log(`Found ${mediaAssets.length} media asset(s). Checking preview status...\n`);

  const summary: Array<{
    id: string;
    filename: string;
    project: string;
    status: string;
    previewFile: string;
  }> = [];

  for (const asset of mediaAssets) {
    const existing = storageService.getExistingPreviewPath(asset.storagePath);
    const projectName = asset.project?.title || 'Unknown Project';

    if (existing && fs.existsSync(existing)) {
      console.log(`[ALREADY READY] ${asset.filename} (${projectName}) -> ${path.basename(existing)}`);
      summary.push({
        id: asset.id,
        filename: asset.filename,
        project: projectName,
        status: 'READY (Exists)',
        previewFile: existing,
      });
      continue;
    }

    console.log(`[GENERATING] Generating preview for ${asset.filename} (${projectName})...`);
    try {
      const info = await previewService.processMediaPreview(asset.id);
      console.log(`  [OK] Successfully created preview: ${info.previewPath}`);
      summary.push({
        id: asset.id,
        filename: asset.filename,
        project: projectName,
        status: 'SUCCESS',
        previewFile: info.previewPath || 'unknown',
      });
    } catch (err: any) {
      console.error(`  [FAIL] Failed to create preview for ${asset.filename}:`, err?.message || err);
      summary.push({
        id: asset.id,
        filename: asset.filename,
        project: projectName,
        status: `FAILED: ${err?.message || 'Error'}`,
        previewFile: 'N/A',
      });
    }
  }

  console.log('\n==================================================');
  console.log('Summary of Preview Generation:');
  console.log('==================================================');
  console.table(
    summary.map((s) => ({
      Filename: s.filename,
      Project: s.project,
      Status: s.status,
      Preview: path.basename(s.previewFile),
    }))
  );
  console.log('All done!\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error during preview generation:', err);
  process.exit(1);
});

