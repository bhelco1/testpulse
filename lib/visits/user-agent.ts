// Spec section 14: every visit is stored with the class of its User-Agent, and only `browser`
// visits are ever counted. Pure: the header's value is passed in. The rules, and the published
// strings that prove them, are in user-agent.test.ts; the reasoning is the decision row of
// 2026-10-08.

export const USER_AGENT_CLASSES = ['browser', 'bot', 'preview'] as const;
export type UserAgentClass = (typeof USER_AGENT_CLASSES)[number];

/**
 * Longest agent read. Real agents are a few hundred characters; anything longer is untrusted
 * input of unbounded size and is classed `bot` without being searched.
 */
export const USER_AGENT_LIMIT = 1024;

// Link unfurlers: they fetch a page because someone pasted its address, not because anyone opened
// it. Checked first, since several also end in "bot" and the crawler rules would claim them.
const PREVIEW = [
  /slackbot-linkexpanding/,
  /facebookexternalhit/,
  /linkedinbot/,
  /twitterbot/,
  /discordbot/,
  /telegrambot/,
  /skypeuripreview/,
  /googlemessages/,
  // Only at the start: WhatsApp's in-app browser appends "WhatsApp/…" to a normal browser agent.
  /^whatsapp\//,
];

// Crawlers, mail and link scanners, headless browsers and HTTP tools that name themselves.
const BOT = [
  /bot[/;)]/,
  /\bbot\b/,
  /crawler/,
  /spider/,
  /headless/,
  /google-safety/,
  /googleother/,
  /google-read-aloud/,
  /google-site-verification/,
  /googleimageproxy/,
  /yahoomailproxy/,
  /slack-imgproxy/,
  /meta-external/,
  /meta-webindexer/,
  // A contact URL in the agent is the convention for automated clients; browsers never carry one.
  /\+https?:\/\//,
];

// Every current browser's agent starts this way (MDN, "User-Agent"); HTTP libraries, curl and
// most fetchers do not.
const BROWSER_PREFIX = /^mozilla\/5\.0 \(/;

export function classifyUserAgent(userAgent: string | null | undefined): UserAgentClass {
  const raw = userAgent ?? '';
  if (raw.length > USER_AGENT_LIMIT) return 'bot';
  const ua = raw.trim();
  if (ua === '') return 'bot';
  const lower = ua.toLowerCase();
  if (PREVIEW.some((rule) => rule.test(lower))) return 'preview';
  if (BOT.some((rule) => rule.test(lower))) return 'bot';
  return BROWSER_PREFIX.test(lower) ? 'browser' : 'bot';
}
