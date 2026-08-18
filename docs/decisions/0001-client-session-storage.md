# ADR-0001: Keep Aster access tokens in memory

- Status: Accepted
- Date: 2026-08-18

## Context

The desktop client needs to restore an Aster session without exposing long-lived credentials to the WebView. The client must also remain compatible with password authentication today and Google OpenID Connect later.

## Decision

The React process keeps the Aster access token in memory and never writes it to web storage. Rust stores only the Aster refresh token in the operating system credential store through the `keyring` crate.

At startup, the client loads the refresh token, exchanges it through `/api/v1/auth/token/refresh`, stores the rotated refresh token, and then fetches `/api/v1/users/@me`. A `401` refresh response clears the local credential. A transient network failure preserves it so the user can retry.

The browser preview uses a memory-only vault. A future browser client should use an HttpOnly cookie rather than copying the desktop storage strategy.

External providers remain identity-verification mechanisms. The desktop client accepts only provider-neutral Aster session tokens. The reserved `aster://` deep-link scheme and PKCE S256 utility prepare the client for the Google exchange flow once its Protocol endpoints are defined.

## Consequences

- A WebView script cannot read a persisted refresh token directly.
- Access tokens disappear when the process exits.
- Refresh-token rotation is part of session restore and scheduled renewal.
- Google tokens never need to enter desktop storage.
- OS credential-store availability is now a desktop runtime dependency.
