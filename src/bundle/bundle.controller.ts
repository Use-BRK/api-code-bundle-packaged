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
    this.logger.log(
      `POST /bundle recebido (content: ${dto.content.length} chars)`,
    );
    return this.bundleService.deploy(dto);
  }
}
