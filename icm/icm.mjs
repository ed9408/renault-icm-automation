import timeOut from "./delay.mjs";
import { AU_Enter, Page2HTML, calculate_menus } from "./helppers.mjs";
import { Send_auditory } from "./queries.mjs";

async function Login(pprops) {
    const { page } = pprops;

    console.log(">>>> INGRESO A ICM --- LOGIN ----");
    await page.waitForNavigation({
        timeout: 0,
        waitUntil: "load",
    });
    console.log(">>>> LOGIN ICM CARGADO -----");

    const btn_access_sel = "#form20 > div.o-form-content.o-form-theme.clearfix > a";
    const btn_access = await page.waitForSelector(btn_access_sel, { waitUntil: "load", timeout: 0 });
    await timeOut(1000);
    console.log(">>>>> BOTON DE ACCESO:   ", btn_access);
    btn_access.click();

    await timeOut(2000);
    await AU_Enter();

    const validate_btn_sel = "body > form > table > tbody > tr:nth-child(4) > td > input[type=submit]";
    const validate_btn = await page.waitForSelector(validate_btn_sel, { timeout: 0, waitUntil: "load" });
    await timeOut(1000);
    console.log(">>>> BOTON DE VALIDACION:    ", validate_btn);
    validate_btn.click();
}

async function Identify_vin(pprops, goto_url, menu_items_names = [], audita_data = {}) {
    const { page } = pprops;

    await timeOut(4000);
    await page.goto(goto_url, { timeout: 0, waituntil: "load" });
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy ingresando al reporte`);
    await timeOut(1000);
    console.log(">>>>>> CARGANDO FRAMES...");
    await page.waitForSelector("html > frameset", {timeout: 0, waitUntil: "load"});
    console.log(">>>>>> MAIN FRAME CARGADO");
    console.log(">>>>>> CARGANDO FRAMES BODY Y MENU...");
    const frames = await page.frames();
    const frame_body = await frames.find(frame => frame.name() === "body");
    const frame_menu = await frames.find(frame => frame.name() === "FrameMenu");
    await timeOut(3000);
    const menu_items = await calculate_menus(frame_menu, menu_items_names);
    console.log(menu_items);
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese al reporte`);
    console.log(">>>>>> FRAMES BODY Y MENU CARGADOS");

    return { frames, frame_body, frame_menu, menu_items };
}

async function Get_vh_details(pprops, frame_body, audita_data = {}) {
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar a los detalles`);
    await frame_body.waitForSelector("#DivDet > table:nth-child(1) > tbody > tr > td.TitrePage", {timeout: 0, waitUntil: "visible"});
    await timeOut(3000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Voy a capturar el tipo de motor, de caja y la fecha de entrega`);
    await timeOut(3000);
    const values = await frame_body.evaluate(() => {
        const tipo_mot_str = "input[name=Vehicule_TYP_MOT]";
        const tipo_mot = document.querySelector(tipo_mot_str);
        const tipo_caja_str = "input[name=Vehicule_TYP_BOI]";
        const tipo_caja = document.querySelector(tipo_caja_str);
        const fecha_entrega_str = "#DivDet > table:nth-child(2) > tbody > tr:nth-child(2) > td:nth-child(8)";
        const fecha_entrega = document.querySelector(fecha_entrega_str);
        const values = {
            tipo_mot: (tipo_mot || {value: "-"}).value,
            tipo_caja: (tipo_caja || {value: "-"}).value,
            fecha_entrega: (fecha_entrega || {innerHTML: "-"}).innerHTML,
        };
        values.fecha_entrega = values.fecha_entrega.replace(/\./g, "-");
        return values;
    });
    await Send_auditory(audita_data.id, audita_data.vin, `Ya capture el tipo de motor (${values.tipo_mot}), de caja (${values.tipo_caja}) y la fecha de entrega  (${values.fecha_entrega})`);
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese a los detalles y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64"), values };
}

