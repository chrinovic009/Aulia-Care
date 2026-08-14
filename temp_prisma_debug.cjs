const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  prisma.$on('query', e => console.log('QUERY:', e.query));
  prisma.$on('info', e => console.log('INFO:', e.message));
  prisma.$on('warn', e => console.log('WARN:', e.message));

  const model = prisma._dmmf?.datamodel?.models?.find(m => m.name === 'ImagingRequest');
  console.log('MODEL', !!model);
  if (model) {
    console.log('FIELDS');
    model.fields.forEach(f => {
      console.log(`  ${f.name}${f.dbName ? ` -> ${f.dbName}` : ''}`);
    });
  }

  const cols = await prisma.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_name='ImagingRequest' ORDER BY ordinal_position");
  console.log('DB_COLUMNS', JSON.stringify(cols, null, 2));

  try {
    await prisma.imagingRequest.findMany({ take: 1 });
    console.log('QUERY_OK');
  } catch (err) {
    console.error('PRISMA_ERR', err);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
