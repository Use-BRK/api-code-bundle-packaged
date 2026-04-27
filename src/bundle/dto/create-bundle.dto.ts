import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateBundleDto {
  @IsString({ message: 'content deve ser uma string' })
  @IsNotEmpty({ message: 'content é obrigatório e não pode ser vazio' })
  @Matches(/<script\b[^>]*>[\s\S]*?<\/script\s*>/i, {
    message: 'content deve conter pelo menos uma tag <script>...</script>',
  })
  content!: string;
}
