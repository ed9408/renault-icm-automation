export default async function timeOut(ms){
    return new Promise(function(resolve) { 
        setTimeout(() => {
            resolve();
        }, ms);
    });
}