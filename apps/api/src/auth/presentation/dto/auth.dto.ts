import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'player@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'BichoPlayer', minLength: 3, maxLength: 32 })
  @IsString()
  @Length(3, 32)
  @Matches(/^[A-Za-z0-9_]+$/u)
  username!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  password!: string;
}

export class TokenDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(70, 100)
  token!: string;
}

export class EmailDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsString()
  @Length(3, 254)
  identifier!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

export class SessionIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sessionId!: string;
}
