import { createApp } from '../node_modules/vue/dist/vue.esm-browser.prod.js';
import { CanvasMultiFormatDecoder, BarcodeFormat, ResultMetadataType } from './decoder.js';
import { QrCode } from '@ren1244/qr-styling';

console.warn = () => { };

const code128 = (() => {
    const patterns = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "233111"];
    return function (hex) {
        function getVal(pos) {
            let c = hex.codePointAt(pos);
            if (48 <= c && c <= 57) {
                return c - 48;
            } else if (97 <= c && c <= 102) {
                return c - 97 + 10;
            } else if (65 <= c && c <= 70) {
                return c - 65 + 10;
            } else {
                throw 'bad hex string';
            }
        }
        let pattern = '';
        let index = null;
        for (let i = 1; i < hex.length && index !== 106; i += 2) {
            index = getVal(i - 1) << 4 | getVal(i);
            pattern += patterns[index];
        }
        return pattern + '2';
    }
})();

const code39 = (() => {
    const map = (() => {
        const origBlack = [17, 18, 3, 20, 5, 6, 24, 9, 10, 12];
        const origWhite = [2, 4, 8, 1];
        const origChars = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ-. *';
        const extChars = '$/+%';
        const extValues = [42, 138, 162, 168];
        const map = new Map();

        for (let idx = origChars.length - 1; idx >= 0; --idx) {
            const code = origChars.codePointAt(idx);
            const black = origBlack[idx % 10];
            const white = origWhite[(idx - idx % 10) / 10];
            let mask = 0;
            for (let i = 0; i < 4; ++i) {
                if (black >> i & 1) {
                    mask |= 1 << i * 2;
                }
                if (white >> i & 1) {
                    mask |= 1 << i * 2 + 1;
                }
            }
            if (black >> 4 & 1) {
                mask |= 1 << 8;
            }
            map.set(code, mask);
        }

        for (let idx = extChars.length - 1; idx >= 0; --idx) {
            const code = extChars.codePointAt(idx);
            const mask = extValues[idx];
            map.set(code, mask);
        }

        return map;
    })();

    return function (inputText) {
        // 檢查字串合法性
        for (let i = 0; i < inputText.length; ++i) {
            const code = inputText.codePointAt(i);

            // 必須是 map 中有的字元，且不能是起始/終止碼
            if (code === 42 || !map.has(code)) {
                throw 'Invalid character ' + String.fromCodePoint(code);
            }

            if (code > 0xffff) {
                ++i;
            }
        }

        // 加上起始/終止碼
        const str = `*${inputText}*`;
        let result = '';

        for (let i = 0; i < str.length; ++i) {
            const code = str.codePointAt(i);
            const mask = map.get(code);

            // 間隔
            if (result.length > 0) {
                result += '1';
            }

            // 圖樣
            for (let j = 0; j < 9; ++j) {
                result += (mask >>> j & 1) ? '2' : '1';
            }

            if (code > 0xffff) {
                ++i;
            }
        }

        return result;
    }
})();

if (!Uint8Array.prototype.toHex) {
    const hexStr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    Uint8Array.prototype.toHex = function () {
        let str = '';
        for (let x of this) {
            str += hexStr[x >>> 4 & 15] + hexStr[x & 15];
        }
        return str;
    }
}

function blobToImg(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(`無法讀取圖片，請改用其他方式`);
        }
        img.src = url;
    });
}

function imgToCanvas(img) {
    const cvs = document.createElement('canvas');
    cvs.width = img.width;
    cvs.height = img.height;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return cvs;
}

