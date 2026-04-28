import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { ScriptBlock, StorageService } from '../storage/storage.service';

class ToggleScriptDto {
  @IsBoolean({ message: 'active deve ser boolean' })
  active!: boolean;
}

interface ScriptListResponse {
  scripts: Array<{
    name: string;
    active: boolean;
    position: number;
    sizeBytes: number;
    updatedAt: string;
  }>;
}

interface ToggleScriptResponse {
  name: string;
  active: boolean;
  position: number;
  updatedAt: string;
}

@Controller('scripts')
export class ScriptsController {
  private readonly logger = new Logger(ScriptsController.name);

  constructor(private readonly storage: StorageService) {}

  @Get()
  list(): ScriptListResponse {
    const scripts = this.storage.listScripts();
    return {
      scripts: scripts.map((s) => ({
        name: s.name,
        active: s.active,
        position: s.position,
        sizeBytes: Buffer.byteLength(s.content, 'utf8'),
        updatedAt: s.updatedAt,
      })),
    };
  }

  @Patch(':name')
  toggle(
    @Param('name') name: string,
    @Body() dto: ToggleScriptDto,
  ): ToggleScriptResponse {
    const decoded = decodeURIComponent(name);
    const updated: ScriptBlock | null = this.storage.setScriptActive(
      decoded,
      dto.active,
    );
    if (!updated) {
      throw new NotFoundException(`Script "${decoded}" não encontrado`);
    }
    this.logger.log(
      `Script "${decoded}" ${dto.active ? 'ativado' : 'desativado'}`,
    );
    return {
      name: updated.name,
      active: updated.active,
      position: updated.position,
      updatedAt: updated.updatedAt,
    };
  }
}
