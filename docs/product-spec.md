# TraceAI — Product & Engineering Specification

**Version:** 1.0
**Status:** Ready for implementation
**Type:** Open-source SaaS / Portfolio Project
**Priority:** Production-quality MVP
**Budget:** $0/month within free-tier limits

---

## 1. Project Overview

TraceAI is an open-source LLM observability platform that helps developers monitor, debug, and analyze AI API requests.

Developers integrate TraceAI through a lightweight TypeScript SDK. The SDK captures request execution metadata and sends telemetry events to the TraceAI backend.

The dashboard visualizes:

- LLM request volume
- Request latency (average, P50, P95, P99)
- Token usage
- Estimated API costs
- Request success and failure rates
- Model performance comparisons
- Individual request traces
- Error details and debugging metadata

**Core product goal:**

Allow developers to understand how their AI applications perform without building their own observability infrastructure.

### Primary Users

- AI application developers
- Full-stack engineers
- Indie hackers building AI SaaS
- Small engineering teams
- Developers experimenting with multiple LLM providers

### Product Principles

1. Developer-first experience.
2. Simple installation and integration.
3. Fast, responsive dashboard.
4. Privacy-first data collection.
5. Minimal infrastructure complexity.
6. No mandatory paid APIs or services.
7. Type-safe architecture.
8. Production-quality code and documentation.

---

## 2. Technical Stack

### Monorepo

- Bun workspaces
- TypeScript strict mode
- Shared ESLint and Prettier configuration

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TanStack Table
- Recharts
- React Hook Form
- Zod
- Lucide React

### Backend

- Hono
- Cloudflare Workers
- Zod request validation
- Drizzle ORM
- Cloudflare D1 (SQLite)

### SDK

- TypeScript
- Native Fetch API
- Zod
- Framework-independent implementation

### Testing

- Vitest for unit and integration tests
- Playwright for end-to-end tests
- Mock AI providers
- Cloudflare-compatible local integration testing

### Deployment

- Cloudflare Workers for backend API
- Cloudflare D1 for database
- Next.js dashboard deployed using a currently supported Cloudflare adapter
- GitHub Actions for CI

Do not require a custom domain, credit card, paid database, paid AI API, or paid hosting plan.

Verify deployment adapter compatibility before implementation. Prefer supported, stable approaches over experimental features.

---

## 3. System Architecture

The system consists of four major components:

1. TypeScript SDK
2. Telemetry Ingestion API
3. Database and Analytics API
4. Web Dashboard

### Data Flow

Developer Application
↓
TraceAI TypeScript SDK
↓
HTTP POST /v1/events/batch
↓
Cloudflare Worker / Hono API
↓
Validation / Authentication / Sanitization
↓
Cloudflare D1
↓
Analytics API
↓
Next.js Dashboard

### Architectural Requirements

- Separate ingestion from dashboard query endpoints.
- SDK must not depend on React or Next.js.
- Use shared TypeScript types where practical.
- Ensure all queries are scoped by project.
- Avoid transmitting raw prompts and responses by default.
- Implement bounded batch ingestion.
- Support asynchronous, non-blocking telemetry submission.
- Handle telemetry failures gracefully without affecting the developer's AI application.
- Use UTC timestamps internally.
- Avoid introducing Redis, Kafka, or paid infrastructure for MVP.

---

## 4. Monorepo Structure

Use the following structure:

```text
traceai/
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   │   ├── (auth)/
│   │   │   ├── (dashboard)/
│   │   │   └── demo/
│   │   ├── src/components/
│   │   ├── src/features/
│   │   ├── src/hooks/
│   │   └── src/lib/
│   │
│   └── api/
│       ├── src/routes/
│       ├── src/middleware/
│       ├── src/services/
│       ├── src/repositories/
│       └── src/lib/
│
├── packages/
│   ├── sdk/
│   ├── shared/
│   ├── database/
│   └── config/
│
├── examples/
│   └── node-demo/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── sdk.md
│
├── .github/workflows/
├── bun.lock
├── package.json
└── README.md
```

Separate business logic from database access and HTTP routing.

Avoid unnecessary abstraction, but maintain clean module boundaries.

---

## 5. MVP Features

### 5.1 Project Management

Users can create and manage projects.

Each project represents an AI application being monitored.

Required features:

- Create project
- Rename project
- List projects
- Delete project with confirmation
- Generate ingestion API key
- Revoke and rotate API key
- View SDK integration instructions

Project fields:

- ID
- Name
- Description
- Created timestamp
- Updated timestamp

