import { isAbsolute, join } from 'node:path';
import { envSchema, type JSONSchemaType } from 'env-schema';
import { EXPLORATION_ROOT } from './paths.ts';

// Configuration from environment variables, optionally set in exploration/.env (see .env.example).
// Environment variables take precedence over the .env file.
interface Env {
  /** Where 01-fetch-backbone reads the villages from: the live WFS or the local backup file. */
  BACKBONE_SOURCE: 'wfs' | 'backup';
  /** Backup file with villages, relative to the exploration package unless absolute. */
  BACKBONE_BACKUP_FILE: string;
}

const schema: JSONSchemaType<Env> = {
  type: 'object',
  required: ['BACKBONE_SOURCE', 'BACKBONE_BACKUP_FILE'],
  properties: {
    BACKBONE_SOURCE: { type: 'string', enum: ['wfs', 'backup'], default: 'wfs' },
    BACKBONE_BACKUP_FILE: { type: 'string', default: 'resources/verdronken_dorpen_backup.json' },
  },
};

const env = envSchema<Env>({ schema, dotenv: { path: join(EXPLORATION_ROOT, '.env') } });

export const config = {
  backboneSource: env.BACKBONE_SOURCE,
  backboneBackupFile: isAbsolute(env.BACKBONE_BACKUP_FILE)
    ? env.BACKBONE_BACKUP_FILE
    : join(EXPLORATION_ROOT, env.BACKBONE_BACKUP_FILE),
};
