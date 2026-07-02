import timeOut from "./delay.mjs";

async function Confirm_access(pprops){
    const {browser, page} = pprops;
    console.log(">>> ESPERANDO NAVEGACION-----");
    /*await page.waitForNavigation({
        timeout: 0,
        waitUntil: "load"
    });*/
    console.log(">>> ESPERANDO DELAY 1 SEG-----");
    await timeOut(1000);
    console.log(">>> DELAY 1 SEG PASO-----");
    console.log(">>> ENTER------");
    await page.keyboard.press('Enter');
    console.log(">>> ENTER SUPERADO------");
}

async function Select_ICM_mod(pprops){
    const {page} = pprops;
    console.log(">>> MODULO CARGADO------");

    //
    const icm_span_sel = "#spanIdMenuRenaultN42H764740176C0";
    const icm_span = await page.waitForSelector(icm_span_sel, {timeout: 0});
    await timeOut(2000);
    console.log(">>> CLICK EN ICM -------");
    await icm_span.click();
    console.log(">>> BOTON ICM CLICKEADO -------");
}

export default {
    Confirm_access,
    Select_ICM_mod,
}