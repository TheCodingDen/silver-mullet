# Silver Mullet

<img src="doc/logo.jpg" width="128px" height="auto">

*"Not all heroes wear capes; some of them wear terribly dated hockey haircuts."*

Silver Mullet represents our third attempt at making our own, in-house automod bot. This bot is meant to be a lean, easy-to-develop, simplest-thing-that-works solution for automatic moderation, which simply patches in some of the gaps that cannot be fulfilled by either Zeppelin, Beemo or Discord's integrated automod. It is *not* supposed to be a solution to all of our problems at all times; it simply aims to solve some very specific problems in very specific ways, and do well in serving those narrow use cases.

In other words: *This is not a silver bullet, it's a silver mullet.*

To achieve this goal, this bot is built with simple, ubiquitous, industry-standard, stable* technology (and development should strive to keep things that way). These technologies were not chosen on the basis of achieving the highest performing, most elegant, technically novel, developer-ergonomic or architecturally impressive solution. They were simply chosen by [principle of least astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment), with attention paid to the other factors listed above only *after* the technology had passed this first litmus test. The idea behind this is to ensure the system has a low barrier to entry for continued development, thereby extending its potential lifespan.

With that in mind, Silver Mullet is backed by the following technologies:

- TypeScript
- PostgreSQL over Prisma as the main backing database
- Redis over redis-om for message caching
- Docker Compose to glue the dev setup together
- discord.js with slash-create to interface with Discord

*\* = well, as stable as it can be, considering Discord and discord.js are involved...*

## Features and technical execution

> ⛔️ **Classified information ahead** ⛔️
>
> Silver Mullet represents the most sophisticated anti-spam system ever deployed to TCD, and is on the cutting edge of technology even by general moderation bot standards. Like any anti-spam system, its effectiveness in no small part hinges on its configuration parameters and details of its technical execution being kept away from public eye.
>
> Even with regard to the general confidentiality level of TCD staff operations, this bears stating separately: The following sections are highly classified information. **IT IS *STRICTLY FORBIDDEN* TO DISCLOSE ANY PARAMETERS, DETECTION ALGORITHMS, OR *ANY OTHER TECHNICAL DETAILS OF ANY SORT* ABOUT THIS SYSTEM OUTSIDE OF THE STAFF TEAM.**
>
> The easiest way to ensure you do not disclose too much is to simply refuse to answer any questions about this system to the public, other than stating that it's our in-house anti-spam system (and nothing more).

Silver Mullet's highlight features are largely inherited from its forebear, https://github.com/TheCodingDen/mini-slash, but it does have some ideas of its own as well, with the intent of adding more as time goes on. These will be detailed below.

### Cross-Channel Anti-Spam (CCAS)

Silver Mullet's flagship feature is Cross-Channel Anti-Spam (CCAS), which uses [Nilsimsa hashing](https://en.wikipedia.org/wiki/Nilsimsa_Hash) to first and foremost enable fuzzy comparison of messages based on broad-strokes similarity, not just absolute equality. This is in an effort to dodge typical antispam countermeasures sometimes deployed by Discord spam malware, like random string addendums.

However, its primary objective is to, by generating this hash for each message sent within the last ~5 minutes and looking through all hashes for a given user each time they send a message, enable the system to automatically detect and shut down spam being spread across multiple channels - something that is usually proliferated by humans, and something most general-purpose automod systems are generally speaking powerless to defeat.

To further empower the system's detection capabilities, the bot supports configuring keywords that, when present in a message, give it additional detection weight in order to trip CCAS detection sooner. This enables shutdown of misconduct that is difficult or outright impossible to accurately filter with simple contextless regex matching, such as phishing link spam, in as little as 2 messages.

### Rapid-deployment regex filters

Silver Mullet supports adding simple regex filters with slash commands, enabling speedy deployment of filters even from mobile clients, thus permitting rapid response to emerging spam incidents. In contrast to general-purpose systems like Zeppelin, the system is un-granular by design, featuring a dead-simple "match = ban" pattern in order to maximally shorten time to response from the staff team during an active situation.

In addition to the typical "send message and filter" style, we also listen for automod events from Discord, and put the blocked content through
the filter set. This was we get all the power and simplicity of regular filters, with the otherwise unachievable feature of blocking content before it reaches clients.


## Development

To get started, here's a crash course:

```bash
# Install correct Node version
nvm use

# Install dependencies
npm i

# Configure bot settings. Ask infra for a sensible default configuration, including auth to the preset dev bot that's present in the development guild
cp .env.example .env

# Bootstrap dev environment
# Before starting, if you want to have infra admin powers with the bot, edit init-local-dev-db.sql (don't commit changes)
npm run bootstrap

# Start and get coding
npm run dev

# Once booted, run /ccas-config init to setup the CCAS system
```

To run the unit tests, run `npm t -- npm run test:base`.
