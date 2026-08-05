import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AgreementSectionDto, SaveAgreementTemplateDto } from './save-agreement-template.dto';

const SECTIONS_INCLUDE = { sections: { orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class AgreementTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current template. Null on a database seeded before this feature existed. */
  getLatest() {
    return this.prisma.agreementVersion.findFirst({
      orderBy: { versionNo: 'desc' },
      include: SECTIONS_INCLUDE,
    });
  }

  listVersions() {
    return this.prisma.agreementVersion.findMany({
      orderBy: { versionNo: 'desc' },
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { jobOrders: true } },
      },
    });
  }

  async getVersion(id: string) {
    const version = await this.prisma.agreementVersion.findUnique({
      where: { id },
      include: SECTIONS_INCLUDE,
    });
    if (!version) throw new NotFoundException('Agreement version not found');
    return version;
  }

  async save(dto: SaveAgreementTemplateDto, userId: string) {
    const latest = await this.getLatest();
    // Opening the tab and pressing Save should not mint an identical version.
    if (latest && sameContent(latest.sections, dto.sections)) return latest;

    return this.prisma.$transaction(async (tx) => {
      const top = await tx.agreementVersion.findFirst({
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });

      return tx.agreementVersion.create({
        data: {
          versionNo: (top?.versionNo ?? 0) + 1,
          note: dto.note ?? null,
          createdById: userId,
          sections: {
            createMany: {
              data: dto.sections.map((s, i) => ({ heading: s.heading, body: s.body, sortOrder: i })),
            },
          },
        },
        include: SECTIONS_INCLUDE,
      });
    });
  }
}

function sameContent(
  stored: { heading: string; body: string }[],
  submitted: AgreementSectionDto[],
): boolean {
  if (stored.length !== submitted.length) return false;
  return stored.every((s, i) => s.heading === submitted[i].heading && s.body === submitted[i].body);
}
