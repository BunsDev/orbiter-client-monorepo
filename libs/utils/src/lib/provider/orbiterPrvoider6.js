"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _OrbiterProvider_url;
Object.defineProperty(exports, "__esModule", { value: true });
const ethers6_1 = require("ethers6");
class OrbiterProvider extends ethers6_1.JsonRpcProvider {
    constructor(url, network, options) {
        super(url, network, options);
        _OrbiterProvider_url.set(this, void 0);
        if (typeof url === 'string') {
            __classPrivateFieldSet(this, _OrbiterProvider_url, url, "f");
        }
    }
    getUrl() {
        return __classPrivateFieldGet(this, _OrbiterProvider_url, "f");
    }
    _wrapTransactionReceipt(value, network) {
        const result = super._wrapTransactionReceipt(value, network);
        const keys = Object.keys(result);
        const extra = {};
        for (const k in value) {
            if (!keys.includes(k) && k != 'logs') {
                extra[k] = value[k];
            }
        }
        result['extra'] = extra;
        return result;
    }
}
exports.default = OrbiterProvider;
_OrbiterProvider_url = new WeakMap();
