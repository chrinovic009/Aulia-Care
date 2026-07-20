# Séries temporelles des montres

La migration de base reste compatible avec PostgreSQL standard. En production, après avoir installé TimescaleDB, un administrateur de base de données peut exécuter une fois :

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('"WearableMeasurement"', 'measuredAt', if_not_exists => TRUE, migrate_data => TRUE);
```

`WearableMeasurement` est conservée comme source brute et immuable. Les alertes et décisions cliniques doivent être enregistrées dans des tables métier séparées; les données GPS d'urgence, plus sensibles et moins fréquentes, restent dans `EmergencyLocation` avec une piste d'audit via `EmergencyLocationRequest`.
