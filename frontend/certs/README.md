# Certificat HTTPS de développement

`aulia-care-dev.pfx` et `aulia-care-dev-root.cer` sont générés localement et ignorés par Git.

Pour les tests sur téléphone, installez `aulia-care-dev-root.cer` comme certificat racine de confiance sur l’appareil, puis ouvrez l’URL HTTPS affichée par Vite. Pour la production, remplacez ce certificat local par un certificat public valide sur un nom de domaine hospitalier.
