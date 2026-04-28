import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { transform as esbuildTransform } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { StorageService } from '../storage/storage.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

interface DeployResult {
  success: true;
  message: string;
  deployedAt: string;
  inputSize: number;
  outputSize: number;
  blockCount: number;
  minified: boolean;
  warning?: string;
}

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(private readonly storage: StorageService) {}

  async deploy(dto: CreateBundleDto): Promise<DeployResult> {
    const blocks = this.extractScriptBlocks(dto.content);
    if (blocks.length === 0) {
      throw new BadRequestException(
        'Conteúdo vazio — envie pelo menos um script com código executável',
      );
    }

    const minifiedBlocks: string[] = [];
    const warnings: string[] = [];
    let allMinified = true;

    for (let i = 0; i < blocks.length; i++) {
      const { code, minified, warning } = await this.tryMinify(blocks[i]);
      minifiedBlocks.push(code);
      if (!minified) {
        allMinified = false;
        if (warning) warnings.push(`bloco #${i + 1}: ${warning}`);
      }
    }

    const { updatedAt } = this.storage.saveBundle(minifiedBlocks);
    const outputSize = minifiedBlocks.reduce((acc, b) => acc + b.length, 0);
    this.logger.log(
      `Bundle salvo (${blocks.length} blocos, ${dto.content.length} → ${outputSize} chars, allMinified=${allMinified}) em ${updatedAt}`,
    );

    return {
      success: true,
      message: allMinified
        ? 'Bundle deployado'
        : 'Bundle deployado com falhas parciais de minificação',
      deployedAt: updatedAt,
      inputSize: dto.content.length,
      outputSize,
      blockCount: blocks.length,
      minified: allMinified,
      ...(warnings.length ? { warning: warnings.join(' | ') } : {}),
    };
  }

  // Extrai cada <script>...</script> como bloco SEPARADO. Tolerante a
  // </script> dentro de strings/templates/comentários. Sem tags <script>,
  // trata o input inteiro como um único bloco de JS bruto.
  private extractScriptBlocks(input: string): string[] {
    if (!/<script\b/i.test(input)) {
      const trimmed = input.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }

    const blocks: string[] = [];
    let i = 0;

    while (i < input.length) {
      const openMatch = /<script\b[^>]*>/i.exec(input.slice(i));
      if (!openMatch) break;

      const bodyStart = i + openMatch.index + openMatch[0].length;
      const closeIdx = this.findScriptClose(input, bodyStart);
      const bodyEnd = closeIdx === -1 ? input.length : closeIdx;
      const body = input.slice(bodyStart, bodyEnd).trim();
      if (body.length > 0) blocks.push(body);

      if (closeIdx === -1) break;
      i = input.indexOf('>', closeIdx) + 1;
      if (i <= 0) break;
    }

    return blocks;
  }

  // Encontra o </script> de fechamento real, ignorando ocorrências dentro
  // de strings, templates e comentários.
  private findScriptClose(src: string, start: number): number {
    let i = start;
    let mode: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';

    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];

      if (mode === 'code') {
        if (ch === '/' && next === '/') { mode = 'line'; i += 2; continue; }
        if (ch === '/' && next === '*') { mode = 'block'; i += 2; continue; }
        if (ch === "'") { mode = 'sq'; i++; continue; }
        if (ch === '"') { mode = 'dq'; i++; continue; }
        if (ch === '`') { mode = 'tpl'; i++; continue; }
        if (ch === '<' && src.slice(i, i + 8).toLowerCase() === '</script') {
          return i;
        }
        i++;
        continue;
      }
      if (mode === 'line') {
        if (ch === '\n') mode = 'code';
        i++;
        continue;
      }
      if (mode === 'block') {
        if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
        i++;
        continue;
      }
      if (mode === 'sq') {
        if (ch === '\\') { i += 2; continue; }
        if (ch === "'") mode = 'code';
        i++;
        continue;
      }
      if (mode === 'dq') {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '"') mode = 'code';
        i++;
        continue;
      }
      if (mode === 'tpl') {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') mode = 'code';
        i++;
        continue;
      }
    }
    return -1;
  }

  // Pré-processa JS removendo lixos comuns que quebram parsers:
  // - BOM (U+FEFF)
  // - HTML comments legados (<!-- ... --> em borda de linha)
  // - linhas iniciadas por shebang (#!) que não são válidas em scripts no browser
  private sanitizeJs(js: string): string {
    let out = js.replace(/^﻿/, '');
    if (out.startsWith('#!')) {
      out = out.replace(/^#![^\n]*\n?/, '');
    }
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    return out.trim();
  }

  private async tryMinify(
    rawJs: string,
  ): Promise<{ code: string; minified: boolean; warning?: string }> {
    const js = this.sanitizeJs(rawJs);
    if (!js) {
      return { code: rawJs, minified: false, warning: 'Conteúdo vazio após sanitização' };
    }

    const esb = await this.tryEsbuild(js);
    if (esb.ok) return { code: esb.code, minified: true };

    const ter = await this.tryTerser(js);
    if (ter.ok) return { code: ter.code, minified: true };

    const detail = esb.error ?? ter.error ?? 'erro desconhecido';
    this.logger.warn(`esbuild e terser falharam (${detail}) — salvando JS original`);
    return {
      code: js,
      minified: false,
      warning: `Não foi possível minificar (${detail}) — bundle salvo sem minificar`,
    };
  }

  private async tryEsbuild(
    js: string,
  ): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
    try {
      const result = await esbuildTransform(js, {
        loader: 'js',
        minify: true,
        target: 'es2020',
        legalComments: 'none',
        logLevel: 'silent',
      });
      const code = result.code?.trim();
      if (!code) return { ok: false, error: 'esbuild produziu código vazio' };
      return { ok: true, code };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`esbuild falhou: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  private async tryTerser(
    js: string,
  ): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
    try {
      const result = await terserMinify(js, {
        ecma: 2020,
        compress: { negate_iife: false },
        mangle: true,
        format: { comments: false, beautify: false, semicolons: true },
      });
      const code = result.code?.trim();
      if (!code) return { ok: false, error: 'terser produziu código vazio' };
      return { ok: true, code };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`terser falhou: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
