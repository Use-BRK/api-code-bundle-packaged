import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ScriptItemDto {
  @IsString({ message: 'name deve ser uma string' })
  @IsNotEmpty({ message: 'name é obrigatório' })
  name!: string;

  @IsString({ message: 'content deve ser uma string' })
  content!: string;
}

export class CreateBundleDto {
  // Modo legado: payload `{content: string}` com <script>...</script> wrapped
  @IsOptional()
  @IsString({ message: 'content deve ser uma string' })
  content?: string;

  // Modo novo: lista de scripts nomeados
  @IsOptional()
  @IsArray({ message: 'scripts deve ser um array' })
  @ArrayMinSize(1, { message: 'envie ao menos um script' })
  @ValidateNested({ each: true })
  @Type(() => ScriptItemDto)
  scripts?: ScriptItemDto[];
}
