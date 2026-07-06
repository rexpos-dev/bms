import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientType, UserRole } from '@prisma/client';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './create-client.dto';
import { UpdateClientDto } from './update-client.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER)
  @Get()
  findAll(@Query('type') type?: ClientType) {
    return this.clientsService.findAll(type);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
