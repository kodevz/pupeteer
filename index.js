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


// const truncate = (str, len) =>
//   str.length > len ? str.slice(0, len) + '…' : str;

async function ssr(url, hookFn, options) {

    if (RENDER_CACHE.has(options.key)) {
        const cacheItem = RENDER_CACHE.get(options.key);
        return { html: cacheItem.html, ttRenderMs: 0, wtag: cacheItem.wtag };
    }

    const start = Date.now();
    const browser = await puppeteer.launch(
        { headless: true },
        {
            args: [
                "--proxy-server='direct://'",
                '--proxy-bypass-list=*',
                '--disable-setuid-sandbox',
                '--no-sandbox'
            ]
        }
    );
    // const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage();


    page.on('console', msg => {
        for (let i = 0; i < msg.args().length; ++i) {
            if (msg.args()[i] == 'JSHandle:wtag') {
                console.log('sdd');
                console.log(msg._args[1].JSHandle);

            }

            console.log(`${i}: ${msg.args()[i]}`);
        }
    });



    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', request => {
        const resourceType = request.resourceType();
        const url = request.url();
        const method = request.method();
        const otherResources = /^(manifest|other)$/i.test(resourceType);
        if (blockedRegExp.test(url) || otherResources) {
            console.log(`❌ ${method} ${url}`);
            request.abort();
        } else {
            request.continue();
        }
    });

    const stylesheetContents = {};

    page.on('response', async resp => {
        const responseUrl = resp.url();
        const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
        const isStylesheet = resp.request().resourceType() === 'stylesheet';
        if (sameOrigin && isStylesheet) {
            stylesheetContents[responseUrl] = await resp.text();
        }
    });


    await page.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });

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


    await page.addScriptTag({ url: 'https://code.jquery.com/jquery-3.2.1.min.js' });

    await page.addScriptTag({ url: 'https://weaver-testing.s3.ap-south-1.amazonaws.com/build.js' });
    let wtag = {};
    if (hooks[hookFn]) {
        await hooks[hookFn](page);
        wtag = await page.$$eval("body", el => el.map(x => x.getAttribute("data-wtag")));
        if (wtag.length) {
            wtag = JSON.parse(wtag[0]);
        }
    }




    const ttRenderMs = Date.now() - start;

    console.info(`Headless rendered page in: ${ttRenderMs}ms`);

    let html = '';

    if (options.screenShot === false) {
        html = await page.content();
    }

    if (options.screenShot === true) {
        const time = new Date().getTime();
        const screenShot = `${time}.png`;
        await page.setViewport({
            width: 1920,
            height: 1080
        });
        await page.screenshot({ path: `public/${screenShot}` });

        html = screenShot;
    }

    RENDER_CACHE.set(options.key, { html, wtag });
    await browser.close();
    return { html, ttRenderMs, wtag };
}

const hooks = {
    www_currys_co_uk: async (page) => {
        await page.evaluate(() => {
            const $ = window.$;
            const selector = $('#product-tabs');
            selector.empty();
            selector.css('border', '1px solid #fff');
            $('#product-size-and-package').remove();

            $('#flix-inpage').remove();
            const productCode = $('.prd-code').text().replace('Product code: ', '');
            selector.append(`<weaver d="11687" p="40A5600FTUK"  l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>`);

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
            $('body').attr('data-wtag', JSON.stringify({ d: 'offSpring-01', p: productCode }));

            const image = $('.navbar-brand .img-responsive');
            const { origin, pathname } = window.location;
            image.attr('src', origin + image.attr('src'));
        });
    },
    www_hughes_co_uk: async (page) => {
        await page.evaluate(() => {
            const $ = window.$;
            // $('.product--detail-boxes').eq(0).after('<weaver d="11687" p="RZ245AP2" l="en" mpid="1234" mpn="1234" ean="1234" sku="1234" br="sony"  id="iframe-form" mp="1234" ></weaver>');
        });

        await page.click('.cookie-permission--accept-button');
    },
}


const testRetailerTemplates = {
    www_currys_co_uk: () => {
        return {
            d: '11687',
            p: '40A5600FTUK'
        }
    },
    www_offspring_co_uk: () => {
        return {
            d: 'offSpring-01',
            p: '2014415615'
        }
    }
    // www_hughes_co_uk: () => {
    //     return {
    //         d: '11687',
    //         p:  'RZ245AP2'
    //     }
    // }
}

app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname + '/index.html'));
});


app.get('/preview', async (req, res) => {
    console.log(req.query.url);
    console.log(req.query.screenshot);



    const queryParamScreenShot = req.query.screenshot === 'true' ? true : false;

    const url = new URL(req.query.url);

    const hookMethod = url.host.replace(/\./g, '_');

    let screenShot = true;

    if (testRetailerTemplates[hookMethod]) {
        screenShot = false;
    }

    if (queryParamScreenShot) {
        screenShot = true;
    }

    let wtagdetails = {
        d: '',
        p: ''
    };

    if (testRetailerTemplates[hookMethod]) {
        wtagdetails = testRetailerTemplates[hookMethod]();
    }

    const key = req.query.url + req.query.screenshot;
    console.log(key);
    const { html, ttRenderMs, wtag } = await ssr(req.query.url, hookMethod, { url, screenShot, key });

    if (wtag && Object.keys(wtag).length) {
        wtagdetails = wtag;
    }

    if (!screenShot) {
        res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc="Headless render time (ms)"`);
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': html.toString().length + '' });
        res.write(html);
        res.end();
    } else {
        res.render('content.html', { screenShot: html, wtagdetails: wtagdetails });
    }
});


// Making Express listen on port 7000
app.listen(7000, function () {
    console.log('Running on port 7000.');
});
