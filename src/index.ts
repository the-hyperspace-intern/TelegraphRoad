import { promises as fs } from 'fs';
import bencode from 'bencode';
import url, { parse as urlParser } from 'url';
import { createSocket, Socket } from 'dgram';
import crypto from 'crypto';

namespace Utils {
    export function leftShift(num: number, shift: number) {
        return num * Math.pow(2, shift)
    }

    export function genId() {
        const id = crypto.randomBytes(20);
        Buffer.from('-GY001-').copy(id, 0);
        return id;
    }
}

namespace TorrentParser {
    export function getFilesSize(metadata: any) {
        let final_size = metadata.info.files.map((file: any) => file.length).reduce((a: number, b: number) => a + b);
        return final_size;
    }
}

namespace QueryGenerator {
    export function genSubcription(): Buffer {
        const subPayload = Buffer.alloc(16);
        // 0x417 0x27101980
        subPayload.writeUInt32BE(0x417, 0);
        subPayload.writeUInt32BE(0x27101980, 4);
        subPayload.writeUInt32BE(0, 8);
        const transactionId = crypto.randomBytes(4);
        transactionId.copy(subPayload, 12);
        return subPayload;
    }

    export function genAnnouce(connectionID: Buffer): Buffer {
        const announcePayload = Buffer.alloc(98);
        connectionID.copy(announcePayload, 0); // ConnectionID
        announcePayload.writeUInt32BE(1, 8); // Action
        crypto.randomBytes(4).copy(announcePayload, 12); // Random TransactionID
        // TODO : InfoHash
        Utils.genId().copy(announcePayload, 36); // Peer ID
        announcePayload.writeUInt8(0, 56); // Downloaded
        // TODO : Number of Bytes left
        return announcePayload
    }
}

namespace ResponseParser {
    export function subscription(response: Buffer) {
        return {
            action: response.readUInt32BE(0),
            transactionId: response.readUInt32BE(4),
            connectionId: response.slice(8),
        }
    }
}

class UDPHandler {
    socket: Socket;
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
    console.log(decoded["announce-list"].map(e => e.map(c => c.toString())))
    // console.log(JSON.stringify(decoded));
    // console.log(TorrentParser.getFilesSize(decoded));

    return;

    const announcer_url = urlParser(decoded.announce.toString());
    const udpHandler = new UDPHandler(announcer_url);

    const subPayload = QueryGenerator.genSubcription();
    const _subscription = await udpHandler.sendBuffer(subPayload).catch(_ => { throw "Timed Out" });


    const payloadTransaction = subPayload.slice(12, 16);
    const subHandshake = ResponseParser.subscription(_subscription);

    if (payloadTransaction.compare(subHandshake.connectionId) == 0) {    // Test if transaction handshake is successful
        throw "Missed Transaction";
    }

    console.log("Transaction Successful, TransactionID:", payloadTransaction);

    udpHandler.socket.close();
    return udpHandler;

}

async function entry() {
    await main().catch(e => {
        console.log("An Error has occured", e, "Trying Again ~ !")
        entry()
    });
}


/* {
   name: "ginkoe",
   language: "javascript"
   } */

entry();


