import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface BundleRow {
  content: string;
  updated_at: string;
}

export interface StoredBundle {
  blocks: string[];
  updatedAt: string;
}

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const dbPath = this.config.get<string>(
      'BUNDLE_DB_PATH',
      './data/bundle.sqlite',
    );

    const absPath = path.resolve(dbPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(absPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bundle (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.logger.log(`SQLite inicializado em ${absPath}`);
  }

  onModuleDestroy(): void {
    if (this.db) {
      this.db.close();
    }
  }

  saveBundle(blocks: string[]): StoredBundle {
    const updatedAt = new Date().toISOString();
    const content = JSON.stringify(blocks);
    this.db
      .prepare(
        `INSERT INTO bundle (id, content, updated_at)
         VALUES (1, @content, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           updated_at = excluded.updated_at`,
      )
      .run({ content, updatedAt });

    return { blocks, updatedAt };
  }

  getBundle(): StoredBundle | null {
    const row = this.db
      .prepare('SELECT content, updated_at FROM bundle WHERE id = 1')
      .get() as BundleRow | undefined;

    if (!row) return null;

    let blocks: string[] = [];
    try {
      const parsed = JSON.parse(row.content);
      if (Array.isArray(parsed)) {
        blocks = parsed.filter((b): b is string => typeof b === 'string');
      } else if (typeof parsed === 'string' && parsed.length > 0) {
        blocks = [parsed];
      }
    } catch {
      // formato legado — bundle armazenado como blob de JS único
      if (row.content.trim().length > 0) blocks = [row.content];
    }
    return { blocks, updatedAt: row.updated_at };
  }
}
