# Contrats de plateforme

Ces contrats constituent les frontières entre Aulia Care Core, Aulia Care IA et
Aulia Connected Care. Ils ne doivent importer ni Prisma, ni DTO HTTP internes,
ni composant frontend. Les adaptateurs Core, FHIR et SIH tiers traduisent leurs
données vers ces contrats versionnés (`1.0`) ; ils ne partagent jamais leurs
tables entre couches.

Règle de compatibilité : une couche rejette explicitement une version de contrat
qu’elle ne connaît pas. Toute évolution incompatible crée une nouvelle version,
pas une modification silencieuse du sens clinique d’un champ.
