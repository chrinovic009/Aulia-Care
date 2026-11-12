import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { WorkflowRuleError } from './domain/workflow-rules';

const STATUS_BY_CODE: Record<string, HttpStatus> = {
  REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  UNKNOWN_STATUS: HttpStatus.BAD_REQUEST,
  EVENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_CHANGE: HttpStatus.CONFLICT,
  TRANSITION_NOT_ALLOWED: HttpStatus.CONFLICT,
  MANDATORY_STEPS_MISSING: HttpStatus.CONFLICT,
};

/** Turns an organisational rule refusal into an explicit HTTP answer with its code. */
@Catch(WorkflowRuleError)
export class WorkflowRuleExceptionFilter implements ExceptionFilter {
  catch(error: WorkflowRuleError, host: ArgumentsHost) {
    const statusCode = STATUS_BY_CODE[error.code] ?? HttpStatus.CONFLICT;
    host.switchToHttp().getResponse().status(statusCode).json({ statusCode, code: error.code, message: error.message });
  }
}
