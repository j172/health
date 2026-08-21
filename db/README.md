# Database schema

There is no checked-in DDL file. The schema is created and migrated **in code**, by
`ensureSchema()` in [`lib/server/db/schema.ts`](../lib/server/db/schema.ts), which
`withConnection()` invokes before handing out any pooled connection.

`ensureSchema()` is idempotent — every statement is `CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, or `ADD INDEX IF NOT EXISTS` — so it is safe to run on
every boot, and a fresh database bootstraps itself on first request.

A previous `db/init.sql` was removed: it had drifted to 4 tables against the ~29 that
`ensureSchema()` actually creates, and it lacked the `ft_news_search` FULLTEXT index
(`WITH PARSER ngram`) that `searchNewsItems()` depends on. Running it against a new
database produced a subtly wrong schema, so keeping it was worse than not having it.

To inspect the live schema, connect and use `SHOW CREATE TABLE`; to change it, add the
statement to `ensureSchema()` rather than to a file here.