API key requirements:

- Generate cryptographically secure random keys.
- Store only salted, securely hashed keys.
- Show the raw key only once.
- Support key revocation.
- Scope ingestion keys to one project.
- Never expose ingestion keys in browser bundles.

### 5.2 Authentication

Implement simple, secure authentication for dashboard management.

Requirements:

- Email/password authentication for MVP.
- Password hashing using a Worker-compatible implementation.
- Secure HTTP-only session cookies.
- Logout and session expiration.
- Login rate limiting.
- CSRF protection for cookie-authenticated mutations.
- Project ownership authorization on every dashboard API request.

Do not implement complex OAuth flows in MVP.

Demo mode must be publicly accessible without requiring registration.

Demo users must not have write access to real projects.

### 5.3 TypeScript SDK

Create a standalone package:

`@traceai/sdk`

The SDK allows developers to wrap asynchronous AI operations.

Example:

```typescript
import { TraceAI } from '@traceai/sdk';

const traceai = new TraceAI({
  apiKey: process.env.TRACEAI_API_KEY!,
  endpoint: process.env.TRACEAI_ENDPOINT!,
});

const result = await traceai.trace(
  {
    name: 'generate-summary',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    metadata: {
      feature: 'document-summary',
    },
  },
  async () => {
    return generateSummary();
  },
);
```

The example model identifier is illustrative. It must not be treated as a hard-coded current pricing entry.

The SDK should automatically capture:

- Trace ID
- Operation name
- Start and end timestamps
- Duration
- Status
- Provider
- Model
- Error category
- Optional custom metadata

Support explicit usage reporting:

```typescript
await traceai.trace(
  {
    name: 'chat-completion',
    provider: 'openai',
    model: 'example-model',
  },
  async (span) => {
    const response = await callModel();

    span.setUsage({
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    return response;
  },
);
```

Do not assume all AI providers expose identical usage fields.

Support custom user-supplied token usage and optional provider-specific adapters later.

#### SDK Reliability

- Batch events before sending.
- Configurable batch size.
- Configurable flush interval.
- Retry transient failures with exponential backoff and jitter.
- Enforce maximum retry attempts.
- Use a bounded in-memory queue.
- Do not block application requests on telemetry submission.
- Preserve original application errors.
- Support explicit `flush()` and `shutdown()` methods.
- Support an `enabled` configuration.
- Support request timeouts.
- Never log API keys.
- Keep package dependencies minimal.

The trace wrapper must return the original function result and rethrow the original error when an operation fails.

Telemetry errors must not replace application errors.

#### Privacy

By default, do not collect:

- Raw prompts
- AI responses
- Authentication tokens
- Authorization headers
- Personal information

Only send explicitly provided metadata.

Enforce payload size limits and document the risks of custom metadata.

---

## 6. Telemetry Data Model

Use Drizzle ORM with Cloudflare D1.

### Tables

#### users

- id
- email (unique)
- password_hash
- created_at
- updated_at

#### sessions

- id
- user_id
- expires_at
- created_at

#### projects

- id
- owner_id
- name
- description
- created_at
- updated_at

#### api_keys

- id
- project_id
- key_hash
- key_prefix
- created_at
- last_used_at
- revoked_at

#### traces

- id
- project_id
- trace_id
- parent_span_id (nullable)
- name
- provider
- model
- status
- started_at
- ended_at
- duration_ms
- input_tokens
- output_tokens
- estimated_cost_usd
- pricing_version
- error_type
- error_message
- metadata_json
- created_at

#### model_pricing

- id
- provider
- model
- input_price_per_million
- output_price_per_million
- currency
- effective_from
- effective_to
- source_url

### Database Requirements

- Foreign keys for project relationships.
- Index on project_id and started_at.
- Index on project_id, status and started_at.
- Unique constraint on project_id and trace_id for MVP.
- Use database migrations.
- Use parameterized queries.
- Avoid unrestricted full-table scans.
- Use cursor-based pagination for traces.
- Store monetary calculations with sufficient decimal precision.
- Do not use floating-point values as the authoritative representation of costs.

For MVP, each trace represents one SDK operation. Parent-child span relationships can be supported later.

Implement idempotent ingestion using the project-scoped trace identifier.

---

## 7. Telemetry API

### POST /v1/events/batch

Accept multiple telemetry events.

Authentication:

`Authorization: Bearer <PROJECT_API_KEY>`

Example request:

