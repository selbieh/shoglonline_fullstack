"""Database router.

The only non-default connection is the read-only ``legacy`` alias (the legacy WordPress MySQL),
which the ``import_from_legacy`` management command reads via raw cursors. No Django model lives
there, so the router simply:

* leaves all normal read/write/relation routing on ``default`` (returns ``None``), and
* forbids running migrations against ``legacy`` (so ``migrate`` / the test runner never try to
  create our schema inside the legacy database).
"""


class LegacyRouter:
    def db_for_read(self, model, **hints):
        return None

    def db_for_write(self, model, **hints):
        return None

    def allow_relation(self, obj1, obj2, **hints):
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db == "legacy":
            return False
        return None
