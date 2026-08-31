// Kept only as a compatibility entry point for existing deployment scripts.
// The former one-clinic fallback was removed because it was unsafe in a
// multi-establishment system. Use the explicit tenant integrity tool instead.
console.error('Commande obsolète. Utilisez `npm run audit:tenant-integrity` puis, uniquement pour les cas déterministes, `npm run repair:tenant-integrity`.');
process.exitCode = 1;
