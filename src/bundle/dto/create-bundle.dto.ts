import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBundleDto {
  @IsString({ message: 'content deve ser uma string' })
  @IsNotEmpty({ message: 'content é obrigatório e não pode ser vazio' })
  content!: string;
}
