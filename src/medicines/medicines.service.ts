import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class MedicinesService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST') ?? 'localhost',
      port: Number(this.config.get<number>('DB_PORT') ?? 5432),
      user: this.config.get<string>('DB_USER') ?? 'postgres',
      password: this.config.get<string>('DB_PASSWORD') ?? 'postgres',
      database: this.config.get<string>('DB_NAME') ?? 'electronic_shell',
    });
  }

  async findAll(limit = 100) {
    const res = await this.pool.query('SELECT * FROM medicine_dictionary ORDER BY id LIMIT $1', [limit]);
    return res.rows;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
