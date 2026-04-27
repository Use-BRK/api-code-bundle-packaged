import { Controller, Get, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { StorageService } from '../storage/storage.service';

@Controller()
export class ScriptController {
  private readonly logger = new Logger(ScriptController.name);

  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('script.js')
  serve(@Res() res: Response): void {
    const bundle = this.storage.getBundle();

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!bundle) {
      this.logger.debug('GET /script.js — nenhum bundle deployado ainda');
      res.status(200).send('/* nenhum bundle deployado ainda */\n');
      return;
    }

    this.logger.debug(
      `GET /script.js — servindo bundle (atualizado em ${bundle.updatedAt}, ${bundle.content.length} chars)`,
    );
    res.status(200).send(bundle.content);
  }
}
