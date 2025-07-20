import warp from "./warp";
import { perspective } from "./perspective";

type EffectPictureComponentType = 'background' | 'foreground' | 'custom';

type EffectPictureComponent = {
    name: string;
    type: EffectPictureComponentType;
    src: string;
    index?: number;
    position?: {
        x: number;
        y: number;
    };
    opacity?: number;
    rotate?: number;
    scaleX?: number;
    scaleY?: number;

    transform?: {
        srcPoints?: number[] | null;
        dstPoints: number[];
    };
    warp?: number[][]
    filters?: {
        globalCompositeOperation?: GlobalCompositeOperation;
    };
}

type EffectPictureOptions = {
    el?: string | HTMLImageElement | HTMLCanvasElement | undefined | null;
    name: string;
    width: number;
    height: number;
    readonly components: EffectPictureComponent[];
}

class EffectPicture {
    private el: string | HTMLImageElement | HTMLCanvasElement | undefined | null;
    private name: string;
    private width: number;
    private height: number;
    private components: EffectPictureComponent[];

    private _componentImages: { [name: string]: HTMLImageElement }
    private _canvas: HTMLCanvasElement;
    private _randerComps: { [name: string]: HTMLCanvasElement };

    private __ready: Promise<void>;
    private __isCombine: boolean;

    constructor(options: EffectPictureOptions) {
        this.el = options.el;
        this.name = options.name;
        this.width = options.width;
        this.height = options.height;
        this.components = options.components;
        this._canvas = document.createElement('canvas');
        this._canvas.width = this.width;
        this._canvas.height = this.height;
        this._componentImages = {};
        this._randerComps = {};
        this.__ready = this._init();
        this.__isCombine = false;
    }
    private async _init() {
        if (typeof this.el === 'string') {
            const el = document.querySelector(this.el) as HTMLImageElement | HTMLCanvasElement;
            if (el) this.el = el;
        }
        if (!this.el) this.el = null;

        if (this.components.length < 1) {
            throw new Error('components is required');
        } else {
            for (const component of this.components) {
                const image = await this._loadImage(component);
                if (!image) throw new Error(`component ${component.name} image load failed`);
                this._componentImages[component.name] = image;
                // console.log(`component ${component.name} image loaded`);
            }
        }
    }

