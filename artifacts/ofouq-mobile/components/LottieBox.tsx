import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

/**
 * LottieBox — plays a Lottie JSON animation using lottie-web inside a transparent
 * WebView. We go through the WebView (instead of the native lottie-react-native
 * module) on purpose: react-native-webview is ALREADY in the dev client, so the
 * owner's exact Lottie files render with NO native rebuild — and lottie-web is the
 * reference renderer, so it looks identical to the LottieFiles preview.
 *
 * `tile` repeats the animation across the width (a "fire wall" for the bar); each
 * copy is started at a different point in the loop so they flicker out of sync.
 * Imperative play()/stop()/reset() drive the icon (play 2s, then freeze).
 */
export type LottieBoxHandle = { play: () => void; stop: () => void; reset: () => void };

type Props = {
  data: unknown; // Lottie animation JSON object
  style?: StyleProp<ViewStyle>;
  loop?: boolean;
  autoplay?: boolean;
  restFrame?: number; // frame shown while paused (the resting pose)
  cover?: boolean; // true → fill/crop (bar), false → fit (icon)
  tile?: number; // horizontal copies
};

function buildHtml(data: unknown, loop: boolean, autoplay: boolean, restFrame: number, cover: boolean, tile: number) {
  const par = cover ? "xMidYMax slice" : "xMidYMid meet";
  const cells = Array.from({ length: tile }, (_, i) => `<div class="c" id="c${i}"></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}
#w{display:flex;width:100%;height:100%}.c{flex:1;height:100%;position:relative}</style>
<script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_svg.min.js"></script></head>
<body><div id="w">${cells}</div><script>
var DATA=${JSON.stringify(data)},TILE=${tile},LOOP=${loop},AUTO=${autoplay},REST=${restFrame},PAR=${JSON.stringify(par)};
var A=[];
function off(i){var tf=(A[i]&&A[i].totalFrames)||60;return Math.floor((i/Math.max(1,TILE))*tf);}
function pose(){for(var i=0;i<A.length;i++){if(AUTO){A[i].goToAndPlay(off(i),true);}else{A[i].goToAndStop(REST,true);}}}
function boot(){
  if(!window.lottie){return setTimeout(boot,40);}
  for(var i=0;i<TILE;i++){A.push(lottie.loadAnimation({container:document.getElementById('c'+i),renderer:'svg',loop:LOOP,autoplay:AUTO,animationData:DATA,rendererSettings:{preserveAspectRatio:PAR}}));}
  setTimeout(pose,30);
  window.__play=function(){for(var i=0;i<A.length;i++){A[i].goToAndPlay(off(i),true);}};
  window.__stop=function(){for(var i=0;i<A.length;i++){A[i].pause();}};
  window.__reset=function(){for(var i=0;i<A.length;i++){A[i].goToAndStop(REST,true);}};
}
boot();
</script></body></html>`;
}

const LottieBox = forwardRef<LottieBoxHandle, Props>(function LottieBox(
  { data, style, loop = true, autoplay = false, restFrame = 0, cover = false, tile = 1 },
  ref,
) {
  const web = useRef<WebView>(null);
  const html = useMemo(() => buildHtml(data, loop, autoplay, restFrame, cover, tile), [data, loop, autoplay, restFrame, cover, tile]);

  useImperativeHandle(ref, () => ({
    play: () => web.current?.injectJavaScript("window.__play&&window.__play();true;"),
    stop: () => web.current?.injectJavaScript("window.__stop&&window.__stop();true;"),
    reset: () => web.current?.injectJavaScript("window.__reset&&window.__reset();true;"),
  }));

  return (
    <View style={style} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html, baseUrl: "https://ofouq.local/" }}
        originWhitelist={["*"]}
        style={{ flex: 1, backgroundColor: "transparent" }}
        containerStyle={{ backgroundColor: "transparent" }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled
        mixedContentMode="always"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // `opaque` is a real iOS runtime prop (transparent background) missing from these types.
        {...({ opaque: false } as object)}
      />
    </View>
  );
});

export default LottieBox;
