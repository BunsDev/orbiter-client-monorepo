import os from 'os';
import crypto from "crypto";
// 获取操作系统信息
const osInfo = {
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
};

console.log('Operating System Information:', osInfo);

function encryptPrivateKey(privateKey: string, passphrase: string) {
    const algorithm = "aes-256-cbc";
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encryptedPrivateKey = cipher.update(privateKey, "utf8", "hex");
    encryptedPrivateKey += cipher.final("hex");

    return {
        encryptedPrivateKey,
        salt: salt.toString("hex"),
        iv: iv.toString("hex"),
    };
}

function decryptPrivateKey(
    encryptedPrivateKey: string,
    passphrase: string,
    salt: string,
    iv: string
) {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(passphrase, Buffer.from(salt, "hex"), 32);
    const decipher = crypto.createDecipheriv(
        algorithm,
        key,
        Buffer.from(iv, "hex")
    );
    let decryptedPrivateKey = decipher.update(encryptedPrivateKey, "hex", "utf8");
    decryptedPrivateKey += decipher.final("utf8");
    return decryptedPrivateKey;
}

const privateKey = "the is privateKey";

const passphrase = "my_secret_passphrase";

const encryptedData = encryptPrivateKey(privateKey, passphrase);
console.log("Encrypted Data:", encryptedData);

const decryptedData = decryptPrivateKey(
    encryptedData.encryptedPrivateKey, // 注入
    passphrase, // 服务器信息
    encryptedData.salt, // 随机信息，存储服务器本地
    encryptedData.iv // 输入
);
console.log("Decrypted Private Key:", decryptedData);