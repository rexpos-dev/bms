function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

export function buildDevProjectReportFilename(name: string, id: string): string {
  const slug = slugify(name);
  const idPrefix = id.slice(0, 8).toUpperCase();
  return `dev-project-${slug}-${idPrefix}.pdf`;
}
