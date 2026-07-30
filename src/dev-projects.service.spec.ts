import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DevProjectsService } from './dev-projects.service';

type ChecklistRow = {
  label: string;
  done: boolean;
  doneAt?: string | null;
  doneBy?: string | null;
  note?: string | null;
};

const AUTHOR = {
  id: 'dev-1',
  role: UserRole.DEVELOPER,
  fullName: 'Nelmarjim Luna',
};

function buildService(checklist: ChecklistRow[]) {
  const prisma = {
    devProjectReport: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'report-1',
        projectId: 'proj-1',
        authorId: AUTHOR.id,
        title: 'Weekly progress update',
        checklist,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    devProject: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'proj-1',
        developerId: AUTHOR.id,
        reports: [],
      }),
    },
  };
  const notifications = { notify: jest.fn() };
  const service = new DevProjectsService(
    prisma as never,
    notifications as never,
  );
  return { service, prisma, notifications };
}

/** The checklist array handed to prisma.update on the last call. */
function savedChecklist(prisma: ReturnType<typeof buildService>['prisma']) {
  const call = prisma.devProjectReport.update.mock.calls.at(-1) as [
    { data: { checklist: ChecklistRow[] } },
  ];
  return call[0].data.checklist;
}

describe('DevProjectsService.updateChecklistItem', () => {
  it('stamps doneAt and doneBy when the author ticks an item', async () => {
    const { service, prisma } = buildService([
      { label: 'Configure Prettier', done: false },
      { label: 'Setup Git repository', done: false },
    ]);

    const before = Date.now();
    await service.updateChecklistItem(
      'report-1',
      { index: 0, done: true },
      AUTHOR,
    );

    const saved = savedChecklist(prisma);
    expect(saved[0].done).toBe(true);
    expect(saved[0].doneBy).toBe('Nelmarjim Luna');
    expect(new Date(saved[0].doneAt!).getTime()).toBeGreaterThanOrEqual(before);
    // Untouched items are preserved as-is.
    expect(saved[1]).toEqual({ label: 'Setup Git repository', done: false });
  });

  it('clears doneAt and doneBy when an item is unticked', async () => {
    const { service, prisma } = buildService([
      {
        label: 'Configure Prettier',
        done: true,
        doneAt: '2026-07-29T02:00:00.000Z',
        doneBy: 'Nelmarjim Luna',
      },
    ]);

    await service.updateChecklistItem(
      'report-1',
      { index: 0, done: false },
      AUTHOR,
    );

    const saved = savedChecklist(prisma);
    expect(saved[0].done).toBe(false);
    expect(saved[0].doneAt).toBeNull();
    expect(saved[0].doneBy).toBeNull();
  });

  it('keeps the original doneAt when only the note changes', async () => {
    const { service, prisma } = buildService([
      {
        label: 'Configure Prettier',
        done: true,
        doneAt: '2026-07-29T02:00:00.000Z',
        doneBy: 'Nelmarjim Luna',
      },
    ]);

    await service.updateChecklistItem(
      'report-1',
      { index: 0, note: '  used the shared eslint config  ' },
      AUTHOR,
    );

    const saved = savedChecklist(prisma);
    expect(saved[0].note).toBe('used the shared eslint config');
    expect(saved[0].doneAt).toBe('2026-07-29T02:00:00.000Z');
    expect(saved[0].done).toBe(true);
  });

  it('treats a blank note as clearing it', async () => {
    const { service, prisma } = buildService([
      { label: 'Configure Prettier', done: false, note: 'old note' },
    ]);

    await service.updateChecklistItem(
      'report-1',
      { index: 0, note: '   ' },
      AUTHOR,
    );

    expect(savedChecklist(prisma)[0].note).toBeNull();
  });

  it('lets a super admin edit someone else’s report', async () => {
    const { service, prisma } = buildService([
      { label: 'Configure Prettier', done: false },
    ]);

    await service.updateChecklistItem(
      'report-1',
      { index: 0, done: true },
      {
        id: 'admin-1',
        role: UserRole.SUPER_ADMIN,
        fullName: 'Super Admin',
      },
    );

    expect(savedChecklist(prisma)[0].doneBy).toBe('Super Admin');
  });

  it('rejects a developer who did not author the report', async () => {
    const { service, prisma } = buildService([
      { label: 'Configure Prettier', done: false },
    ]);

    await expect(
      service.updateChecklistItem(
        'report-1',
        { index: 0, done: true },
        {
          id: 'dev-2',
          role: UserRole.DEVELOPER,
          fullName: 'Other Dev',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.devProjectReport.update).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range index', async () => {
    const { service, prisma } = buildService([
      { label: 'Configure Prettier', done: false },
    ]);

    await expect(
      service.updateChecklistItem('report-1', { index: 5, done: true }, AUTHOR),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.devProjectReport.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown report', async () => {
    const { service, prisma } = buildService([]);
    prisma.devProjectReport.findUnique.mockResolvedValue(null);

    await expect(
      service.updateChecklistItem('nope', { index: 0, done: true }, AUTHOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
