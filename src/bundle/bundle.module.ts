import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BundleController } from './bundle.controller';
import { BundleService } from './bundle.service';

@Module({
  imports: [StorageModule],
  controllers: [BundleController],
  providers: [BundleService],
})
export class BundleModule {}
