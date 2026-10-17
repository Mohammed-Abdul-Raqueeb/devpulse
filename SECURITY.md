# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability
reporting on this repository instead, and include:

- what an attacker can do,
- the steps to reproduce it,
- the version or commit you tested.

Expect an acknowledgement within a few days.

## How secrets are handled

| Secret | Storage | Why |
| --- | --- | --- |
| Passwords | bcrypt, cost 12 | Low-entropy and human-chosen, so a deliberately slow KDF is required |
| Write keys | SHA-256 | High-entropy random values; a fast hash is sufficient and ingestion must stay cheap |
| Refresh tokens | SHA-256, single-use | Rotated on every use, so a replayed token is detectable |
| Access tokens | Not stored | Stateless JWTs, short TTL |

A consequence worth knowing: a plaintext write key is shown exactly once, at creation. There is no
way to recover it, only to rotate it. That is the cost of a database dump being useless to an
attacker.

## Boundaries you should know about

- **Ingestion accepts any origin.** It is called from customer websites by design. What authorises
  it is the write key plus each project's origin allow-list — so set `allowedOrigins` on every
  project you care about.
- **Rate limiting is per process.** Running multiple replicas multiplies the effective limit. See
  [docs/deployment.md](docs/deployment.md).
- **Filter keys are allow-listed, not escaped.** `buildWhere` only ever interpolates column names it
  owns, and every value is a bound parameter. A filter key that is not on the list is ignored.
- **`properties` is stored in plaintext.** Do not put secrets, card numbers or anything you would
  not want in a CSV export into event properties.

## Supported versions

The latest minor release receives security fixes.
