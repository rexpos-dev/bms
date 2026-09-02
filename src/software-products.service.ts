import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

@Injectable()
export class SoftwareProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto) {
    return this.prisma.softwareProduct.create({ data: dto });
  }

  findAll() {
    return this.prisma.softwareProduct.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const product = await this.prisma.softwareProduct.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Software product ${id} not found`);
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.softwareProduct.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const [licenseCount, jobOrderCount] = await Promise.all([
      this.prisma.license.count({ where: { productId: id } }),
      this.prisma.jobOrder.count({ where: { productId: id } }),
    ]);
    if (licenseCount > 0 || jobOrderCount > 0) {
      throw new ConflictException(
        `This product is used by ${licenseCount} license(s) and ${jobOrderCount} job order(s), and can't be deleted while they exist.`,
      );
    }
    await this.prisma.softwareProduct.delete({ where: { id } });
  }
}
