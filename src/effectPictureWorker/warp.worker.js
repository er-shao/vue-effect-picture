self.onmessage = function (event) {
    try {
        const data = event.data;
        if (data.type === 'warp') {
            // 顶点变形计算
            const { originalVertices, controlPoints, width, height } = data;
            const deformedVertices = [];

            for (let i = 0; i < originalVertices.length; i += 3) {
                const x0 = originalVertices[i];
                const y0 = originalVertices[i + 1];
                const z0 = originalVertices[i + 2];

                // 计算UV坐标
                const u = (x0 + width / 2) / width;
                const v = 1 - (y0 + height / 2) / height;

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

                // 存储变形后的顶点
                deformedVertices.push(x, y, z0);
            }

            // 返回结果
            self.postMessage({
                type: 'warpResult',
                result: deformedVertices
            });
        } else if (data.type === 'postprocess') {
            // 图像后处理（旋转和裁剪）
            const { pixels, width, height, rotate } = data;

            // 1. 创建临时画布
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d', {
                willReadFrequently: true
            });

            const imageData = new ImageData(
                new Uint8ClampedArray(pixels),
                width,
                height
            );
            ctx.putImageData(imageData, 0, 0);

            // 2. 旋转处理
            if (rotate) {
                const tempCanvas = new OffscreenCanvas(width, height);
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, 0);

                ctx.clearRect(0, 0, width, height);
                ctx.translate(width / 2, height / 2);
                ctx.rotate(rotate * Math.PI / 180);
                ctx.translate(-width / 2, -height / 2);
                ctx.drawImage(tempCanvas, 0, 0);
                ctx.resetTransform();
            }

            // 3. 自动裁剪
            const imgData = ctx.getImageData(0, 0, width, height);
            const dataArray = imgData.data;
            let minX = width, minY = height, maxX = 0, maxY = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const alphaIndex = (y * width + x) * 4 + 3;
                    if (dataArray[alphaIndex] > 0) {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }

            const padding = 0;
            const cropX = Math.max(0, minX - padding);
            const cropY = Math.max(0, minY - padding);
            const cropWidth = Math.min(width - cropX, maxX - minX + padding * 2);
            const cropHeight = Math.min(height - cropY, maxY - minY + padding * 2);

            // 4. 裁剪图像
            const croppedData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);

            // 5. 返回结果
            self.postMessage({
                type: 'postprocessResult',
                imageData: croppedData.data.buffer,
                width: cropWidth,
                height: cropHeight
            }, [croppedData.data.buffer]);
        }

    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message
        });
    }
};

// 贝塞尔函数
function bernstein(n, i, t) {
    const binom = (n, k) => {
        let coeff = 1;
        for (let x = n - k + 1; x <= n; x++) coeff *= x;
        for (let x = 1; x <= k; x++) coeff /= x;
        return coeff;
    };
    return binom(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

