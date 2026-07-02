import timeOut from "./delay.mjs";
import puppeteer from "./puppeteer_core.mjs";
import Phase1 from "./auth_phase1.mjs";
import ICM from "./icm.mjs";
import {
    Get_vin,
    Send_Data,
    Send_auditory,
    SEND_AUDITA_DEF,
    Send_Unknow_vin,
} from "./queries.mjs";
import { Frame_goto, calculate_menus } from "./helppers.mjs";

let vhid = "";
let vin;
let __state = true;
let pprops;
let __pause = false;
let __pause_pm = false;


try {
    console.log("> INICIANDO PROGRAMA----");

    pprops = await puppeteer.Run({
        url: "https://dcs.renault.com/rne_hpa2/home.jsp",
        fullscreen: true
    }, {
        onVinUnkow: async () => {
            await Send_Unknow_vin(vhid, vin);
        },
        onPause: async () => {
            __pause = true;
            console.log(33333);
        },
        onPause_PM: async () => {
            __pause_pm = true;
            console.log(33333);
        },
    });

    console.log(">>> INICIANDO CONFIRMACION DE ACCESO------");

    await Phase1.Confirm_access(pprops);
    await Phase1.Select_ICM_mod(pprops);

    await ICM.Login(pprops);

    console.log(">>>> LOGGED A ICM");
    await timeOut(1500);

    console.log(">>>> CONSULTAMOS EL VIN DESDE CRM");
    ////////
    // AQUI DEBERIA DE IR UN CICLO PIDIENDO VINES
    /*
    let vin_resp;
    console.log("//////////////////////////////////////////////");
    console.log("LASTID: ", vhid);
    do {
        vin_resp = await Get_vin(vhid);
        if (vin_resp.error) {
            console.log("ERROR AL TRAER DATOS... VOLVERA A CARGAR EN 2 MINUTOS");
            await timeOut(1000 * 20);
        }
    } while (vin_resp.error);
     */
    __state = true;
    // PERO POR AHORA VAMOS A PEDIR UNO
    //93YRBB008SJ898423
    vin = "93YLMB506BJ494829";
    vhid = "";
    console.log(">>>> ESTE ES EL VIN A CONSULTAR: ", vin, vhid);

    // CHECK IF THE SITE LOAD CORRECTLY
    console.log(">>> VERIFICAMOS QUE EL SITIO CARGUE");

    let html = "";
    do {
        try {
            const page = pprops.page;
            await page.waitForSelector("html", { timeout: 0, waitUntil: "load" });
            console.log(">>> HTML");
            html = page.content();
            if (html.toString().includes("Connexion à ICM refusée")) {
                await timeOut(1000 * 60 * 5);
                await page.goto("https://dcs.renault.com/icm3/jsp/ServletLogin");
            }
        } catch (err2) {
        }
    } while (html.toString().includes("Connexion à ICM refusée"));


    await timeOut(1500);

    /////

    console.log(">>>>> SE INICIA LA COLOCACION DEL VIN");
    const menu_names = [
        "OTS a realizar",
        "Detalles vehículo",
        "Histórico",
        "Contratos y servicios",
        "Programa de mantenimiento",
        "administrativa",
    ];
    const frames = await ICM.Identify_vin(
        pprops,
        `https://dcs.renault.com/icm3/jsp/ServletLogin?VIN=${vin}&KM=1`,
        menu_names
    );
    if (__state) {
        let menu_items = frames.menu_items;
        //-------------------------------
        console.log(">>>>> PASAMOS DE SECCION A DETALLES DEL VH");
        await Frame_goto(frames.frame_menu, menu_items["Detalles vehículo"]);
        console.log(">>>>> OBTENEMOS EL HTML DEL DETALLE DEL VH");
        const vh_detail_data = await ICM.Get_vh_details(pprops, frames.frame_body, { id: vhid, vin });
        //-------------------------------
        console.log(">>>>> PASAMOS DE SECCION A HISTORICO DEL VH");
        //await Frame_goto(frames.frame_menu, "body > center > table > tbody > tr:nth-child(11) > td > a");
        await Frame_goto(frames.frame_menu, menu_items["Histórico"]);
        console.log(">>>>> CAPTURAMOS EL HTML DEL HISTORICO DEL VH");
        const vh_historic_data = await ICM.Get_vh_historic(frames.frame_body, { id: vhid, vin });
        if (__pause) {
            console.log("////////// PAUSE //////////");
            await timeOut(10000);
            menu_items = await calculate_menus(frames.frame_menu, menu_names);
            console.log("////////// RESUME //////////");
            __pause = false;
        }
        //-------------------------------
        console.log(">>>>> PASAMOS DE SECCION DE CONTRATOS DEL VH");
        //await Frame_goto(frames.frame_menu, "body > center > table > tbody > tr:nth-child(13) > td > a");
        await Frame_goto(frames.frame_menu, menu_items["Contratos y servicios"]);
        console.log(">>>>> CAPTURAMOS EL HTML DE CONTRATOS DEL VH");
        const vh_agreements_data = await ICM.Get_vh_contratos(frames.frame_body, { id: vhid, vin });
        //-------------------------------
        let vh_mantain_data;
        console.log(">>>>> PASAMOS A PROGRAMA DE MANTENIMIENTO DEL VH");
        if (typeof menu_items["Programa de mantenimiento"] !== "undefined") {
            await Frame_goto(frames.frame_menu, menu_items["Programa de mantenimiento"]);
            await timeOut(7000);
            console.log(4324324, __pause_pm);
            if (__pause_pm) {
                console.log("////////// PAUSE //////////");
                await timeOut(10000);
                menu_items = await calculate_menus(frames.frame_menu, menu_names);
                console.log("////////// RESUME //////////");
            } else {
                console.log(">>>>> CAPTURAMOS EL PROGRAMA DE MANTENIMIENTO DEL VH");
                vh_mantain_data = await ICM.Get_vh_mantain(frames.frame_body, { id: vhid, vin });
            }
        }
        //-------------------------------
        console.log(">>>>> PASAMOS A ADMINISTRATIVA DEL VH");
        //await Frame_goto(frames.frame_menu, "body > center > table > tbody > tr:nth-child(17) > td > a.LigneMenu");
        await Frame_goto(frames.frame_menu, menu_items.administrativa);
        console.log(">>>>> CAPTURAMOS ADMINISTRATIVA DEL VH");
        const vh_admin = await ICM.Get_vh_admin(frames.frame_body, { id: vhid, vin });
        //-------------------------------
        console.log(">>>>> VERIFICAMOS SI TIENE OTS POR REALIZAR");
        let vh_ots_data;
        if (typeof menu_items["OTS a realizar"] !== "undefined") {
            console.log(">>>>> EFECTIVAMENTE SI TIENE OTS POR REALIZAR");
            console.log(">>>>> PASAMOS DE SECCION A OTS POR REALIZAR");
            await Frame_goto(frames.frame_menu, menu_items["OTS a realizar"]);
            console.log(">>>>> OBTENEMOS EL HTML DE LOS OTS POR REALIZAR");
            vh_ots_data = await ICM.Get_OTS(frames.frame_body, { id: vhid, vin });
        } else {
            console.log(">>>>> NO TIENE OTS POR REALIZAR");
        }
        console.log(">>>> FINALIZAMOS LA CAPTURA DE HTMLs");

        //ENVIAMOS LOS DATOS
        /*
        const resp = await Send_Data(vhid, vin, {
            details: vh_detail_data.b64,
            historic: vh_historic_data.b64,
            agreements: vh_agreements_data.b64,
            maintains: (vh_mantain_data || { b64: "" }).b64,
            ots: (vh_ots_data || { b64: undefined }).b64,
            admin: vh_admin.b64,
            admin_data: vh_detail_data.values,
        });

        //ENVIANDO LA AUDITORIA FINAL
        console.log("ENVIANDO LA AUDITORIA FINAL");
        await SEND_AUDITA_DEF();
        console.log("AUDITORIA FINAL ENVIADO");
        //ENVIANDO LA AUDITORIA FINAL
        */

        __pause = false;
        __pause_pm = false;
    }
    console.log("/////////////////////////////////////////////////");
    console.log("////////////// PASANDO A OTRO VIN ///////////////");
    console.log("/////////////////////////////////////////////////");

    //VF1VY0CA2FC535615

} catch (err) {
    console.log(err);
    puppeteer.Kill(pprops);
}
