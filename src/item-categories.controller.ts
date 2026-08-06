import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { ItemCategoriesService } from './item-categories.service';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from './item-category.dto';

@Controller('item-categories')
@UseGuards(JwtAuthGuard)
export class ItemCategoriesController {
  constructor(private readonly categories: ItemCategoriesService) {}

  /** List categories — any authenticated user (drives the Products tabs). */
  @Get()
  list(@Query('all') all?: string) {
    return this.categories.findAll(all === 'true');
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  create(@Body() dto: CreateItemCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  update(@Param('id') id: string, @Body() dto: UpdateItemCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
