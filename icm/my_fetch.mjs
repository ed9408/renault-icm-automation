import https from 'https';

export default async function My_fetch(props, data) {
    return new Promise((resolve, reject) => {
        props.port = props.port || '443';
        const options = props;
        //create the request object with the callback with the result
        const req = https.request(options, (res) => {
            // response from server
            if (res.statusCode == 200) {
                var chunka = [];
                res.on('data', function(chunk) {
                    chunka.push(chunk);
                });
                res.on('end', function() {
                    try {
                        chunka = JSON.parse(Buffer.concat(chunka).toString());
                    }
                    catch (e) {
                        reject(e);
                    }
                    resolve(chunka);
                });
            }
            else {
                reject('Error');
            }
        });

        // handle the possible errors
        req.on('error', (e) => {
            reject(e.message);
        });

        //do the request
        req.write(JSON.stringify(data));

        //finish the request
        req.end();
    });
}