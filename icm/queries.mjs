import My_fetch from "./my_fetch.mjs";

export async function Get_vin(lastId) {
    const resp = await My_fetch({
        host: "intranet.caribemotor.com.co",
        path: '/v2_base/index_notema.php?sub_cat=api_icm',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer YzIyMzQ2OTBhNDA5ZmRiZTRiMDEyODYzZGFiM2QxNGJ0b2tlbmRlc2VndXJpZGFk`
        }
    }, {
        "cmd": "get_vin",
        "id": lastId
    });

    if (resp.transactionStatus !== 200) {
        return { error: true, data: {} };
    }
    console.log(resp.transactionMessage);

    return { error: false, data: resp.transactionMessage };
}

export async function Send_Data(id, vin, tipo, km, data) {
    const data_send = {
        "cmd": "set_vin_data",
        "id": id,
        "vin": vin,
        "tipo": tipo,
        "km": km,
        "data": data,
    };
    
    const resp = await My_fetch({
        host: "intranet.caribemotor.com.co",
        path: '/v2_base/index_notema.php?sub_cat=api_icm',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer YzIyMzQ2OTBhNDA5ZmRiZTRiMDEyODYzZGFiM2QxNGJ0b2tlbmRlc2VndXJpZGFk`
        }
    }, data_send);

    if (resp.transactionStatus !== 200) {
        return { error: true, data: {} };
    }

    return { error: false };
}

export async function Send_Unknow_vin(id, vin) {
    const data_send = {
        "cmd": "unknow_vin",
        "id": id,
        "vin": vin,
    };
    
    const resp = await My_fetch({
        host: "intranet.caribemotor.com.co",
        path: '/v2_base/index_notema.php?sub_cat=api_icm',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer YzIyMzQ2OTBhNDA5ZmRiZTRiMDEyODYzZGFiM2QxNGJ0b2tlbmRlc2VndXJpZGFk`
        }
    }, data_send);

    if (resp.transactionStatus !== 200) {
        return { error: true, data: {} };
    }

    return { error: false };
}


let __AUDITA = [];
export async function Send_auditory(id, vin, action){
    if(!action) return {error: true, name: "no_data_validate_1"};
    if(!action.trim() === "") return {error: true, name: "no_data_validate_2"};

    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const hour = today.getHours();
    const mins = today.getMinutes();
    const secs = today.getSeconds();
    const date_full = `${today.getFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day} ${hour < 10 ? `0${hour}` : hour}:${mins < 10 ? `0${mins}` : mins}:${secs < 10 ? `0${secs}` : secs}`;

    const new_action = {
        id,
        vin,
        action,
        date: Date.now(),
        date_full,
    };
    __AUDITA.push(new_action);
    

    return { error: false };
}

export async function SEND_AUDITA_DEF(){
    const data_send = {
        "cmd": "report_auditory",
        "actions": __AUDITA,
    };
    
    
    const resp = await My_fetch({
        host: "intranet.caribemotor.com.co",
        path: '/v2_base/index_notema.php?sub_cat=api_icm',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer YzIyMzQ2OTBhNDA5ZmRiZTRiMDEyODYzZGFiM2QxNGJ0b2tlbmRlc2VndXJpZGFk`
        }
    }, data_send);

    console.log(resp);

    if (resp.transactionStatus !== 200) {
        return { error: true, data: {} };
    }
    
    __AUDITA = [];
    return {error: false};
}