```json
{
  "events": [
    {
      "traceId": "trace_123",
      "name": "generate-summary",
      "provider": "gemini",
      "model": "example-model",
      "status": "success",
      "startedAt": "2026-10-09T10:00:00Z",
      "endedAt": "2026-10-09T10:00:01Z",
      "durationMs": 1000,
      "inputTokens": 1200,
      "outputTokens": 350,
      "metadata": {
        "feature": "summary"
      }
    }
  ]
}
```

### Validation

- Validate payload with Zod.
- Reject unauthorized requests.
- Limit batch size.
- Limit payload size.
- Reject invalid timestamps and negative durations.
- Validate token counts.
- Prevent duplicate insertion.
- Reject oversized metadata.
- Implement basic rate limiting suitable for free-tier infrastructure.

Return accepted counts and duplicate counts.

Clearly define whether invalid events reject the whole batch. For MVP, use atomic batch validation: reject the entire request if any event is invalid.

Use appropriate HTTP status codes, including 400, 401, 413, 429 and 500.

---

## 8. Analytics API

All dashboard endpoints require authenticated project ownership, except public read-only demo data.

### Endpoints

```text
GET    /v1/projects
POST   /v1/projects
PATCH  /v1/projects/:id
DELETE /v1/projects/:id

POST   /v1/projects/:id/api-keys
GET    /v1/projects/:id/api-keys
DELETE /v1/projects/:id/api-keys/:keyId

GET    /v1/projects/:id/overview
GET    /v1/projects/:id/metrics
GET    /v1/projects/:id/models
GET    /v1/projects/:id/traces
GET    /v1/projects/:id/traces/:traceId
```

### Query Parameters

- from
- to
- provider
- model
- status
- cursor
- limit

### Overview Metrics

Return:

- Total requests
- Successful requests
- Failed requests
- Error rate
- Average latency
- P50 latency
- P95 latency
- P99 latency
- Total input tokens
- Total output tokens
- Estimated total cost

Use a deterministic percentile calculation documented in code.

For MVP, calculate metrics from bounded time windows and indexed queries. Avoid scanning unlimited historical data.

---

## 9. Dashboard UI

### Design Direction

Create a modern developer-tool dashboard inspired by professional observability products.

Visual characteristics:

- Dark-first interface
- Minimal, technical aesthetic
- Neutral backgrounds
- Subtle borders
- Clear typography
- Strong visual hierarchy
- Responsive layout
- Skeleton loading states
- Useful empty states
- Consistent spacing
- Accessible keyboard navigation
- Accessible chart labels

Avoid excessive animations or decorative gradients.

### Layout

Sidebar:

- Overview
- Traces
- Models
- Projects
- Settings
- Documentation

Top navigation:

- Project selector
- Date range selector
- Theme toggle
- User menu

### 9.1 Overview Page

Route:

`/dashboard/[projectId]`

Display KPI cards:

1. Total Requests
2. Average Latency
3. Error Rate
4. Estimated Cost

Charts:

- Request Volume Over Time
- Latency Over Time
- Token Usage Over Time
- Estimated Cost Over Time
- Requests by Provider
- Model Usage Distribution

Include date filters:

- Last 24 hours
- Last 7 days
- Last 30 days
- Custom date range

### 9.2 Traces Page

Route:

`/dashboard/[projectId]/traces`

Use TanStack Table.

Columns:

- Trace ID
- Operation
- Provider
- Model
- Status
- Latency
- Tokens
- Estimated Cost
- Timestamp

Features:

- Server-side pagination
- Provider filtering
- Model filtering
- Status filtering
- Date filtering
- Sorting
- Search by trace ID
- Click to view trace details

### 9.3 Trace Detail Page

Route:

`/dashboard/[projectId]/traces/[traceId]`

Display:

- Request metadata
- Status
- Provider
- Model
- Start time
- End time
- Duration
- Token usage
- Estimated cost
- Error details
- Custom metadata

Include an execution timeline visualization.

For MVP, display one operation per trace. Do not falsely present a distributed span tree unless nested spans are implemented.

### 9.4 Model Analytics Page

Route:

`/dashboard/[projectId]/models`

Compare models by:

- Request count
- Average latency
- P95 latency
- Success rate
- Token usage
- Estimated cost

Provide a comparison table and relevant charts.

Do not claim to measure model quality or accuracy unless evaluations have actually been performed.

### 9.5 Project Settings

Allow:

- Edit project name
- Manage ingestion API keys
- View SDK instructions
- Copy integration examples
- Delete project

Never display raw API keys after initial creation.

---

## 10. Cost Estimation

