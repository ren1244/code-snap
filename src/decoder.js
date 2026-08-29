import { default as MultiFormatReader } from '@zxing/library/core/MultiFormatReader';
import { default as BinaryBitmap } from '@zxing/library/core/BinaryBitmap';
import { default as HybridBinarizer } from '@zxing/library/core/common/HybridBinarizer';
import { default as BarcodeFormat } from '@zxing/library/core/BarcodeFormat';
import { default as LuminanceSource } from '@zxing/library/core/LuminanceSource';
import { default as ResultMetadataType } from '@zxing/library/core/ResultMetadataType';

class CanvasLuminanceSource extends LuminanceSource {
    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        super(canvas.width, canvas.height);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.luminances = null;
        this.luminancesInv = null;
        this.x = 0;
        this.y = 0;
    }

    update(x, y, w, h) {
        const { data } = this.ctx.getImageData(x, y, w, h);
        const len = w * h;
        for (let i = 0; i < len; ++i) {
            const a = data[((i << 2) + 3)];
            const r = (data[(i << 2)] * a + 255 * (255 - a)) / 255;
            const g = (data[(i << 2) + 1] * a + 255 * (255 - a)) / 255;
            const b = (data[(i << 2) + 2] * a + 255 * (255 - a)) / 255;
            data[i] = (306 * r + 601 * g + 117 * b + 0x200) >> 10;
        }
        for (let i = 0; i < len; ++i) {
            data[len + i] = data[i] ^ 0xff;
        }
        this.luminances = data.subarray(0, len);
        this.luminancesInv = data.subarray(len, len << 1);
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
    }

    getRow(y, row) {
        const offset = y * this.width;
        if (y < 0 || y >= this.height) {
            throw 'Requested row is outside the image: ' + y;
        }
        return this.luminances.subarray(offset, offset + this.width);
    }

    getMatrix() {
        return this.luminances;
    }

    isCropSupported() {
        return false;
    }

    isRotateSupported() {
        return false;
    }
}

class CanvasMultiFormatDecoder {
    constructor(canvas) {
        this.luminanceSource = new CanvasLuminanceSource(canvas);
        this.reader = new MultiFormatReader();
    }

    decode(x, y, w, h) {
        this.luminanceSource.update(x, y, w, h);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(this.luminanceSource));
        return this.reader.decodeWithState(binaryBitmap);
    }
}

export { CanvasMultiFormatDecoder, BarcodeFormat, ResultMetadataType };