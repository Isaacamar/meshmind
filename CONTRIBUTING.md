# Contributing to MeshMind

Thanks for contributing. This document covers branching, PR process, commit style, and code standards.

---

## Branching

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable. Direct pushes blocked. |
| `dev` | Integration branch. All features merge here first. |
| `feature/<name>` | New feature work |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation only |

Create branches off `dev`, not `main`.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/peer-routing
```

---

## Commit Style

Use conventional commits:

```
feat: add WebSocket relay endpoint
fix: correct JWT expiry calculation
docs: update architecture diagram
refactor: extract NodeRegistry service
test: add group membership integration tests
```

Keep the subject line under 72 characters. Add a body if the why isn't obvious.

---

## Pull Requests

1. Branch off `dev`
2. Keep PRs focused — one feature or fix per PR
3. Fill out the PR template
4. At least **one peer review** required before merge
5. All CI checks must pass
6. Squash merge into `dev`; rebase merge from `dev` into `main` for releases

---

## Code Standards

### Java (Spring Boot)
- Java 21, Spring Boot 3.x
- Constructor injection (no `@Autowired` on fields)
- Service layer owns business logic; controllers are thin
- All endpoints return consistent `ApiResponse<T>` wrapper
- Integration tests for all endpoints (use Testcontainers for PostgreSQL)
- Minimum 50% unit test coverage at final milestone

### TypeScript (React)
- Functional components only, hooks for state
- Props typed with interfaces, no `any`
- API calls centralized in `src/api/`
- Component files co-located with their styles and tests

### Python (OpenClaw / local backend)
- Type hints on all function signatures
- No logic in route handlers — delegate to service modules
- `black` formatting

---

## Issues

Use the provided issue templates:
- **Bug report** — for broken behavior
- **Feature request** — for new functionality
- **Agent mode proposal** — for agent/terminal integration ideas

Assign yourself before starting work. Link the issue in your PR.

---

## Security

The core privacy contract of MeshMind is:
> **The relay server must never be able to read message content.**

Any PR that changes how messages are encrypted, routed, or stored must include a section in the PR description explaining how this contract is preserved. Flag with the `security` label.

---

## Questions

Open a GitHub Discussion or reach out to the team directly.
