import { Controller, Get, Header } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type LivenessResult, type ReadinessResult } from './health.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  health(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): LivenessResult {
    return this.healthService.liveness();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  ready(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }
}