createApp({
    data() {
        return {
            reader: null,
            format: '',
            text: '',
            hex: '',

            stream: null,
            videoElement: null,
            canvasElement: null,
            ctx: null,
            cropX: 0,
            cropY: 0,
            cropW: 0,
            cropH: 0,

            animationId: null,
            timestamp: 0,
            delay: 125,
            pattern: '',

            errorMsg: '',
        };
    },
    computed: {
        pathD() {
            if (typeof (this.pattern) === 'string' && this.pattern.length > 0) {
                let x = 0;
                let d = [];
                for (let i = 0; i < this.pattern.length; ++i) {
                    const c = this.pattern.codePointAt(i);
                    if (c < 49 || c > 57) {
                        return null;
                    }
                    const w = c - 48;
                    if (~i & 1) {
                        d.push(`M ${x} 0 v 1 h ${w} v -1 Z`);
                    }
                    x += w;
                }
                return { x: 0, y: 0, width: x, height: 1, data: d.join(' ') };
            } else if (this.pattern instanceof QrCode) {
                const sty = this.pattern.styling('square');
                const d = sty.getD();
                const bbx = sty.getBBox();
                bbx.data = d;
                return bbx;
            }
            return null;
        },
        svg() {
            if (this.pathD !== null) {
                const { x, y, width: w, height: h, data: d } = this.pathD;
                const result = [];
                if (this.pattern instanceof QrCode) {
                    result.push(`<svg width="240px" height="240px" viewBox="${x - 4} ${y - 4} ${w + 8} ${h + 8}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">`);
                    result.push(`<path d="M ${x - 4} ${y - 4} h ${w + 8} v ${h + 8} h ${-w - 8} Z" fill="#fff" />`);
                    result.push(`<path d="${d}" fill="#000" />`);
                    result.push(`</svg>`);
                } else {
                    const w2 = parseFloat((2400 / w * 2 + 240).toFixed(5));
                    const h2 = parseFloat((1200 / w * 2 + 80).toFixed(5));
                    const a = parseFloat((240 / w).toFixed(5));
                    const b = parseFloat((80 / h).toFixed(5));
                    const e = parseFloat(((2400 - 240 * x) / w).toFixed(5));
                    const f = parseFloat((1200 / w - 80 * y / h).toFixed(5));
                    result.push(`<svg width="${w2}px" height="${h2}px" xmlns="http://www.w3.org/2000/svg">`);
                    result.push(`<path d="M 0 0 h ${w2} v ${h2} h -${w2} Z" fill="#fff" />`);
                    result.push(`<g transform="matrix(${a} 0 0 ${b} ${e} ${f})">`);
                    result.push(`<path d="${d}" fill="#000" />`);
                    result.push(`</g>`);
                    result.push(`</svg>`);
                }
                return result.join('\n');
            }
            return '';
        },
    },
    methods: {
        clearContent() {
            this.format = this.text = this.hex = this.errorMsg = '';
        },
        showDownload(result) {
            this.format = Number.isInteger(result.format) ? BarcodeFormat[result.format] : '';
            this.text = result.text || '';
            this.hex = result.rawBytes ? result.rawBytes.toHex() : '';

            switch (this.format) {
                case 'CODE_39':
                    this.pattern = code39(this.text);
                    break;
                case 'CODE_128':
                    this.pattern = code128(this.hex);
                    break;
                case 'QR_CODE':
                    const qrInfo = result.resultMetadata.get(ResultMetadataType.OTHER);
                    this.pattern = new QrCode(result.rawBytes, {
                        errorCorrection: qrInfo.ecLevel,
                        version: qrInfo.version,
                        mask: qrInfo.dataMask
                    });
                    break;
                default:
                    this.pattern = null;
            }
        },
        async scanImage() {
            this.clearContent();
            new Promise((resolve, reject) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (event) => {
                    const file = event.target.files[0];
                    if (!file) {
                        reject(new Error('未選擇任何檔案'));
                        return;
                    }
                    resolve(file);
                };
                input.click();
            }).then(blobToImg).then(imgToCanvas).then(cvs => {
                const decoder = new CanvasMultiFormatDecoder(cvs);
                this.showDownload(decoder.decode(0, 0, cvs.width, cvs.height));
            }).catch(e => {
                this.errorMsg = e.toString();
                this.showDownload({});
            });
        },
        async scanClipboard() {
            this.clearContent();
            if (!navigator.clipboard || !navigator.clipboard.read) {
                this.errorMsg = '不支援剪貼簿';
                console.log('不支援剪貼簿');
                return;
            }
            return navigator.clipboard.read().then(clipboardItems => {
                for (const item of clipboardItems) {
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        return item.getType(imageType);
                    }
                }
                return Promise.reject('剪貼簿找不到圖片');
            }).then(blobToImg).then(imgToCanvas).then(cvs => {
                const decoder = new CanvasMultiFormatDecoder(cvs);
                this.showDownload(decoder.decode(0, 0, cvs.width, cvs.height));
            }).catch(e => {
                this.errorMsg = e.toString();
                this.showDownload({});
            });
        },
        async scanByCamera() {
            this.clearContent();
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            await Promise.resolve();
            this.videoElement = document.querySelector('video');
            this.canvasElement = document.querySelector('canvas');
            this.videoElement.addEventListener('loadedmetadata', () => {
                const { videoWidth: w, videoHeight: h } = this.videoElement;

                // 設定 canvas
                this.canvasElement.width = w;
                this.canvasElement.height = h;
                this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });
                this.reader = new CanvasMultiFormatDecoder(this.canvasElement);

                // 設定裁切區域
                this.cropW = this.cropH = Math.min(w * 2 / 3, h * 0.8) >>> 0;
                this.cropX = w - this.cropW >>> 1;
                this.cropY = h - this.cropH >>> 1;
                this.ctx.strokeStyle = '#00FF00';
                this.ctx.strokeWidth = '4px';

                this.videoElement.play();
                this.animationId = requestAnimationFrame(() => {
                    this._scanFromVideo();
                });
            });
            this.videoElement.srcObject = this.stream;
        },
        async _scanFromVideo() {
            const t = Date.now();
            if (t - this.timestamp < this.delay) {
                this.animationId = requestAnimationFrame(() => {
                    this._scanFromVideo();
                });
                return;
            }
            this.timestamp = t;
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
            this.ctx.strokeRect(this.cropX - 2, this.cropY - 2, this.cropW + 4, this.cropH + 4);
            try {
                const result = await this.reader.decode(this.cropX, this.cropY, this.cropW, this.cropH);
                this.closeCamera();
                this.showDownload(result);
            } catch (e) {
                this.animationId = requestAnimationFrame(() => {
                    this._scanFromVideo();
                });
            }
        },
        closeCamera() {
            if (this.stream) {
                // 1. 取得串流中的所有軌道 (包含 video 和 audio)
                const tracks = this.stream.getTracks();

                // 2. 依序將每一個軌道停止運作（這會讓鏡頭燈熄滅、釋放硬體）
                tracks.forEach(track => {
                    track.stop();
                });

                // 3. 將變數清空，避免記憶體洩漏或重複關閉
                this.stream = null;
                this.videoElement = null;
                this.ctx = null;
                this.canvasElement = null;
            }
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        },
        async _downloadFile(filename, content, mime) {
            const blob = content instanceof Blob ? content : new Blob(content, { type: mime });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            await Promise.resolve();
            URL.revokeObjectURL(url);
        },
        downloadSvg() {
            this._downloadFile(
                this.text || 'barcode.svg',
                ['<?xml version="1.0" encoding="UTF-8"?>', this.svg],
                'image/svg+xml'
            );
        },
        downloadPng() {
            const { x, y, width: w, height: h, data: d } = this.pathD;
            const cvs = document.createElement('canvas');
            let scaleX;
            let scaleY;
            let distW;
            let distH;
            let offsetX;
            let offsetY;
            if (this.pattern instanceof QrCode) {
                const sz = this.pattern.size;
                const scale = Math.ceil(532 / sz);
                scaleX = sz * scale / w;
                scaleY = sz * scale / h;
                distW = Math.round(scale * (sz + 8));
                distH = Math.round(scale * (sz + 8));
                offsetX = Math.round(scale * 4) - x * scaleX;
                offsetY = Math.round(scale * 4) - y * scaleY;
            } else {
                scaleX = Math.ceil(532 / w);
                scaleY = Math.round(w * scaleX / 3) / h;
                distW = Math.round(scaleX * (w + 20));
                distH = Math.round(scaleY * h + scaleX * 10);
                offsetX = Math.round(scaleX * 10) - x * scaleX;
                offsetY = Math.round(scaleX * 5) - y * scaleY;
            }
            cvs.width = distW;
            cvs.height = distH;
            const ctx = cvs.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, distW, distW);
            const path = new Path2D(d);
            ctx.fillStyle = '#000';
            ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
            ctx.fill(path);
            cvs.toBlob((blob) => {
                this._downloadFile(this.text || 'barcode.png', blob, 'image/png');
            }, 'image/png');
        }
    },
    template: '#tpl'
}).mount('#app');
