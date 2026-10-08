import { integer, real, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('sessions_expiry').on(table.expiresAt)],
);
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('projects_owner').on(table.ownerId)],
);
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull(),
    keySalt: text('key_salt').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
  },
  (table) => [index('api_keys_project').on(table.projectId)],
);
export const modelPricing = sqliteTable(
  'model_pricing',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputNanoUsdPerMillion: text('input_nano_usd_per_million').notNull(),
    outputNanoUsdPerMillion: text('output_nano_usd_per_million').notNull(),
    currency: text('currency').notNull().default('USD'),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    sourceUrl: text('source_url').notNull(),
    simulated: integer('simulated', { mode: 'boolean' }).notNull().default(false),
    verifiedAt: text('verified_at'),
    billingBasis: text('billing_basis'),
  },
  (table) => [index('pricing_lookup').on(table.provider, table.model, table.effectiveFrom)],
);
export const traces = sqliteTable(
  'traces',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    traceId: text('trace_id').notNull(),
    parentSpanId: text('parent_span_id'),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: text('status', { enum: ['success', 'error'] }).notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at').notNull(),
    durationMs: real('duration_ms').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    estimatedCostNanoUsd: integer('estimated_cost_nano_usd'),
    pricingVersion: text('pricing_version').references(() => modelPricing.id),
    errorType: text('error_type', {
      enum: ['timeout', 'rate_limit', 'network', 'application', 'unknown'],
    }),
    errorMessage: text('error_message'),
    errorCapturePolicy: text('error_capture_policy'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('traces_project_trace').on(table.projectId, table.traceId),
    index('traces_project_time').on(table.projectId, table.startedAt, table.traceId),
    index('traces_project_status_time').on(table.projectId, table.status, table.startedAt),
    index('traces_project_model_time').on(
      table.projectId,
      table.provider,
      table.model,
      table.startedAt,
    ),
  ],
);
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('rate_limits_expiry').on(table.expiresAt)],
);
