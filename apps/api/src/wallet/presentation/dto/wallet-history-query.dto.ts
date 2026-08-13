import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../application/wallet-query.service';

export class WalletHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
