
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ReportTransactionDto {
  @IsNotEmpty()
  @IsString()
  chainId: string;

  @IsNotEmpty()
  @IsString()
  hash: string;

  @IsNotEmpty()
  @IsString()
  channel: string;

  @IsOptional()
  @IsString()
  description?: string;
}
