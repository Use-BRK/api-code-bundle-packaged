import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ScriptController } from './script.controller';

@Module({
  imports: [StorageModule],
  controllers: [ScriptController],
})
export class ScriptModule {}
