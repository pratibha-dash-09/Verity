# Security

Never commit provider keys, `.env`, `.verity-connection`, runtime secrets, tokens, private keys or Git credential-manager exports. Use `.env.example` to document variable names with empty values.

The local settings page is restricted to localhost. The hosted version excludes that page and stores its provider key as a server-only secret. Do not copy local encrypted credentials to another computer or a hosted environment.

If a credential is exposed, revoke it with the provider and replace the stored server secret. Removing it from a later commit does not remove it from Git history.

Please report a security concern privately to the repository owner without posting credentials or personal data in a public issue.
