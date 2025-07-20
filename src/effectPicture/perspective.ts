import glfx from "glfx";

/**
 * 透视变换
 * @param image 图片或画布， canvas对象不会被修改
 * @param points 变换后的四个点
 * @param srcPoints 变换前的四个点
 * @returns 返回新的canvas对象
 */
export async function perspective(
  image: HTMLImageElement|HTMLCanvasElement,
  points: number[],
  srcPoints?: number[]
): Promise<HTMLCanvasElement> {
  if (image instanceof HTMLImageElement &&  image.crossOrigin === "") {
    image.crossOrigin = "anonymous"
  }

  if (image instanceof HTMLImageElement && !image.complete) {
    return new Promise((resolve, reject) => {
      image.onload = () => {
        resolve(perspective(image, points, srcPoints));
      };
      image.onerror = reject;
    });
  }
  
  srcPoints = srcPoints || [0, 0, image.width, 0, image.width, image.height, 0, image.height];
  if (points.length !== 8 || srcPoints.length!== 8) {
    throw new Error("points参数长度必须为8");
  }
  
  try{
    const canvas = glfx.canvas();
    canvas.width = image.width;
    canvas.height = image.height;

    const texture = canvas.texture(image);
    canvas.draw(texture).perspective(srcPoints, points).update();
    texture.destroy();

    // 导出结果
    // const outputImg = new Image();
    // outputImg.src = canvas.toDataURL("image/png");
    // outputImg.onload = () => Promise.resolve(outputImg);
    // return outputImg;
    return canvas;
  }catch(e){
    console.error(e);
    throw e;
  }
}
