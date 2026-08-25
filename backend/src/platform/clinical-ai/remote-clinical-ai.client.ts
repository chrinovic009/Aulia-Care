import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CLINICAL_AI_CONTRACT_VERSION,
  ClinicalAIClient,
  ClinicalAIRequest,
  ClinicalAIResponse,
} from '../contracts/clinical-ai.contract';

/** HTTP adapter used only when Core is configured to call a separately deployed IA. */
@Injectable()
export class RemoteClinicalAIClient implements ClinicalAIClient {
  constructor(private readonly endpoint: string, private readonly secret: string) {}

  async execute(request: ClinicalAIRequest): Promise<ClinicalAIResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint.replace(/\/$/, '')}/api/v1/clinical-ai/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-aulia-ai-key': this.secret },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException('Le service IA est momentanément indisponible. La consultation manuelle reste disponible.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Le service IA a refusé la demande. La consultation manuelle reste disponible.');
    }
    const payload = await response.json() as ClinicalAIResponse;
    if (!payload || payload.contractVersion !== CLINICAL_AI_CONTRACT_VERSION || payload.requestId !== request.requestId || !Array.isArray(payload.suggestions)) {
      throw new ServiceUnavailableException('Réponse IA incompatible avec le contrat clinique.');
    }
    return payload;
  }
}