async function Get_vh_historic(frame_body, audita_data = {}){
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar al historico`);
    await frame_body.waitForSelector("body > table:nth-child(7) > tbody > tr > td.TitrePage", {timeout: 0, waitUntil: "visible"});
    await timeOut(3500);
    const more_btn = await frame_body.$("body > table:nth-child(9) > tbody > tr > td.Outils > a", {timeout: 0, waitUntil: "visible"});
    console.log(324324234234, more_btn);
    more_btn.click();
    await timeOut(1500);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese al historico y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64") };
}

async function Get_vh_mantain(frame_body, audita_data = {}){
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar al reporte de mantenimientos`);
    await frame_body.waitForSelector("body > table:nth-child(8) > tbody > tr > td.TitrePage", {timeout: 0, waitUntil: "visible"});
    await timeOut(3000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese a los mantenimientos y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64") };
}

async function Get_vh_contratos(frame_body, audita_data = {}){
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar a los contratos y servicios firmados`);
    await frame_body.waitForSelector("body > table:nth-child(11) > tbody > tr > td.TitrePage", {timeout: 0, waitUntil: "visible"});
    await timeOut(3000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese a los contratos y servicios firmados y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64") };
}

async function Get_vh_admin(frame_body, audita_data = {}){
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar al administrativo`);
    try{
        await frame_body.waitForSelector("body > table:nth-child(8) > tbody > tr > td.TitrePage", {timeout: 10000, waitUntil: "visible"});
    }catch(err){
        await frame_body.waitForSelector("#dvContainer > table:nth-child(3) > tbody > tr > td > table > tbody > tr > td.TitrePage", {timeout: 10000, waitUntil: "visible"});
    }
    await timeOut(5000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Voy a capturar el tipo de motor, de caja y la fecha de entrega`);
    await timeOut(3000);
    const values = await frame_body.evaluate(() => {
        const tipo_mot_str = "input[name=Vehicule_TYP_MOT]";
        const tipo_mot = document.querySelector(tipo_mot_str);
        const tipo_caja_str = "input[name=Vehicule_TYP_BOI]";
        const tipo_caja = document.querySelector(tipo_caja_str);
        const fecha_entrega_str = "#dvContainer > table:nth-child(4) > tbody > tr:nth-child(2) > td:nth-child(8)";
        const fecha_entrega = document.querySelector(fecha_entrega_str);
        const values = {
            tipo_mot: (tipo_mot || {value: "-"}).value,
            tipo_caja: (tipo_caja || {value: "-"}).value,
            fecha_entrega: (fecha_entrega || {innerHTML: "-"}).innerHTML,
        };
        values.fecha_entrega = values.fecha_entrega.replace(/\./g, "-");
        return values;
    });
    await Send_auditory(audita_data.id, audita_data.vin, `Ya capture el tipo de motor (${values.tipo_mot}), de caja (${values.tipo_caja}) y la fecha de entrega  (${values.fecha_entrega})`);
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese al administrativo y capture su contenido`);
    console.log(21312, values);
    return { html, b64: Buffer.from(html).toString("base64"), values };
}

async function Get_OTS(frame_body, audita_data = {}){
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar a los OTS`);
    await frame_body.waitForSelector("body > table:nth-child(1) > tbody > tr > td.TitrePage", {timeout: 0, waitUntil: "visible"});
    await timeOut(3000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese a los OTS y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64") };
}

async function Get_RecDeMantenimiento(frame_body, audita_data = {}) {
    await Send_auditory(audita_data.id, audita_data.vin, `Estoy esperando ingresar a Recomendacion de Mantenimiento`);
    await frame_body.waitForSelector("body > table:nth-child(11) > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(1)", {timeout: 0, waitUntil: "visible"});
    await timeOut(3000);
    const html = await frame_body.content();
    await Send_auditory(audita_data.id, audita_data.vin, `Ya ingrese a Recomendacion de Mantenimiento y capture su contenido`);
    return { html, b64: Buffer.from(html).toString("base64") };
}

export default {
    Login,
    Identify_vin,
    Get_vh_details,
    Get_vh_historic,
    Get_vh_mantain,
    Get_vh_contratos,
    Get_vh_admin,
    Get_OTS,
    Get_RecDeMantenimiento,
}