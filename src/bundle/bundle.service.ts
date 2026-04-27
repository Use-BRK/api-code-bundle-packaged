import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(private readonly storage: StorageService) {}

  deploy(
    dto: CreateBundleDto,
  ): { success: true; message: string; deployedAt: string } {
    const js = this.extractJavaScript(dto.content);
    if (js.length === 0) {
      throw new BadRequestException(
        'Nenhum bloco <script>...</script> com conteúdo executável encontrado',
      );
    }

    const { updatedAt } = this.storage.saveBundle(js);
    this.logger.log(
      `Bundle salvo no SQLite (${js.length} chars de JS) em ${updatedAt}`,
    );

    return {
      success: true,
      message: 'Bundle deployed',
      deployedAt: updatedAt,
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
}