Cost calculation must not depend on a paid external service.

Use a local versioned pricing registry.

Formula:

Estimated Cost =
(Input Tokens / 1,000,000 × Input Price) +
(Output Tokens / 1,000,000 × Output Price)

Important:

- Pricing data may become outdated.
- Every entry must include its source and effective date.
- Never invent prices.
- Do not silently substitute pricing for an unknown model.
- If pricing is unknown, return a null estimated cost.
- Display "Pricing unavailable" instead of $0.
- Keep historical pricing versions.
- Distinguish estimated cost from provider-billed cost.

For demo mode, explicitly label all prices as simulated.

---

## 11. Demo Mode

Implement a publicly accessible demo:

`/demo`

Demo mode is important because recruiters should be able to explore TraceAI without creating an account or providing an API key.

### Demo Data

Create deterministic seed data with:

- 10,000 simulated requests
- Multiple AI providers
- Multiple models
- Variable latency
- Realistic token distributions
- Successful and failed requests
- Historical timestamps covering 30 days
- Different error categories

All demo data must be clearly labeled as simulated.

### Demo Behavior

- Public read-only access
- Working filters
- Working charts
- Working trace details
- Working pagination
- No ability to modify projects
- No ability to create API keys

Create a reusable seed script.

The demo must not consume paid AI API requests.

---

## 12. Security

Mandatory security requirements:

- Hash passwords securely.
- Hash project API keys.
- Protect dashboard routes.
- Enforce project ownership.
- Validate all API inputs.
- Implement rate limiting.
- Prevent SQL injection.
- Escape user-controlled UI content.
- Apply appropriate CORS restrictions.
- Do not expose database credentials.
- Do not expose environment secrets.
- Limit ingestion payload size.
- Avoid capturing sensitive AI request content by default.
- Sanitize error messages before storage.
- Avoid logging raw authentication tokens.

Never trust project IDs supplied by clients without authorization checks.

---

## 13. Performance Requirements

MVP performance targets:

- Dashboard initial load: aim for under 3 seconds on a normal connection.
- Analytics API: aim for P95 under 500 ms for bounded queries on representative demo data.
- SDK overhead: minimal and non-blocking.
- SDK should batch telemetry rather than send one network request per event.
- Trace list must use server-side pagination.
- Avoid N+1 database queries.
- Use appropriate composite indexes.
- Avoid sending unnecessary metadata.

Performance targets are goals, not guarantees.

Include a repeatable benchmark procedure in documentation.

---

## 14. Testing Requirements

### Unit Tests

Test:

- SDK trace wrapper
- Error propagation
- Duration calculation
- Usage collection
- Event batching
- Retry behavior
- Idempotency
- Price calculation
- Percentile calculation
- Input validation

### Integration Tests

Test:

- API key authentication
- Project isolation
- Trace ingestion
- Duplicate event handling
- Database writes
- Analytics queries
- API validation failures

### E2E Tests

Use Playwright.

Test:

1. User login
2. Create project
3. Generate API key
4. Ingest demo events
5. View dashboard
6. Filter traces
7. View trace detail
8. Revoke API key
9. Verify revoked key cannot ingest data

Also test the public read-only demo without authentication.

---

## 15. Developer Experience

Provide:

- README.md
- .env.example
- Local setup instructions
- Database migration commands
- Database seed commands
- SDK usage examples
- Architecture diagram
- API documentation
- Deployment guide
- Troubleshooting guide

Required commands:

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

The project should run locally without any external AI provider credentials.

Use realistic simulated telemetry for development.

Do not introduce external SaaS dependencies unless optional.

---

## 16. CI/CD

Create GitHub Actions workflows.

For pull requests:

1. Install dependencies
2. Run ESLint
3. Run TypeScript checks
4. Run unit tests
5. Run integration tests
6. Build all packages

Provide a manual production deployment command.

Do not automatically deploy until the Cloudflare environment has been configured.

Deployment secrets must use GitHub Secrets or Cloudflare secret storage.

Never commit deployment tokens.

---

## 17. Implementation Phases

### Phase 1 — Foundation

- Initialize monorepo
- Configure TypeScript
- Configure shared lint rules
- Create Next.js frontend
- Create Hono API
- Configure D1
- Configure Drizzle
- Implement migrations
- Create shared schemas

**Deliverable:** Running frontend, backend, and database.

### Phase 2 — Core Telemetry

- Build ingestion endpoint
- Implement API key authentication
- Implement telemetry validation
- Implement trace repository
- Implement TypeScript SDK
- Implement batching and retry
- Create example Node.js application

