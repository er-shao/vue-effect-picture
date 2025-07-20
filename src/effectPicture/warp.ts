import * as THREE from 'three';

/**
 * 
 * @param {string|HTMLImageElement|HTMLCanvasElement} image  图片地址或图片对象
 * @param {Array<Array<number>>} controlPoints 控制点坐标数组，从psd图层导出
 * @param {Object} options 
 * @param {number} [options.width] 输出图像宽度
 * @param {number} [options.height] 输出图像高度
 * @param {number} [options.segments] 网格细分度
 * @param {number} [options.scaleX] 缩放比例X
 * @param {number} [options.scaleY] 缩放比例Y
 * @returns {Promise<HTMLCanvasElement>}
 */
async function warp(
    image: string | HTMLImageElement | HTMLCanvasElement,
    controlPoints: Array<Array<number>>,
    options?: {
        width?: number,
        height?: number,
        segments?: number,
        scaleX?: number,
        scaleY?: number,
        rotate?: number,
    }): Promise<HTMLCanvasElement> {
    return new Promise(async (resolve, reject) => {
        _imageToDataURL(image).then(dataImage => {
            options = options || {};
            const width = options.width || dataImage.width;
            const height = options.height || dataImage.height;
            const segments = options.segments || 150; // 网格细分度
            const scaleX = options.scaleX || 1;
            const scaleY = options.scaleY || 1;
            const rotate = options.rotate || 0;

            // 初始化场景
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-width/scaleX, width/scaleX, height/scaleY, -height/scaleY, -1000, 1000);
            camera.position.z = 10;
            camera.lookAt(new THREE.Vector3(0, 0, 0));

            const renderer = new THREE.WebGLRenderer({
                antialias: true,
                // transparent: true,
                alpha: true

            });
            renderer.setSize(width * 2, height * 2);

            // 创建变形网格
            const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
            const vertices = geometry.attributes.position.array;

            for (let i = 0; i < vertices.length; i += 3) {
                // 计算UV坐标 (归一化)
                const u = (vertices[i] + width / 2) / width;
                const v = 1 - (vertices[i + 1] + height / 2) / height; // 翻转V轴匹配图像坐标

                // 贝塞尔曲面计算
                let x = 0, y = 0;
                for (let j = 0; j < 4; j++) {
                    for (let i_ = 0; i_ < 4; i_++) {
                        const B_u = bernstein(3, i_, u);
                        const B_v = bernstein(3, j, v);
                        const idx = i_ + j * 4;
                        x += B_u * B_v * controlPoints[idx][0];
                        y += B_u * B_v * controlPoints[idx][1];
                    }
                }

                // 更新顶点位置
                vertices[i] = x;
                vertices[i + 1] = y;
            }
            geometry.attributes.position.needsUpdate = true;

            // 加载原始图像纹理
            const textureLoader = new THREE.TextureLoader();
            const texture = textureLoader.load(dataImage.src, () => {
                // 创建材质和网格
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    transparent: true,
                });


                texture.anisotropy = 16; // 最高各向异性过滤（需显卡支持）
                texture.magFilter = THREE.LinearFilter; // 放大时线性过滤
                texture.minFilter = THREE.LinearMipmapLinearFilter; // 缩小时三线性过滤
                texture.generateMipmaps = true; // 启用mipmap, 加速纹理缩小

                // texture.flipY = false; // 关闭Y轴翻转匹配图像坐标系
                texture.flipY = true;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(
                    -width / 2,
                    -height / 2,
                    0
                )
                scene.add(mesh);

                const renderTarget = new THREE.WebGLRenderTarget(width * 2, height * 2);
            renderer.setRenderTarget(renderTarget);
            renderer.render(scene, camera);

            // 获取像素数据
            const pixels = new Uint8Array(width * 2 * height * 2 * 4);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, width * 2, height * 2, pixels);

            // 创建临时canvas检测透明区域
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width * 2;
            tempCanvas.height = height * 2;
            const tempCtx = tempCanvas.getContext('2d') as CanvasRenderingContext2D;
            const imageData = tempCtx.createImageData(width * 2, height * 2);
            imageData.data.set(pixels);
            tempCtx.putImageData(imageData, 0, 0);
            // document.body.appendChild(tempCanvas);

            // 旋转
            if (rotate) {
                tempCtx.save();
                const _tempCanvasData = document.createElement('canvas');
                _tempCanvasData.width = width * 2;
                _tempCanvasData.height = height * 2;
                const _tempCtxData = _tempCanvasData.getContext('2d') as CanvasRenderingContext2D;
                _tempCtxData.drawImage(tempCanvas, 0, 0);

                tempCtx.clearRect(0, 0, width * 2, height * 2);
                const centerX = width;
                const centerY = height;
                const radian = rotate * Math.PI / 180;
                tempCtx.translate(centerX, centerY);
                tempCtx.rotate(radian);
                tempCtx.translate(-centerX, -centerY);
                tempCtx.drawImage(_tempCanvasData, 0, 0);
                tempCtx.restore();                
            }

            // 自动检测非透明区域边界
            const tempData = tempCtx.getImageData(0, 0, width * 2, height * 2).data;
            let minX = width * 2, minY = height * 2, maxX = 0, maxY = 0;

            for (let y = 0; y < height * 2; y++) {
                for (let x = 0; x < width * 2; x++) {
                    const alphaIndex = (y * width * 2 + x) * 4 + 3;
                    if (tempData[alphaIndex] > 0) { // 检测非透明像素
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }

            const padding = 0;  // 裁剪边缘留白
            const cropX = Math.max(0, minX - padding);
            const cropY = Math.max(0, minY - padding);
            const cropWidth = Math.min(width * 2 - cropX, maxX - minX + padding * 2);
            const cropHeight = Math.min(height * 2 - cropY, maxY - minY + padding * 2);

            // 创建最终输出canvas
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = cropWidth;
            outputCanvas.height = cropHeight;
            const ctx = outputCanvas.getContext('2d') as CanvasRenderingContext2D;
          
            // 绘制裁剪后的图像
            ctx.drawImage(
                tempCanvas,
                cropX, cropY, cropWidth, cropHeight, // 源裁剪区域
                0, 0, cropWidth, cropHeight          // 目标尺寸
            );

            // 导出结果
            // const outputImg = new Image();
            // outputImg.onload = () => resolve(outputImg);
            // outputImg.src = outputCanvas.toDataURL('image/png');
            resolve(outputCanvas);
            });
        }).catch(reject);
    });
}



async function _imageToDataURL(image: string | HTMLImageElement | HTMLCanvasElement): Promise<HTMLImageElement> {
    // console.log('imageToDataURL', image);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    if (image instanceof Image && image.src) {
        return Promise.resolve(image);
    } else if (image instanceof HTMLCanvasElement) {
        img.src = image.toDataURL('image/png');
        return Promise.resolve(img);
    } else if (typeof image === 'string') {
        img.src = image;
        return new Promise((resolve, reject) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                img.src = dataURL;
                resolve(img);
            };
            img.onerror = reject;
        });
    } else {
        return Promise.reject('image is not valid');
    }
}

// 贝塞尔基函数
function bernstein(n: number, i: number, t: number) {
    const binom = (n: number, k: number) => {
        let coeff = 1;
        for (let x = n - k + 1; x <= n; x++) coeff *= x;
        for (let x = 1; x <= k; x++) coeff /= x;
        return coeff;
    };
    return binom(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

export default warp;