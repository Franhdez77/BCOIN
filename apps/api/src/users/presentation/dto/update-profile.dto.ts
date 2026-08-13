import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'BichoPlayer', minLength: 3, maxLength: 32 })
  @IsString()
  @Length(3, 32)
  @Matches(/^[A-Za-z0-9_]+$/u)
  username!: string;
}