**Deliverable:** A real SDK call appears in the database.

### Phase 3 — Analytics

- Implement aggregate queries
- Implement overview API
- Implement trace list API
- Implement trace detail API
- Implement model analytics API
- Add pagination and filtering

**Deliverable:** Complete analytics APIs.

### Phase 4 — Dashboard

- Implement application layout
- Implement overview KPI cards
- Implement charts
- Implement traces table
- Implement trace details
- Implement model comparison
- Implement project management
- Implement authentication

**Deliverable:** End-to-end usable dashboard.

### Phase 5 — Demo and Polish

- Create demo dataset
- Create public read-only demo
- Add loading and error states
- Responsive design
- Accessibility improvements
- Write documentation
- Add tests
- Set up CI
- Deploy to Cloudflare

**Deliverable:** Public portfolio-ready application.

---

## 18. Out of Scope for MVP

Do not implement these unless the core MVP is complete:

- AI chatbot
- AI-powered root cause analysis
- Billing and subscriptions
- Stripe integration
- Team invitations
- Organization management
- Multiple user roles
- Distributed tracing visualization
- Real-time WebSocket dashboard updates
- Kafka
- Redis
- ClickHouse
- Complex alerting
- Prompt playground
- LLM evaluation pipeline
- Automatic provider instrumentation
- Full OpenTelemetry collector compatibility

These can be future roadmap items.

---

## 19. Acceptance Criteria

The MVP is complete when:

- [ ] Entire project runs locally.
- [ ] Dashboard is deployed publicly.
- [ ] No paid services are required.
- [ ] User can create a project.
- [ ] User can generate and revoke ingestion API keys.
- [ ] TypeScript SDK can track async operations.
- [ ] SDK captures duration, status and optional token usage.
- [ ] SDK errors do not break application logic.
- [ ] Telemetry is persisted in D1.
- [ ] Dashboard displays accurate aggregate metrics.
- [ ] Request volume and latency charts work.
- [ ] Traces can be filtered and paginated.
- [ ] Trace details are viewable.
- [ ] Model comparisons work.
- [ ] Unknown model pricing is handled correctly.
- [ ] Public demo works without login.
- [ ] Demo data is clearly identified as simulated.
- [ ] Project isolation and authentication are tested.
- [ ] TypeScript checks pass.
- [ ] Unit and integration tests pass.
- [ ] Production build succeeds.
- [ ] README explains installation and SDK integration.
- [ ] No secrets are committed.
- [ ] Cloudflare deployment is documented.

---

## 20. Instructions for Codex

You are acting as a senior full-stack engineer building TraceAI.

Implement the project according to this specification.

### Development Rules

1. Start by inspecting the repository. Preserve any existing working implementation.
2. Create a brief implementation plan and milestone checklist before coding.
3. Implement the project incrementally, following the specified phases.
4. Do not attempt to implement every feature in one massive change.
5. Use TypeScript strict mode.
6. Prefer maintainable, readable code over excessive abstraction.
7. Use production-quality naming and folder organization.
8. Implement real working functionality, not decorative placeholders.
9. Never hard-code production metrics or pretend simulated values are real.
10. Never fabricate API responses.
11. Do not require paid services.
12. Document all required environment variables.
13. Run relevant tests, type checks, and builds after each milestone.
14. Fix failures before advancing to the next milestone.
15. Do not claim deployment or test success unless verified.
16. Avoid unnecessary dependencies.
17. Ensure Cloudflare runtime compatibility.
18. Preserve privacy and security requirements.

### UI Expectations

Build a polished, modern developer dashboard.

Prioritize:

- Excellent data readability
- Consistent components
- Clean typography
- Responsive design
- Professional charts
- Useful loading and empty states
- Good UX for filters and navigation

The result should feel like a real developer SaaS product, not a tutorial project.

### Execution Priority

Build in this order:

1. Monorepo and database
2. Telemetry ingestion
3. TypeScript SDK
4. Metrics and analytics APIs
5. Dashboard
6. Authentication and project management
7. Public demo
8. Testing, documentation, deployment

If a feature is blocked, document the blocker and continue with independent tasks.

Do not silently skip core features.

### Final Deliverables

Provide:

- Complete source code
- Working SDK
- Working API
- Working dashboard
- Database migrations
- Demo seed data
- Test suite
- README
- Architecture documentation
- Deployment instructions
- Clear description of implemented features
- Any remaining limitations

**Begin with Phase 1 and proceed incrementally through the specification.**
