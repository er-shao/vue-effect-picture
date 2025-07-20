/**
 * 将多种图像源转换为HTMLImageElement
 * @param source 图像源 - 可以是URL字符串、HTMLImageElement或HTMLCanvasElement
 * @returns 返回一个Promise，解析为HTMLImageElement
 */
export function imageSourceToImage(source: string | HTMLImageElement | HTMLCanvasElement): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        if (typeof source === 'string') {
            // URL字符串
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = source;
        } else if (source instanceof HTMLImageElement) {
            // 已经是图像元素
            if (source.complete) {
                resolve(source);
            } else {
                source.onload = () => resolve(source);
                source.onerror = reject;
            }
        } else if (source instanceof HTMLCanvasElement) {
            // Canvas元素
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = source.toDataURL('image/png');
        } else {
            reject(new Error('不支持的图像源类型'));
        }
    });
}