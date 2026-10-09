import { describe, expect, it } from 'vitest';

import { classifyUserAgent, USER_AGENT_LIMIT } from './user-agent';

// Spec section 14 and Phase 6 criterion 4: bot and preview visits are stored as such and never
// counted. Every string below is copied from the source named above its group; none is made up.

describe('classifyUserAgent: browsers', () => {
  // MDN, "User-Agent" header reference, the Chrome, Edge, Opera and Safari examples:
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent
  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0 (Edition developer)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ])('reads %s as a browser', (ua) => {
    expect(classifyUserAgent(ua)).toBe('browser');
  });

  // MDN, Firefox user agent string reference (desktop, Android phone, iOS):
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent/Firefox
  it.each([
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0',
    'Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/41.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/600.1.4',
  ])('reads %s as a browser', (ua) => {
    expect(classifyUserAgent(ua)).toBe('browser');
  });

  // Apple's Applebot page gives these as the browser part of Applebot's agent, so without the
  // Applebot token they are ordinary Safari: https://support.apple.com/en-us/119829
  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ])('reads %s as a browser', (ua) => {
    expect(classifyUserAgent(ua)).toBe('browser');
  });
});

describe('classifyUserAgent: link previews', () => {
  // Slack, "Slack robots": https://api.slack.com/robots
  it('reads Slackbot-LinkExpanding as a preview', () => {
    expect(classifyUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(
      'preview',
    );
  });

  // Meta, "Meta Web Crawlers":
  // https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/
  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'facebookexternalhit/1.1',
  ])('reads %s as a preview', (ua) => {
    expect(classifyUserAgent(ua)).toBe('preview');
  });

  // LinkedIn's preview fetcher, as LinkedIn's robots.txt names it (https://www.linkedin.com/
  // robots.txt, "User-agent: LinkedInBot") and as published in full by
  // https://user-agents.net/bots/linkedinbot and https://crawlerzoo.com/bots/linkedinbot
  it('reads LinkedInBot as a preview', () => {
    expect(
      classifyUserAgent(
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
      ),
    ).toBe('preview');
  });

  // Bellingcat, "How To Blow Your Online Cover With URL Previews" (2019), which captured each
  // messenger's preview request:
  // https://www.bellingcat.com/resources/how-tos/2019/01/04/how-to-blow-your-online-cover-with-url-previews/
  // and, for iMessage's full string, https://github.com/hachyderm/community/issues/212
  it.each([
    'WhatsApp/0.3.1649 N',
    // https://github.com/romkey/comfier-ui/pull/67
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  ])('reads %s as a preview', (ua) => {
    expect(classifyUserAgent(ua)).toBe('preview');
  });

  // Discord: https://user-agents.net/bots/discord-bot and
  // https://github.com/discord/discord-api-docs/issues/1600; Telegram:
  // https://darkvisitors.com/agents/telegrambot; X (Twitter) cards: Twitterbot/1.0, as the
  // iMessage string above carries it and https://user-agents.net/bots/twitterbot lists it.
  it.each([
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'TelegramBot (like TwitterBot)',
    'Twitterbot/1.0',
  ])('reads %s as a preview', (ua) => {
    expect(classifyUserAgent(ua)).toBe('preview');
  });

  // Google, "Google's user-triggered fetchers": Google Messages makes link previews.
  // https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers
  it('reads GoogleMessages as a preview', () => {
    expect(classifyUserAgent('GoogleMessages')).toBe('preview');
  });
});

