import { describe, expect, it } from 'vitest';
import { buildDevProjectReportFilename } from './dev-project-report-filename.util';

describe('buildDevProjectReportFilename', () => {
  it('slugifies the project name and uppercases the id prefix', () => {
    expect(buildDevProjectReportFilename('Inventory System v2', 'a1b2c3d4-e5f6-7890')).toBe(
      'dev-project-inventory-system-v2-A1B2C3D4.pdf',
    );
  });

  it('collapses non-alphanumeric characters and trims leading/trailing dashes', () => {
    expect(buildDevProjectReportFilename('  --POS™ (Mobile)!!--  ', 'abcdef1234567890')).toBe(
      'dev-project-pos-mobile-ABCDEF12.pdf',
    );
  });

  it('falls back to "project" when the name has no alphanumeric characters', () => {
    expect(buildDevProjectReportFilename('!!!', 'abcdef1234567890')).toBe('dev-project-project-ABCDEF12.pdf');
  });
});
