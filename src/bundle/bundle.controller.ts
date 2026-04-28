import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { BundleService } from './bundle.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

interface DeployBundleResponse {
  success: true;
  message: string;
  deployedAt: string;
  inputSize: number;
  outputSize: number;
  blockCount: number;
  removed: string[];
  minified: boolean;
  warning?: string;
}

@Controller('bundle')
export class BundleController {
  private readonly logger = new Logger(BundleController.name);

  constructor(private readonly bundleService: BundleService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async deploy(@Body() dto: CreateBundleDto): Promise<DeployBundleResponse> {
    const summary = dto.scripts
      ? `${dto.scripts.length} scripts nomeados`
      : `content: ${dto.content?.length ?? 0} chars`;
    this.logger.log(`POST /bundle recebido (${summary})`);
    return this.bundleService.deploy(dto);
  }
}
