import { promises as fs } from 'fs';
import bencode from 'bencode';
import url, { parse as urlParser } from 'url';
import dgram, { createSocket, Socket } from 'dgram';
import crypto from 'crypto';
import { resolve } from 'dns';
import { rejects } from 'assert';

function genSubcription(): Buffer {
    const subPayload = Buffer.alloc(16);
    // 0x417 0x27101980
    subPayload.writeUInt32BE(0x417, 0);
    subPayload.writeUInt32BE(0x27101980, 4);
    subPayload.writeUInt32BE(0, 8);
    const transactionId = crypto.randomBytes(4);
    transactionId.copy(subPayload, 12);
    return subPayload;
}

class UDPHandler {
    private socket: Socket;
    private url: url.UrlWithStringQuery;
    constructor(url: url.UrlWithStringQuery) {
        this.socket = createSocket('udp4');
        this.url = url;
    }

    // TODO : Implement X time repeat before Timeout
    async sendBuffer(payload: Buffer, delay = 1000): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            this.socket.send(payload, Number(this.url.port), this.url.hostname);

            const TIMEOUT = setTimeout(() => {
                this.socket.removeAllListeners("message");
                clearTimeout(TIMEOUT);
                reject("TIMEOUT");
            }, delay);

            this.socket.once('message', (msg) => {
                clearTimeout(TIMEOUT);
                resolve(msg);
            });
        });
    }
}

async function main() {
    const data = await fs.readFile('src/Torrents/bunny.torrent');
    const decoded = bencode.decode(data);
    const announcer_url = urlParser(decoded.announce.toString());
    const udpHandler = new UDPHandler(announcer_url);

    const subPayload = genSubcription();
    console.log(JSON.stringify(decoded));
    const _r = await udpHandler.sendBuffer(subPayload).catch(_ => { throw "Timed Out" });
    // Test if transaction payload is the same
    // const payloadTransaction = subPayload.slice(8, 16);
    // const response = {
    //     action: _r.slice(0, 4),
    //     transactionId: _r.slice(4, 8),
    //     connectionId: _r.slice(8, 16)
    // };
    // console.log(response);
    // console.log(payloadTransaction);
}

main().catch(e => console.log("An Error has occured", e));
