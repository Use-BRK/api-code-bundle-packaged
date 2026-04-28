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

    if (!bundle || bundle.blocks.length === 0) {
      this.logger.debug('GET /script.js — nenhum bundle deployado ainda');
      res.status(200).send('/* nenhum bundle deployado ainda */\n');
      return;
    }

    const loader = this.buildLoader(bundle.blocks);
    this.logger.debug(
      `GET /script.js — servindo loader com ${bundle.blocks.length} blocos (atualizado em ${bundle.updatedAt})`,
    );
    res.status(200).send(loader);
  }

  // Gera um JS que, ao executar, injeta cada bloco como um <script> próprio.
  // Cada bloco roda em seu próprio elemento, então: erro de sintaxe num bloco
  // não impede os próximos de executar e o callstack de erros é separado.
  private buildLoader(blocks: string[]): string {
    const blocksJson = JSON.stringify(blocks);
    return (
      `/* chatwoot-script-bundle — ${blocks.length} blocos */\n` +
      `(function(){` +
      `var blocks=${blocksJson};` +
      `var parent=document.head||document.documentElement;` +
      `for(var i=0;i<blocks.length;i++){` +
      `try{` +
      `var s=document.createElement('script');` +
      `s.setAttribute('data-bundle-block',String(i+1));` +
      `s.textContent=blocks[i];` +
      `parent.appendChild(s);` +
      `}catch(e){` +
      `(window.console&&console.error)&&console.error('[bundle] bloco '+(i+1)+' falhou:',e);` +
      `}` +
      `}` +
      `})();\n`
    );
  }
}
