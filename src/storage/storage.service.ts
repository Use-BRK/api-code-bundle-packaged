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

interface ScriptBlockRow {
  name: string;
  content: string;
  active: number;
  position: number;
  updated_at: string;
}

export interface ScriptBlock {
  name: string;
  content: string;
  active: boolean;
  position: number;
  updatedAt: string;
}

export interface StoredBundle {
  blocks: string[];
  updatedAt: string;
}

export interface SyncResult {
  saved: ScriptBlock[];
  removed: string[];
  syncedAt: string;
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
      );
      CREATE TABLE IF NOT EXISTS script_block (
        name TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_script_block_active_position
        ON script_block(active, position);
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

  // Sincroniza o conjunto de scripts. Faz upsert preservando o estado `active`
  // dos que já existem; novos scripts entram como ativos. Remove do banco os
  // scripts ausentes da lista (i.e. apagados no source).
  syncScripts(items: { name: string; content: string }[]): SyncResult {
    const syncedAt = new Date().toISOString();
    const incomingNames = new Set(items.map((s) => s.name));

    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT name FROM script_block')
        .all() as { name: string }[];
      const removed: string[] = [];
      for (const row of existing) {
        if (!incomingNames.has(row.name)) {
          this.db
            .prepare('DELETE FROM script_block WHERE name = ?')
            .run(row.name);
          removed.push(row.name);
        }
      }

      const upsert = this.db.prepare(
        `INSERT INTO script_block (name, content, active, position, updated_at)
         VALUES (@name, @content, 1, @position, @syncedAt)
         ON CONFLICT(name) DO UPDATE SET
           content = excluded.content,
           position = excluded.position,
           updated_at = excluded.updated_at`,
      );
      items.forEach((item, idx) => {
        upsert.run({
          name: item.name,
          content: item.content,
          position: idx,
          syncedAt,
        });
      });

      return removed;
    });

    const removed = tx();

    return {
      saved: this.listScripts(),
      removed,
      syncedAt,
    };
  }

  listScripts(): ScriptBlock[] {
    const rows = this.db
      .prepare(
        `SELECT name, content, active, position, updated_at
         FROM script_block ORDER BY position ASC, name ASC`,
      )
      .all() as ScriptBlockRow[];
    return rows.map((r) => ({
      name: r.name,
      content: r.content,
      active: r.active === 1,
      position: r.position,
      updatedAt: r.updated_at,
    }));
  }

  getActiveBlocks(): { blocks: string[]; updatedAt: string | null } {
    const rows = this.db
      .prepare(
        `SELECT content, updated_at FROM script_block
         WHERE active = 1 ORDER BY position ASC, name ASC`,
      )
      .all() as { content: string; updated_at: string }[];

    if (rows.length === 0) return { blocks: [], updatedAt: null };

    const updatedAt = rows
      .map((r) => r.updated_at)
      .sort()
      .pop() as string;
    return { blocks: rows.map((r) => r.content), updatedAt };
  }

  setScriptActive(name: string, active: boolean): ScriptBlock | null {
    const updatedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE script_block SET active = ?, updated_at = ? WHERE name = ?`,
      )
      .run(active ? 1 : 0, updatedAt, name);
    if (result.changes === 0) return null;

    const row = this.db
      .prepare(
        `SELECT name, content, active, position, updated_at
         FROM script_block WHERE name = ?`,
      )
      .get(name) as ScriptBlockRow | undefined;
    if (!row) return null;
    return {
      name: row.name,
      content: row.content,
      active: row.active === 1,
      position: row.position,
      updatedAt: row.updated_at,
    };
  }
}