    private async _loadImage(component: EffectPictureComponent): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const src = component.src;
            img.src = src;
            img.onload = () => {
                resolve(img);
            }
            img.onerror = () => {
                console.error(`component ${component.name} image load failed`);
                reject(new Error(`component ${component.name} image load failed`));
            }
        });
    }

    /**
     * 图片各种变换效果顺序
     * 
     * **/

    private async _renderComponent(component: EffectPictureComponent, input_src?: HTMLImageElement | HTMLCanvasElement,): Promise<HTMLCanvasElement> {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = this.width;
        tmpCanvas.height = this.height;
        const ctx = tmpCanvas.getContext('2d');
        if (!ctx) throw new Error('canvas context is not available');

        ctx.clearRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // 可选: low/medium/high

        const position = component.position || { x: 0, y: 0 };
        const opacity = component.opacity || 1;
        const rotate = component.rotate || 0;
        const scaleX = component.scaleX || 1;
        const scaleY = component.scaleY || 1;
        const img = this._componentImages[component.name];

        if (component.type === 'background') {
            if (input_src) console.warn('background image should not be provided');
            ctx.save();
            ctx.drawImage(img, 0, 0, this.width, this.height)
            ctx.restore();
            return tmpCanvas;
        } else if (component.type === 'foreground') {
            if (input_src) console.warn('foreground image should not be provided');
            ctx.globalAlpha = opacity;
            ctx.save();
            const centerX = tmpCanvas.width / 2;
            const centerY = tmpCanvas.height / 2;
            ctx.translate(centerX, centerY);

            const radians = rotate * Math.PI / 180;
            ctx.rotate(radians);

            // 计算缩放后尺寸
            const scaledWidth = img.width * scaleX;
            const scaledHeight = img.height * scaleY;

            // 绘制（考虑缩放）
            ctx.drawImage(
                img,
                -scaledWidth / 2 + position.x,
                -scaledHeight / 2 + position.y,
                scaledWidth,
                scaledHeight
            );
            ctx.restore();
            return tmpCanvas;
        } else if (component.type === 'custom') {
            if (!input_src) {
                ctx.save();
                ctx.drawImage(img, 0, 0, this.width, this.height);
                ctx.restore();
                return tmpCanvas;
            }

            let inp_canvas = document.createElement('canvas');
            inp_canvas.width = input_src.width;
            inp_canvas.height = input_src.height;
            const inp_ctx = inp_canvas.getContext('2d');
            if (!inp_ctx) throw new Error('canvas context is not available');
            inp_ctx.clearRect(0, 0, input_src.width, input_src.height);
            inp_ctx.fillStyle = 'rgba(255, 255, 255, 0.01)'
            inp_ctx.fillRect(0, 0, input_src.width, input_src.height);
            inp_ctx.drawImage(input_src, 0, 0, input_src.width, input_src.height);

            ctx.globalAlpha = opacity;
            ctx.save();
            if (!component.warp && !component.transform) {
                component.warp = [
                    [0, 0], [inp_canvas.width / 3, 0], [inp_canvas.width / 3 * 2, 0], [inp_canvas.width, 0],
                    [0, inp_canvas.height / 3], [inp_canvas.width / 3, inp_canvas.height / 3], [inp_canvas.width / 3 * 2, inp_canvas.height / 3], [inp_canvas.width, inp_canvas.height / 3],
                    [0, inp_canvas.height / 3 * 2], [inp_canvas.width / 3, inp_canvas.height / 3 * 2], [inp_canvas.width / 3 * 2, inp_canvas.height / 3 * 2], [inp_canvas.width, inp_canvas.height / 3 * 2],
                    [0, inp_canvas.height], [inp_canvas.width / 3, inp_canvas.height], [inp_canvas.width / 3 * 2, inp_canvas.height], [inp_canvas.width, inp_canvas.height]
                ];
            }
            let startTimestamp = Date.now();
            if (component.warp) {
                inp_canvas = await warp(inp_canvas, component.warp, { scaleX, scaleY, rotate })
                console.log(`component ${component.name} render time: ${Date.now() - startTimestamp}ms`);
            } else if (component.transform) {
                const srcPoints = component.transform.srcPoints || undefined;
                const dstPoints = component.transform.dstPoints
                inp_canvas = await perspective(inp_canvas, dstPoints, srcPoints);
                position.x = 0;
                position.y = 0;
            }
            ctx.drawImage(
                inp_canvas,
                position.x,
                position.y,
            );
            // DEBUG 显示组件渲染时间
            console.log(`component ${component.name} render time: ${Date.now() - startTimestamp}ms`);

            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(img, 0, 0, this.width, this.height);
            ctx.globalCompositeOperation = 'multiply'
            if (component.filters) {
                ctx.globalCompositeOperation = component.filters.globalCompositeOperation || 'multiply';
            }
            const pattern = ctx.createPattern(img, 'repeat');
            if (!pattern) throw new Error('pattern is not available');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.restore();
            return tmpCanvas;
        } else {
            console.error('Unsupported component type', component.type);
            throw new Error('Unsupported component type');
        }
    }

    /**
     * 渲染指定组件
     * 
     * @param componentName 组件名称
     * @param image 组件图片，可选，如果不提供则使用组件原图渲染
     * @returns  this
     */
    async renderComponent(componentName: string, image?: HTMLImageElement | HTMLCanvasElement): Promise<this> {
        await this.__ready;
        const component = this.components.find(c => c.name === componentName);
        if (!component) throw new Error(`Component ${componentName} not found`);

        const renderedCanvas = await this._renderComponent(component, image);
        this._randerComps[componentName] = renderedCanvas;
        return this;
    }


    /**
     * 渲染所有组件
     * 
     * @param components 组件数组，数组元素为 [组件名称, 组件图片]
     * @returns  this
     */
    async renderAll(components: [string, HTMLImageElement | HTMLCanvasElement][]): Promise<this> {
        if (components.length < 1) {
            throw new Error('components is required');
        }
        for (const [componentName, image] of components) {
            await this.renderComponent(componentName, image);
        }

        return this;
    }


    // 合成图片
    async combine(): Promise<this> {
        await this.__ready;
        const bgComponent = this.components.filter(c => c.type === 'background').sort((a, b) => (b.index || 0) - (a.index || 0));;
        const fgComponent = this.components.filter(c => c.type === 'foreground').sort((a, b) => (b.index || 0) - (a.index || 0));;
        const customComponent = this.components.filter(c => c.type === 'custom').sort((a, b) => (b.index || 0) - (a.index || 0));;
        // 在 Canvas 渲染中，后渲染的内容会覆盖先渲染的内容
        // 所以先渲染背景，再渲染自定义内容，最后渲染前景

        const canvasCtx = this._canvas.getContext('2d');
        if (!canvasCtx) throw new Error('canvas context is not available');
        canvasCtx.clearRect(0, 0, this.width, this.height);
        // 背景
        for (const component of bgComponent) {
            const resultImageData = this._randerComps[component.name] || await this._renderComponent(component);
            canvasCtx.drawImage(resultImageData, 0, 0);
        }
        // 自定义内容
        for (const component of customComponent) {
            const resultImageData = this._randerComps[component.name] || await this._renderComponent(component);
            canvasCtx.drawImage(resultImageData, 0, 0);
        }
        // 前景
        for (const component of fgComponent) {
            const resultImageData = this._randerComps[component.name] || await this._renderComponent(component);
            canvasCtx.drawImage(resultImageData, 0, 0);
        }

        this.__isCombine = true;
        return this;
    }

    /**
     * 显示结果图片
     *      如果没有传入 el，则不显示图片
     * @returns  void
     */
    showResult(): void {
        if (!this.el) {
            console.warn('el is not a valid image or canvas element');
            return
        }
        if (!this.__isCombine) {
            console.warn('Please call combine() first');
            return;
        }
        const resultCanvas = this._canvas;
        if (this.el instanceof HTMLImageElement) {
            this.el.src = resultCanvas.toDataURL();
        } else if (this.el instanceof HTMLCanvasElement) {
            const ctx = this.el.getContext('2d');
            if (!ctx) throw new Error('Canvas context not available');
            // this.el.width = this.width;
            // this.el.height = this.height;
            ctx.clearRect(0, 0, this.el.width, this.el.height);
            ctx.drawImage(resultCanvas, 0, 0, this.el.width, this.el.height);
        } else {
            console.error('Unsupported element type', this.el);
        }
    }
    setElement(el: HTMLImageElement | HTMLCanvasElement): void {
        if (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement) {
            if (el instanceof HTMLCanvasElement && el === this._canvas) {
                // 判断是否为 this._canvas
                console.warn('The el element is the same as getResultCanvas(), which may lead to unexpected rendering results');
            }
            this.el = el;
        } else {
            console.error('el is not a valid image or canvas element');
        }
    }

    getResultCanvas(): HTMLCanvasElement {
        return this._canvas;
    }

    getResultDataURL(): string {
        if (!this.__isCombine) {
            console.warn('Please call combine() first');
            return '';
        }
        const data = this._canvas.toDataURL();
        return data;
    }

    getName(): string {
        return this.name;
    }

    // 清理缓存
    clearCache(): void {
        this.__isCombine = false;
        this._randerComps = {};
    }
}

export function createEffectPicture(options: EffectPictureOptions): EffectPicture {
    return new EffectPicture(options);
}
