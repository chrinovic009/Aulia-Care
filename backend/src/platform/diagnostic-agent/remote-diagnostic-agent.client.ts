import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DIAGNOSTIC_AGENT_CONTRACT_VERSION,
  DiagnosticAgentClient,
  DiagnosticAgentRequest,
  DiagnosticAgentResponse,
} from '../contracts/diagnostic-agent.contract';

/** HTTP adapter used only when Core calls a separately deployed Diagnostic Agent. */
@Injectable()
export class RemoteDiagnosticAgentClient implements DiagnosticAgentClient {
  constructor(private readonly endpoint: string, private readonly secret: string) {}

  async execute(request: DiagnosticAgentRequest): Promise<DiagnosticAgentResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint.replace(/\/$/, '')}/api/v1/diagnostic-agent/execute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-aulia-diagnostic-agent-key': this.secret,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Le service Diagnostic Agent est momentanément indisponible. La consultation manuelle reste disponible.',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Le service Diagnostic Agent a refusé la demande. La consultation manuelle reste disponible.',
      );
    }
    const payload = await response.json() as DiagnosticAgentResponse;
    if (
      !payload ||
      payload.contractVersion !== DIAGNOSTIC_AGENT_CONTRACT_VERSION ||
      payload.requestId !== request.requestId ||
      !Array.isArray(payload.suggestions)
    ) {
      throw new ServiceUnavailableException(
        'Réponse Diagnostic Agent incompatible avec le contrat clinique.',
      );
    }
    return payload;
  }
}
