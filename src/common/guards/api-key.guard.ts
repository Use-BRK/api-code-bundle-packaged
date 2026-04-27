import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key');
    const expected = this.config.get<string>('API_KEY');

    if (!expected) {
      this.logger.error(
        'API_KEY não configurada no ambiente — bloqueando requisição',
      );
      throw new UnauthorizedException('API key não configurada no servidor');
    }

    if (!provided || provided !== expected) {
      this.logger.warn(
        `Tentativa de acesso com x-api-key inválida em ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException('x-api-key ausente ou inválida');
    }

    return true;
  }
}
