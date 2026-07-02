import puppeteer from 'puppeteer';
import timeOut from './delay.mjs';
import { AU_Enter_password } from './helppers.mjs';
// Or import puppeteer from 'puppeteer-core';

async function Run(props, evs = {}) {
    const { url } = props;
    console.log(">> INICIANDO NAVEGADOR-----");
    // Launch the browser and open a new blank page
    const opts = {
        headless: false,
        timeout: 0,
        //browser: "\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"",
        args: [
            "--ignore-certificate-errors",
            "--disable-client-side-phishing-detection",
            "--enable-features=AllowCertificateUserSelection"
        ]
    };
    if (props.fullscreen) {
        opts.args.push("--start-fullscreen");
    }
    console.log(3333333);
    const browser = await puppeteer.launch(opts);
    //const page = await browser.newPage();
    const pages = await browser.pages();
    const page = pages[0];

    try {
        setTimeout(async () => {
            console.log(">>>>>>>> ESPERANDO EL ENTER");
            await timeOut(1500);
            console.log(">>>>>>>> VERIFICAMOS CONTRASENA");
            await AU_Enter_password();
        }, 5000);

        // Set screen size.
        await page.setViewport({ width: 1080, height: 1024 });

        await page.on("dialog", async (dialog) => {
            const message = dialog.message();
            if (message.includes("El VIN INTRODUCIDO ES DESCONOCIDO") || 
                message.includes("Mensaje 017: Atención, una intervención")) {
                if (typeof evs.onVinUnkow === "function") {
                    await evs.onVinUnkow();
                    await dialog.accept();
                    return;
                }
            }else if (message.includes("Mensaje F0023")){
                if(typeof evs.onPause === "function"){
                    await evs.onPause();
                    await timeOut(2000);
                    await dialog.dismiss();
                }
            }else if(message.includes("Verificar si se visualiza una fecha de entrega en ICM")){
                if(typeof evs.onPause_PM === "function"){
                    console.log(1111111);
                    await timeOut(2000);
                    await evs.onPause_PM();
                    console.log(2222222);
                    await dialog.accept();
                }
            }else if(message.includes("Session expired")){
                await Kill({page});
                await dialog.accept();
            }
        });
        await page.on('close', async () => {
            console.log('Page closed. Closing browser...');
            //await browser.close();
            //process.exit(0); // Ensure the Node.js process exits
        });


        await timeOut(1000);
        // Navigate the page to a URL.
        await page.goto(url);
    } catch (err) {
        Kill({page});
    }

    console.log(">> NAVEGADOR INICIADO----");
    return {
        browser,
        page
    }

}

async function Kill(props) {
    const { page } = props;
    if(await page.isClosed()) return;
    await page.close();
}

export default {
    Run,
    Kill,
}