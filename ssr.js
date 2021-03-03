const puppeteer = require('puppeteer');

const RENDER_CACHE = new Map();

const ssr = async (url) => {
    if (RENDER_CACHE.has(url)) {
        return { html: RENDER_CACHE.get(url), ttRenderMs: 0 };
    }

    const start = Date.now();

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {

        await page.goto(url, { waitUntil: 'networkidle0' });

        // await page.addScriptTag({ url: 'https://code.jquery.com/jquery-3.2.1.min.js' });

        // await page.evaluate(() => {
        //     const $ = window.$; //otherwise the transpiler will rename it and won't work
            
        //     // document.querySelector('#onetrust-accept-btn-handler').click();
        //     function addScript(src) {
        //         var _script = document.createElement('script');
        //         _script.setAttribute('src', src);
        //         document.body.appendChild(_script);
        //     }
        //     addScript('https://weaver-testing.s3.ap-south-1.amazonaws.com/build.js');
        //     // const selector = document.querySelector('#product-tabs');
        //     // selector.style.border = '1px solid red';
        //     //  selector.innerHTML = `
        //     //     <weaver d="11687" p="RZ245AP2"  l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>
        //     // `;

        //     $('.product-container .container-flex .row-flex').eq(0).next().append('<weaver d="11687" p="RZ245AP2"  l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>');

        // });

    } catch (err) {

        throw new Error('page.goto/waitForSelector timed out.');
    }

    const html = await page.content(); // serialized HTML of page DOM.
    await browser.close();

    const ttRenderMs = Date.now() - start;
    console.info(`Headless rendered page in: ${ttRenderMs}ms`);

    RENDER_CACHE.set(url, html); // cache rendered page.

    return { html, ttRenderMs };
}

module.exports = {
    ssr
};