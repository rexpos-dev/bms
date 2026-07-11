import { describeBackupError } from './backups.service';

describe('describeBackupError', () => {
  it('surfaces the real mysqldump stderr for a runtime failure', () => {
    const err = Object.assign(new Error('Command failed'), {
      code: 2,
      stderr: "mysqldump: Got error: 1045: Access denied for user 'root'@'x' (using password: YES)\n",
    });
    expect(describeBackupError(err)).toBe(
      "mysqldump: Got error: 1045: Access denied for user 'root'@'x' (using password: YES)",
    );
  });

  it('accepts stderr delivered as a Buffer', () => {
    const err = Object.assign(new Error('Command failed'), {
      stderr: Buffer.from('mysqldump: unknown variable foo\n'),
    });
    expect(describeBackupError(err)).toBe('mysqldump: unknown variable foo');
  });

  it('falls back to the error message when there is no stderr (e.g. the JS dumper)', () => {
    expect(describeBackupError(new Error('connect ECONNREFUSED 10.0.0.1:3306'))).toBe(
      'connect ECONNREFUSED 10.0.0.1:3306',
    );
  });

  it('never throws on a nullish error', () => {
    expect(describeBackupError(undefined)).toBe('Unknown error while creating the backup');
  });
});
