import { Module } from '@nestjs/common';
import { ItemCategoriesService } from './item-categories.service';
import { ItemCategoriesController } from './item-categories.controller';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ItemCategoriesService],
  controllers: [ItemCategoriesController],
  exports: [ItemCategoriesService],
})
export class ItemCategoriesModule {}
