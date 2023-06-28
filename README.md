# Silver Mullet

The third attempt at making our own automod bot

## Setup notes

Per default, the bot database starts out empty. This means nobody has permissions to operate on even the infra admin-only commands, and the CCAS config database will be empty (which needs to be populated for most purposes). Therefore, do remember to populate those tables with appropriate values before starting the bot the first time, or when starting it after a database reset.
