<script setup lang="ts">
import { ref, onMounted } from "vue";
import { createEffectPicture } from "./effectPictureWorker/effectPicture";
// import { createEffectPicture } from "./effectPicture/effectPicture";

const canvas = ref<HTMLCanvasElement>();


let lastTime = performance.now();
let frameCount = 0;
let isBlocking = false;

function checkFPS(currentTime: number) {
  // 每秒检测一次
  if (currentTime > lastTime + 1000) {
    const fps = Math.round(frameCount * 1000 / (currentTime - lastTime));

    if (fps < 30) { // 阈值建议30-50
      console.warn(`卡顿警告: FPS = ${fps}`);
      isBlocking = true;
    } else {
      isBlocking = false;
    }
    if (isBlocking) {
      console.log("卡顿中，暂停渲染");
    }
    frameCount = 0;
    lastTime = currentTime;
  }

  frameCount++;
  requestAnimationFrame(checkFPS);
}

requestAnimationFrame(checkFPS);

onMounted(async () => {
  const effectPicture = createEffectPicture({
    el: canvas.value as HTMLCanvasElement,
    width: 500,
    height: 500,
    name: "test",
    components: [
      {
        "src": "test/背景.png",
        "name": "背景",
        "type": "background",
        "index": 0
      },
      {
        "src": "test/正面.png",
        "name": "正面",
        "rotate": 0,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "position": {
          "x": 0,
          "y": 0
        },
        "type": "custom",
        "transform": {
          "srcPoints": null,
          "dstPoints": [
            0.0,
            0.0,
            500.0,
            0.0,
            500.0,
            500.0,
            0.0,
            500.0
          ]
        }
      },
      {
        "src": "test/右袖.png",
        "name": "右袖",
        "rotate": 0,
        "scaleX": 1.0019,
        "scaleY": 0.9993000000000001,
        "position": {
          "x": -36,
          "y": 3
        },
        "type": "custom",
        "warp": [
          [
            59.13830954994515,
            59.13830954994513
          ],
          [
            158.47071051020328,
            0.18307888359432822
          ],
          [
            5.495087074788501,
            7.323155343772093
          ],
          [
            302.82103613554267,
            3.450526959769447
          ],
          [
            42.692949488968395,
            155.35811282514436
          ],
          [
            165.2014961165848,
            166.11346993544458
          ],
          [
            134.9803215263417,
            168.50799132668698
          ],
          [
            141.30503637055025,
            197.38579140847025
          ],
          [
            100.89871317762947,
            304.83031780555115
          ],
          [
            185.0116100310235,
            344.73478466460983
          ],
          [
            169.45975738609684,
            307.7912522955871
          ],
          [
            251.02315510480094,
            353.00330690699883
          ],
          [
            -35.536754930395695,
            490.27403824176884
          ],
          [
            205.7708519717752,
            534.5584353521392
          ],
          [
            195.34650342455046,
            513.3665659661301
          ],
          [
            285.19276510545365,
            519.3261681348603
          ]
        ],
        "transform": {
          "srcPoints": null,
          "dstPoints": [
            -36.0,
            0.0,
            303.0,
            0.0,
            303.0,
            534.0,
            -36.0,
            534.0
          ]
        }
      },
      {
        "src": "test/左袖.png",
        "name": "左袖",
        "rotate": 0,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "position": {
          "x": 257,
          "y": -28
        },
        "type": "custom",
        "transform": {
          "srcPoints": null,
          "dstPoints": [
            274.24804837402746,
            71.07889613042005,
            395.5,
            -27.763739323227753,
            500.4799691233835,
            500.0,
            257.3838901648094,
            509.38050592565656
          ]
        }
      },
      {
        "src": "test/fg.png",
        "name": "fg",
        "type": "foreground",
        "index": 0,
        "opacity": 1
      }
    ]
  });


  // 直接合成显示白板图
  let startTimestamp = Date.now();
  await effectPicture.combine();
  effectPicture.showResult();
  console.log("白板图 showResult time:", Date.now() - startTimestamp, "ms");

  startTimestamp = Date.now();
  const img = new Image();
  img.src = "test/resource.png";
  img.onload = async () => {
    await effectPicture.renderAll([
      ['正面', img],
      ['右袖', img],
      ['左袖', img],
    ]);


    await effectPicture.combine();
    console.log("  combine  time:", Date.now() - startTimestamp, "ms");
    effectPicture.showResult();
  };
});

</script>

<template>
  <div>
    <h1>Hello Vue 3 + Vite!</h1>
    <div id="animBox"></div>
    <canvas ref="canvas" width="1000" height="1000"></canvas>
  </div>
</template>

<style scoped>
#animBox {
  width: 100px;
  height: 100px;
  background: red;
  position: absolute;
  left: 0;
  top: 100px;
  animation: move 3s linear infinite;
}

@keyframes move {
  to {
    left: calc(100% - 100px);
  }
}
</style>
