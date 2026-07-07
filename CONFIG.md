# Config

Below are the configs enforced by SM at time of closing
---
Cross-Channel Anti-Spam (CCAS) system settings
version
1

guildID
172018499005317120

minMessageLength
10

shortMessageLength
15

shortMessageSimilarityThreshold
85

similarityThreshold
128

cacheTTLSeconds
180

maxSizeDiffPercentage
30

pointsOnMatch
1

CCAS point overrides
nitro
2

CCAS action mappings
5
BAN
---
Filters

- `/https?:\/\/qptr\.ru\/\w+/` (g) => BAN
- `/https?:\/\/u\.to\/\w+/` (g) => BAN
- `/[\s\S]*\[(?:https\:\/\/)?steamcommunity\.com[\s\S]*\]\((?:https\:\/\/)?[\s\S]*\)[\s\S]*(?:@everyone|@here)/` (g) => BAN
- `/(?:@everyone|@here)[\s\S]*\[(?:https\:\/\/)?steamcommunity\.com[\s\S]*\]\((?:https\:\/\/)?[\s\S]*\)[\s\S]*/` (g) => BAN
- `/\[steamcommunity\.com\/.+\]\(https?:\/\/(?!steamcommunity\.com).+\)/` (g) => BAN
- `/[\s\S]*opensea[\s\S]*(@everyone|@here)[\s\S]*/` (g) => BAN
- `/[\s\S]*(@everyone|@here)[\s\S]*opensea/` (g) => BAN
- `/[\s\S]*18\+[\s\S]*discord\.gg\/.+/` (g) => QUEUE_BAN
- `/[\s\S]*discord\.gg\/.+[\s\S]*18\+/` (g) => QUEUE_BAN
- `/https?:\/\/t\.me\/.+/` (g) => BAN
- `/https?:\/\/lu\.ma\/.+/` (g) => BAN
- `/https:\/\/(www\.|old\.)?reddit\.com\/r\/tradingviewfree\//` (g) => QUEUE_BAN
- `/\d+\s*\$\s+gift[\s\S]*https?:\/\/.*/` (g) => BAN
- `/gift\s+\d+\s*\$[\s\S]*https?:\/\/.*/` (g) => BAN
- `/https?:\/\/in\.mt\/.+/` (g) => BAN
- `/https?:\/\/e\.vg\/.+/` (g) => BAN
- `/[\s\S]*(@everyone|@here)[\s\S]*(https?:\/\/)?(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)[\/\\].+/` (g) => BAN
- `/[\s\S]*(https?:\/\/)?(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)[\/\\].+[\s\S]*(@everyone|@here)[\s\S]*/` (g) => BAN
- `/https?:\/\/taap\.it\/.+/` (g) => BAN
- `/https?:\/\/is\.gd\/.+/` (g) => BAN
- `/https?:\/\/ln\.run\/.+/` (g) => BAN
- `/https?:\/\/.+\.hostingkartinok\.com\/.+/` (g) => BAN
- `/https?:\/\/leaksdaily/` (g) => BAN
- `/\/r\/TVFreeHub/` (g) => QUEUE_BAN
- `/https?:\/\/pplx\.ai\/.+/` (g) => BAN
- `/@everyone|@here/` (g) => BAN (30 day inactivity threshold)
- `/(https?:\/\/.+\.(jpg|jpeg|png)\s*){4}/` (g) => BAN (30 day inactivity threshold)
- `/(https?:\/\/(i\.)?imgur\.com\/[\s\S]+){4}/` (g) => BAN (30 day inactivity threshold)
- `/(https?:\/\/)?(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)[\\/].*/` (g) => BAN (30 day inactivity threshold)