const express = require('express'); // Adding Express
const app = express(); // Initializing Express
const puppeteer = require('puppeteer'); // Adding Puppeteer
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');


const RENDER_CACHE = new Map();
const blocked = require('./blocked.json');
const blockedRegExp = new RegExp('(' + blocked.join('|') + ')', 'i');


// const truncate = (str, len) =>
//   str.length > len ? str.slice(0, len) + '…' : str;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);

app.set('view engine', 'ejs');
app.use(express.static("public"));

async function ssr(url, hookFn, options) {

    if (RENDER_CACHE.has(url)) {
        return { screenShot: RENDER_CACHE.get(url), ttRenderMs: 0 };
    }

    const start = Date.now();
    const browser = await puppeteer.launch(
        { headless: true },
        {
            args: [
                "--proxy-server='direct://'",
                '--proxy-bypass-list=*'
            ]
        }
    );
    const page = await browser.newPage();

    // await page.setDefaultNavigationTimeout(0);

    page.on('console', msg => {
        for (let i = 0; i < msg.args().length; ++i)
            console.log(`${i}: ${msg.args()[i]}`);
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', request => {
        const resourceType = request.resourceType();
        const url = request.url();
        const method = request.method();
        // const shortURL = truncate(url, 70);
        const otherResources = /^(manifest|other)$/i.test(resourceType);


        //   if (request.url().endsWith('.png') || request.url().endsWith('.jpg')) {
        //     request.abort();
        // } else 
        if (blockedRegExp.test(url) || otherResources) {
            console.log(`❌ ${method} ${url}`);
            request.abort();
        } else {
            request.continue();
        }
    });

    const stylesheetContents = {};

    // 1. Stash the responses of local stylesheets.
    page.on('response', async resp => {
        const responseUrl = resp.url();

        // if ("image" === resp.request().resourceType()) {
        //     console.log(responseUrl);
        // }
        const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
        const isStylesheet = resp.request().resourceType() === 'stylesheet';
        if (sameOrigin && isStylesheet) {
            stylesheetContents[responseUrl] = await resp.text();
        }
    });

    

    // 2.
    await page.goto(url, {
        waitUntil: 'networkidle0',
        // Remove the timeout
        timeout: 0
    });


    // 3. Inline the CSS (ie) Replace stylesheets in the page with their equivalent <style>.
    await page.$$eval('link[rel="stylesheet"]', (links, content) => {

        links.forEach(link => {
            console.log(link.href)
            const cssText = content[link.href];
            if (cssText) {
                const style = document.createElement('style');
                style.textContent = cssText;
                link.replaceWith(style);
            }
        });
    }, stylesheetContents);

    // if (hooks[hookFn]) {
    //     await hooks[hookFn](page);
    // }
    
    await page.addScriptTag({ url: 'https://code.jquery.com/jquery-3.2.1.min.js' });

    await page.evaluate(() => {
        const $ = window.$;
        $( "button:contains('Allow')", "button:contains('Accept')").click();
    });

    const time = new Date().getTime();
    const screenShot = `${time}.png`;
    await page.setViewport({
        width: 1920,
        height: 1080
    });
    await page.screenshot({ path: `public/${screenShot}` });

    const ttRenderMs = Date.now() - start;

    console.info(`Headless rendered page in: ${ttRenderMs}ms`);

    // const html = await page.content();

    RENDER_CACHE.set(url, screenShot);

    await browser.close();

    // const html = '<h1>Welcome</h1>';
    return { screenShot, ttRenderMs };
}

const hooks = {
    www_currys_co_uk: async (page) => {
        await page.evaluate(() => {
            const $ = window.$;
            const selector = $('#product-tabs');
            selector.empty();
            selector.css('border', '1px solid red');

            // const productCode =  $('.prd-code').text().replace('Product code: ', '');
            selector.append(`<weaver d="" p="40A5600FTUK"  l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>`);

            $('#onetrust-consent-sdk').remove();
        });
        // await page.click("#onetrust-pc-btn-handler");
    },
    www_offspring_co_uk: async (page) => {
        await page.evaluate(() => {
            const $ = window.$;
            $('#genericCurModal').find('[data-dismiss]').trigger('click');
            $('.modal-backdrop').remove();
            $('body').removeClass('modal-open');

            const productCode = $('.product__sku').eq(0)[0].childNodes[2].wholeText.trim();
            $('.product-container .container-flex .row-flex').eq(0).next().append(`<weaver d="offSpring-01" p="${productCode}"  l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>`);

            const image = $('.navbar-brand .img-responsive');
            const { origin, pathname } = window.location;
            image.attr('src', origin + image.attr('src'));
        });
    },
    www_hughes_co_uk: async (page) => {
        await page.evaluate(() => {
            const $ = window.$;
            $('.product--detail-boxes').eq(0).after('<weaver d="11687" p="RZ245AP2" l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>');
        });

        await page.click('.cookie-permission--accept-button');
    },
}
// // const url = 'https://www.currys.co.uk/gbuk/tv-and-home-entertainment/televisions/televisions/samsung-ue32t4300akxxu-32-smart-hd-ready-hdr-led-tv-10207649-pdt.html';
// // const url = 'https://www.offspring.co.uk/view/product/offspring_catalog/5,22/4283409080';
// const url = 'https://www.hughes.co.uk/product/small-appliances/small-kitchen-appliances/toasters/haden/191168?c=585';

app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname + '/index.html'));
});


app.get('/preview', async (req, res) => {
    const url = new URL(req.query.url);
    const hookMethod = url.host.replace(/\./g, '_');
    const ssrContent = await ssr(req.query.url, hookMethod, { url });
    const html = res.render('content.html', ssrContent);
});


// Making Express listen on port 7000
app.listen(7001, function () {
    console.log('Running on port 7001.');
});
