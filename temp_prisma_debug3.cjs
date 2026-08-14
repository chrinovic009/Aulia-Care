const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query', 'info', 'warn'] });

async function main() {
  console.log('DMMF is', typeof prisma._dmmf);
  if (prisma._dmmf) {
    const model = prisma._dmmf.datamodel?.models?.find(m => m.name === 'ImagingRequest');
    console.log('MODEL', !!model);
    if (model) {
      model.fields.forEach(f => console.log(`FIELD ${f.name}${f.dbName ? ` -> ${f.dbName}` : ''}`));
    }
  }

  const cols = await prisma.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_name='ImagingRequest' ORDER BY ordinal_position");
  console.log('DB_COLUMNS', JSON.stringify(cols, null, 2));

  try {
    await prisma.imagingRequest.findMany({
      take: 1,
      include: {
        patient: true,
        consultation: { include: { hospitalization: true, appointment: true } },
        report: true,
        machine: true,
      },
    });
    console.log('QUERY_OK');
  } catch (err) {
    console.error('PRISMA_ERR', err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('MAIN_ERR', err);
  process.exit(1);
});