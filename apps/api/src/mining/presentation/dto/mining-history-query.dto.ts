import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MAX_MINING_HISTORY_PAGE_SIZE } from '../../application/mining-query.service';

export class MiningHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_MINING_HISTORY_PAGE_SIZE)
  limit?: number;
}
