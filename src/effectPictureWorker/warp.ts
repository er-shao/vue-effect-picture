import * as THREE from 'three';

import warpWorkerCode from './warp.worker.js?raw';


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
        try {
            const dataImage = await _imageToDataURL(image);
            options = options || {};
            const width = options.width || dataImage.width;
            const height = options.height || dataImage.height;
            const segments = options.segments || 200;
            const scaleX = options.scaleX || 1;
            const scaleY = options.scaleY || 1;
            const rotate = options.rotate || 0;

            // 1. 创建几何体
            const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
            const originalVertices = Array.from(geometry.attributes.position.array);
            
            // 2. 创建Worker计算变形顶点
            const worker = new Worker(
                URL.createObjectURL(new Blob([warpWorkerCode], { type: 'text/javascript' }))
            );
            
            
            worker.postMessage({
                type: 'warp',
                originalVertices,
                controlPoints,
                width,
                height
            });
            
            worker.onmessage = async (event) => {
                if (event.data.type === 'error') {
                    reject(event.data.error);
                    worker.terminate();
                    return;
                }
                
                if (event.data.type === 'warpResult') {
                    const deformedVertices = event.data.result;
                    
                    // 3. 更新几何体顶点
                    const vertices = geometry.attributes.position.array;
                    for (let i = 0; i < deformedVertices.length; i++) {
                        vertices[i] = deformedVertices[i];
                    }
                    geometry.attributes.position.needsUpdate = true;
                    
                    // 4. 继续Three.js渲染流程
                    const scene = new THREE.Scene();
                    const camera = new THREE.OrthographicCamera(
                        -width/scaleX, width/scaleX, 
                        height/scaleY, -height/scaleY, 
                        -1000, 1000
                    );
                    camera.position.z = 10;
                    camera.lookAt(new THREE.Vector3(0, 0, 0));

                    const renderer = new THREE.WebGLRenderer({
                        antialias: true,
                        alpha: true,
                        preserveDrawingBuffer: true // 保留渲染结果
                    });
                    renderer.setSize(width * 2, height * 2);

                    // 5. 加载纹理
                    const textureLoader = new THREE.TextureLoader();
                    textureLoader.load(dataImage.src, (texture) => {
                        texture.flipY = true;
                        texture.anisotropy = 16;
                        texture.magFilter = THREE.LinearFilter;
                        texture.minFilter = THREE.LinearMipmapLinearFilter;
                        texture.generateMipmaps = true;

                        const material = new THREE.MeshBasicMaterial({
                            map: texture,
                            side: THREE.DoubleSide,
                            transparent: true,
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.position.set(-width / 2, -height / 2, 0);
                        scene.add(mesh);

                        const renderTarget = new THREE.WebGLRenderTarget(width * 2, height * 2);
                        renderer.setRenderTarget(renderTarget);
                        renderer.render(scene, camera);

                        // 6. 获取像素数据
                        const pixels = new Uint8Array(width * 2 * height * 2 * 4);
                        renderer.readRenderTargetPixels(
                            renderTarget, 0, 0, width * 2, height * 2, pixels
                        );
                        
                        // 7. 发送像素数据到Worker进行后处理
                        worker.postMessage({
                            type: 'postprocess',
                            pixels,
                            width: width * 2,
                            height: height * 2,
                            rotate
                        }, [pixels.buffer]);
                    });
                }
                
                if (event.data.type === 'postprocessResult') {
                    // 10. 创建输出canvas
                    const outputCanvas = document.createElement('canvas');
                    outputCanvas.width = event.data.width;
                    outputCanvas.height = event.data.height;
                    const ctx = outputCanvas.getContext('2d') as CanvasRenderingContext2D;
                    
                    // 获取裁剪后的图像数据
                    const imageData = new ImageData(
                        new Uint8ClampedArray(event.data.imageData), 
                        event.data.width, 
                        event.data.height
                    );
                    ctx.putImageData(imageData, 0, 0);
                    
                    worker.terminate();
                    resolve(outputCanvas);
                }
            };
            
            worker.onerror = (error) => {
                reject(error);
                worker.terminate();
            };
            
        } catch (error) {
            reject(error);
        }
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

export default warp;