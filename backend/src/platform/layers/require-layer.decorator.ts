import { SetMetadata } from '@nestjs/common';
import { AuliaLayer } from '@prisma/client';

/**
 * Declares the commercial product that owns an HTTP controller or action.
 * The global entitlement guard reads this metadata before using its narrowly
 * scoped fallback for legacy Core endpoints.
 */
export const REQUIRED_AULIA_LAYER = 'aulia:required-layer';

export const RequireLayer = (layer: AuliaLayer) =>
  SetMetadata(REQUIRED_AULIA_LAYER, layer);
