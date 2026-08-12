import { HttpException } from '@nestjs/common';

export class ApiHttpException extends HttpException {
  constructor(
    statusCode: number,
    readonly errorCode: string,
    readonly safeMessage: string,
  ) {
    super({ code: errorCode, message: safeMessage }, statusCode);
  }
}
