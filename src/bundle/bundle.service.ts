import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { minify } from 'terser';
import { StorageService } from '../storage/storage.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

interface DeployResult {
  success: true;
  message: string;
  deployedAt: string;
  inputSize: number;
  outputSize: number;
}

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(private readonly storage: StorageService) {}

  async deploy(dto: CreateBundleDto): Promise<DeployResult> {
    const extracted = this.extractJavaScript(dto.content);
    if (extracted.length === 0) {
      throw new BadRequestException(
        'Nenhum bloco <script>...</script> com conteúdo executável encontrado',
      );
    }

    const minified = await this.minifyToInline(extracted);

    const { updatedAt } = this.storage.saveBundle(minified);
    this.logger.log(
      `Bundle salvo (${dto.content.length} → ${extracted.length} → ${minified.length} chars) em ${updatedAt}`,
    );

    return {
      success: true,
      message: 'Bundle deployed',
      deployedAt: updatedAt,
      inputSize: dto.content.length,
      outputSize: minified.length,
    };
  }

  private extractJavaScript(html: string): string {
    const blocks: string[] = [];
    const regex = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;

    for (const match of html.matchAll(regex)) {
      const body = match[1].trim();
      if (body.length > 0) {
        blocks.push(body);
      }
    }

    return blocks.join('\n;\n');
  }

  private async minifyToInline(js: string): Promise<string> {
    try {
      const result = await minify(js, {
        compress: {
          negate_iife: false,
        },
        mangle: true,
        format: {
          comments: false,
          beautify: false,
          semicolons: true,
        },
      });

      const code = result.code?.trim();
      if (!code || code.length === 0) {
        throw new BadRequestException(
          'Minificação produziu código vazio — verifique o conteúdo enviado',
        );
      }

      return code;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Falha ao minificar JS: ${detail}`);
      throw new BadRequestException({
        message: 'JavaScript inválido — não foi possível minificar',
        detail,
      });
    }
  }
}
