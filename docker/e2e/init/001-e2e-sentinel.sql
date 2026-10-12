-- Provisioned only when the disposable E2E volume is first created.
-- Test code never creates, changes or removes this marker.
ALTER DATABASE aulia_e2e_core
  SET aulia.e2e_test_sentinel = 'aulia-e2e-sentinel-test-only';
