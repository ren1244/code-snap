import { BrowserMultiFormatReader, BarcodeFormat } from 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/+esm';
import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

/**
 * 本地開發可改用
 */
// import { BrowserMultiFormatReader, BarcodeFormat } from './third-party/zxing/browser.js';
// import { createApp } from './third-party/vue.esm-browser.js';


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


createApp({
    data() {
        return {
            reader: new BrowserMultiFormatReader(),
            format: '',
            text: '',
            hex: '',

            stream: null,
            videoElement: null,
            canvasElement: null,
            animationId: null,
            timestamp: 0,
            delay: 125,
            pattern: '',
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
            }
            return null;
        },
        svg() {
            if (this.pathD !== null) {
                const { x, y, width: w, height: h, data: d } = this.pathD;
                return `<svg width="240px" height="80px" viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="${d}" fill="#000" /></svg>`;
            }
            return '';
        }
    },
    methods: {
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
                default:
                    this.pattern = null;
            }
        },
        async scanImage() {
            this.format = this.text = this.hex = '';
            new Promise((resolve, reject) => {
                // 1. 動態建立一個隱藏的檔案輸入框
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*'; // 限制只能選擇圖片檔案

                // 2. 監聽使用者選擇檔案的事件
                input.onchange = (event) => {
                    const file = event.target.files[0];

                    if (!file) {
                        reject(new Error('未選擇任何檔案'));
                        return;
                    }

                    // 3. 使用 FileReader 讀取圖片檔案
                    const reader = new FileReader();

                    reader.onload = (e) => {
                        const base64Data = e.target.result; // 取得 Base64 字串

                        // 4. 建立 Image 物件並載入資料
                        const img = new Image();
                        img.onload = () => {
                            resolve(img); // 圖片載入完成，回傳 Image 物件
                        };
                        img.onerror = (error) => {
                            reject(new Error('圖片載入失敗', { cause: error }));
                        };
                        img.src = base64Data;
                    };

                    reader.onerror = (error) => {
                        reject(new Error('檔案讀取失敗', { cause: error }));
                    };

                    // 開始讀取檔案
                    reader.readAsDataURL(file);
                };

                // 5. 觸發點擊事件，彈出檔案選擇視窗
                input.click();
            }).then(img => {
                return this.reader.decodeFromImageElement(img);
            }).then(this.showDownload).catch(e => {
                console.error(e);
                this.showDownload({});
            });
        },
        async scanByCamera() {
            this.format = this.text = this.hex = '';
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            await Promise.resolve();
            this.videoElement = document.querySelector('video');
            this.canvasElement = document.querySelector('canvas');
            this.videoElement.addEventListener('loadedmetadata', () => {
                this.canvasElement.width = this.videoElement.videoWidth;
                this.canvasElement.height = this.videoElement.videoHeight;
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
            const ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
            try {
                const result = await this.reader.decodeFromCanvas(this.canvasElement);
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
            const distW = 540;
            const distH = 180;
            const { x, y, width: w, height: h, data: d } = this.pathD;
            const cvs = document.createElement('canvas');
            cvs.width = distW;
            cvs.height = distH;
            const ctx = cvs.getContext('2d');
            const path = new Path2D(d);
            ctx.fillStyle = '#000';
            const scaleX = distW / w;
            const scaleY = distH / h;
            ctx.setTransform(scaleX, 0, 0, scaleY, -x * scaleX, -y * scaleY);
            ctx.fill(path);
            cvs.toBlob((blob) => {
                this._downloadFile(this.text || 'barcode.png', blob, 'image/png');
            }, 'image/png');
        }
    },
    template: '#tpl'
}).mount('#app');