describe('classifyUserAgent: bots', () => {
  // Google, "Google's common crawlers":
  // https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
  // (W.X.Y.Z stands for the Chrome version there; a real one is substituted.)
  it.each([
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/141.0.7390.122 Safari/537.36',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GoogleOther) Chrome/141.0.7390.122 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // Google, "Google's special-case crawlers": Google-Safety is the abuse crawler that checks
  // links for malware; AdsBot checks ad landing pages.
  // https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers
  // and Google's user-triggered fetchers (Read Aloud, Site Verifier), linked above.
  it.each([
    'Google-Safety',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'APIs-Google (+https://developers.google.com/webmasters/APIs-Google.html)',
    'Mozilla/5.0 (compatible; Google-Site-Verification/1.0)',
    'Google-Read-Aloud',
  ])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // Mail services that fetch a message's links and images before, or instead of, a person:
  // Gmail's image proxy (https://github.com/matomo-org/device-detector/issues/5359,
  // https://scientiamobile.com/what-is-google-image-proxy/) and Yahoo Mail's link proxy, which
  // names Yahoo's own help page (https://radar.cloudflare.com/bots/directory/yahoomailproxy).
  // Microsoft Defender Safe Links, Proofpoint, Mimecast and Barracuda send ordinary browser
  // agents (https://github.com/mautic/mautic/issues/16263), so no agent string can tell them
  // apart; section 14's client-side beacon is what keeps them out.
  it.each([
    'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
    'YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html',
  ])('reads the mail scanner %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // Apple, "About Applebot": https://support.apple.com/en-us/119829
  it('reads Applebot as a bot', () => {
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
      ),
    ).toBe('bot');
  });

  // MDN's crawler example (link above) and Yandex's.
  it('reads YandexAccessibilityBot as a bot', () => {
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (compatible; YandexAccessibilityBot/3.0; +http://yandex.com/bots)',
      ),
    ).toBe('bot');
  });

  // Meta's crawlers that are not link previews (Meta's page above).
  it.each(['meta-externalagent/1.1', 'meta-webindexer/1.1'])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // Slack's other robots (Slack's page above) fetch images and do background work, not previews.
  it.each([
    'Slack-ImgProxy 0.19 (+https://api.slack.com/robots)',
    'Slackbot 1.0 (+https://api.slack.com/robots)',
  ])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // Headless Chrome, as Puppeteer and Playwright drive it:
  // https://dev.to/sonyarianto/user-agent-string-difference-in-puppeteer-headless-and-headful-4aoh
  // and https://github.com/streamlink/streamlink/issues/6110
  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  ])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  // HTTP tools and libraries: MDN's library examples (link above); python-requests' default
  // (requests.utils.default_user_agent, "python-requests/{version}"); Go's net/http default
  // ("Go-http-client/1.1", src/net/http/request.go); GNU Wget ("Wget/{version}", wget manual,
  // --user-agent).
  it.each([
    'curl/7.64.1',
    'PostmanRuntime/7.26.5',
    'python-requests/2.32.3',
    'Go-http-client/1.1',
    'Wget/1.21.4',
  ])('reads %s as a bot', (ua) => {
    expect(classifyUserAgent(ua)).toBe('bot');
  });

  it.each([undefined, null, '', '   ', '\t'])(
    'reads a missing or empty agent (%j) as a bot',
    (ua) => {
      expect(classifyUserAgent(ua)).toBe('bot');
    },
  );
});

describe('classifyUserAgent: matching rules', () => {
  it('ignores case', () => {
    expect(classifyUserAgent('SLACKBOT-LINKEXPANDING 1.0 (+HTTPS://API.SLACK.COM/ROBOTS)')).toBe(
      'preview',
    );
    expect(classifyUserAgent('linkedinbot/1.0 (compatible; mozilla/5.0)')).toBe('preview');
    expect(classifyUserAgent('GOOGLE-SAFETY')).toBe('bot');
    expect(
      classifyUserAgent(
        'mozilla/5.0 (windows nt 10.0; win64; x64) applewebkit/537.36 (khtml, like gecko) headlesschrome/127.0.0.0 safari/537.36',
      ),
    ).toBe('bot');
    expect(
      classifyUserAgent(
        'MOZILLA/5.0 (MACINTOSH; INTEL MAC OS X 10_15_7) APPLEWEBKIT/605.1.15 (KHTML, LIKE GECKO) VERSION/26.0 SAFARI/605.1.15',
      ),
    ).toBe('browser');
  });

  it('reads a preview token before the generic crawler rules', () => {
    // "Twitterbot" and "Discordbot" end in "bot", which the generic crawler rule would match.
    expect(classifyUserAgent('Twitterbot/1.0')).toBe('preview');
    expect(
      classifyUserAgent('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'),
    ).toBe('preview');
  });

  it('reads an in-app browser that merely mentions an app as a browser', () => {
    // WhatsApp's preview fetcher starts with "WhatsApp/"; its in-app browser adds "WhatsApp/…"
    // after a normal browser string (https://github.com/romkey/comfier-ui/pull/67). That PR
    // describes the form without quoting a whole string, so this one is built to it: MDN's
    // Chrome Android example with the suffix appended. It is the one constructed agent here.
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0',
      ),
    ).toBe('browser');
  });

  it('reads an agent longer than the limit as a bot without reading it', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
    // Real agents are a few hundred characters; an unbounded untrusted string is not counted.
    expect(classifyUserAgent(chrome.padEnd(USER_AGENT_LIMIT, ' '))).toBe('browser');
    expect(classifyUserAgent(chrome.padEnd(USER_AGENT_LIMIT + 1, ' '))).toBe('bot');
  });

  it('reads an agent that does not start like a browser as a bot', () => {
    // Every current browser sends "Mozilla/5.0 (" first (MDN, User-Agent, linked above).
    expect(
      classifyUserAgent(
        'Opera/9.80 (Macintosh; Intel Mac OS X; U; en) Presto/2.2.15 Version/10.00',
      ),
    ).toBe('bot');
  });
});
