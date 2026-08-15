const pagesUrl = process.env.PAGES_URL;
if (!pagesUrl) throw new Error('PAGES_URL is required');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const rootUrl = new URL(pagesUrl);
let lastFailure = 'deployment did not respond';

for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const requestUrl = new URL(rootUrl);
    requestUrl.searchParams.set('deployment_check', String(Date.now()));
    const response = await fetch(requestUrl, { redirect: 'follow', cache: 'no-store' });
    const html = await response.text();
    if (!response.ok) throw new Error(`root returned HTTP ${response.status}`);
    if (!html.includes('<title>Open Water</title>')) {
      throw new Error('root did not return the ocean document');
    }

    const scriptMatch = html.match(/<script[^>]+src="([^"]+)"/i);
    if (!scriptMatch) throw new Error('production bundle reference is missing');
    const scriptResponse = await fetch(new URL(scriptMatch[1], response.url), {
      method: 'HEAD',
      cache: 'no-store',
    });
    if (!scriptResponse.ok) {
      throw new Error(`production bundle returned HTTP ${scriptResponse.status}`);
    }

    console.log(`Beautiful Water is live at ${rootUrl.href}`);
    process.exit(0);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
    console.log(`Attempt ${attempt}/30: ${lastFailure}`);
    if (attempt < 30) await delay(10_000);
  }
}

throw new Error(`GitHub Pages smoke test failed: ${lastFailure}`);
