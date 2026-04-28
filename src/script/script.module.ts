import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ScriptController } from './script.controller';
import { ScriptsController } from './scripts.controller';

@Module({
  imports: [StorageModule],
  controllers: [ScriptController, ScriptsController],
})
export class ScriptModule {}
